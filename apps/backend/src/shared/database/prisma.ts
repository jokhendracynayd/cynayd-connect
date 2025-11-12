import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { config } from '../config';
import { CircuitBreakers } from '../services/circuit-breaker';

/**
 * Prisma Client with connection pooling and retry logic
 * 
 * Connection Pooling:
 * - Use connection_limit in DATABASE_URL for connection pool size
 * - Recommended: connection_limit=10-20 for most applications
 * - For high-scale: Use PgBouncer or similar connection pooler
 * 
 * Retry Logic:
 * - Automatic retry for transient errors (connection issues, deadlocks)
 * - Exponential backoff with jitter
 */
// Prisma Client automatically reads DATABASE_URL from environment
// No need to explicitly set datasources unless overriding
const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' },
    { level: 'warn', emit: 'stdout' },
  ],
  errorFormat: 'pretty',
});

// Query logging (only in development)
if (config.env === 'development') {
  prisma.$on('query', (e: Prisma.QueryEvent) => {
    // logger.debug(`Query: ${e.query}`);
    // logger.debug(`Duration: ${e.duration}ms`);
    if (e.duration > 1000) {
      // logger.warn(`Slow query detected: ${e.duration}ms`);
    }
  });
}

/**
 * Retry wrapper for Prisma operations
 * Implements exponential backoff with jitter for transient errors
 * Wrapped with circuit breaker protection
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 100
): Promise<T> {
  // Wrap with circuit breaker first
  return CircuitBreakers.database.execute(async () => {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Don't retry on certain error types
        if (
          error?.code === 'P2002' || // Unique constraint violation
          error?.code === 'P2025' || // Record not found
          error?.code?.startsWith('P1') // Client/validation errors
        ) {
          throw error;
        }

        // Check if we should retry
        if (attempt === maxRetries) {
          logger.error(`Database operation failed after ${maxRetries} retries`, error);
          throw error;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
        
        logger.warn(
          `Database operation failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay.toFixed(0)}ms`,
          { error: error?.message, code: error?.code }
        );

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Database operation failed');
  });
}

/**
 * Prisma query timeout wrapper
 */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number = 30000
): Promise<T> {
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Database operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

/**
 * Enhanced Prisma client with automatic retry and timeout
 */
export const prismaWithRetry = {
  ...prisma,
  
  // Wrap common operations with retry logic
  $transaction: async <T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }
  ): Promise<T> => {
    return withRetry(() => prisma.$transaction(fn, options));
  },

  // Add query timeout for long-running operations
  queryRaw: async <T = any>(query: Prisma.Sql, options?: { timeout?: number }): Promise<T> => {
    const timeout = options?.timeout || 30000;
    return withTimeout(prisma.$queryRaw(query), timeout);
  },
};

// Handle connection errors gracefully
prisma.$on('error' as never, (e: Prisma.LogEvent) => {
  logger.error('Prisma error:', e);
  
  // In production, you might want to:
  // - Send error to monitoring service (Sentry, DataDog, etc.)
  // - Alert on critical errors
  // - Implement circuit breaker pattern
});

// Graceful shutdown
process.on('beforeExit', async () => {
  logger.info('Disconnecting Prisma...');
  await prisma.$disconnect();
});

export default prisma;

