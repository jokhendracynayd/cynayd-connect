import { Socket } from 'socket.io';
import redis from '../database/redis';
import { logger } from './logger';

interface RateLimitOptions {
  maxConnections: number;
  windowMs: number;
  maxEventsPerWindow: number;
  eventWindowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

// Parse time window string (e.g., "15 minutes", "1 hour") to milliseconds
export function parseTimeWindow(timeWindow: string): number {
  const parts = timeWindow.trim().toLowerCase().split(' ');
  const value = parseInt(parts[0], 10);
  const unit = parts[1] || 'minutes';

  const multipliers: Record<string, number> = {
    second: 1000,
    seconds: 1000,
    minute: 60 * 1000,
    minutes: 60 * 1000,
    hour: 60 * 60 * 1000,
    hours: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
  };

  return value * (multipliers[unit] || 60 * 1000);
}

// Default rate limit options
const defaultOptions: RateLimitOptions = {
  maxConnections: parseInt(process.env.SOCKET_RATE_LIMIT_MAX_CONNECTIONS || '10', 10),
  windowMs: parseTimeWindow(process.env.SOCKET_RATE_LIMIT_CONNECTION_WINDOW || '1 minute'),
  maxEventsPerWindow: parseInt(process.env.SOCKET_RATE_LIMIT_MAX_EVENTS || '100', 10),
  eventWindowMs: parseTimeWindow(process.env.SOCKET_RATE_LIMIT_EVENT_WINDOW || '15 minutes'),
};

/**
 * Check connection rate limit for a socket
 * Uses sliding window algorithm with Redis
 */
export async function checkConnectionRateLimit(
  socket: Socket,
  options: Partial<RateLimitOptions> = {}
): Promise<RateLimitResult> {
  const opts = { ...defaultOptions, ...options };
  const clientIp = socket.handshake.address || socket.request.socket.remoteAddress || 'unknown';
  const key = `socket:rate-limit:connection:${clientIp}`;

  try {
    const current = await redis.incr(key);
    
    // Set expiration on first request
    if (current === 1) {
      await redis.pexpire(key, opts.windowMs);
    }

    const ttl = await redis.pttl(key);
    const remaining = Math.max(0, opts.maxConnections - current);
    const resetTime = Date.now() + (ttl > 0 ? ttl : opts.windowMs);

    return {
      allowed: current <= opts.maxConnections,
      remaining,
      resetTime,
    };
  } catch (error) {
    logger.error('Redis rate limit check failed:', error);
    // On Redis failure, allow connection (fail open)
    return {
      allowed: true,
      remaining: opts.maxConnections,
      resetTime: Date.now() + opts.windowMs,
    };
  }
}

/**
 * Check event rate limit for a socket
 * Tracks number of events emitted per window
 */
export async function checkEventRateLimit(
  socket: Socket,
  eventName: string,
  options: Partial<RateLimitOptions> = {}
): Promise<RateLimitResult> {
  const opts = { ...defaultOptions, ...options };
  const clientIp = socket.handshake.address || socket.request.socket.remoteAddress || 'unknown';
  const userId = socket.data?.userId || 'anonymous';
  // Use both IP and userId for more accurate tracking
  const key = `socket:rate-limit:event:${clientIp}:${userId}:${eventName}`;

  try {
    const current = await redis.incr(key);
    
    // Set expiration on first request
    if (current === 1) {
      await redis.pexpire(key, opts.eventWindowMs);
    }

    const ttl = await redis.pttl(key);
    const remaining = Math.max(0, opts.maxEventsPerWindow - current);
    const resetTime = Date.now() + (ttl > 0 ? ttl : opts.eventWindowMs);

    return {
      allowed: current <= opts.maxEventsPerWindow,
      remaining,
      resetTime,
    };
  } catch (error) {
    logger.error('Redis event rate limit check failed:', error);
    // On Redis failure, allow event (fail open)
    return {
      allowed: true,
      remaining: opts.maxEventsPerWindow,
      resetTime: Date.now() + opts.eventWindowMs,
    };
  }
}

/**
 * Socket.io middleware for connection rate limiting
 */
export function createConnectionRateLimitMiddleware(options?: Partial<RateLimitOptions>) {
  return async (socket: Socket, next: (err?: Error) => void) => {
    try {
      const result = await checkConnectionRateLimit(socket, options);
      
      if (!result.allowed) {
        const clientIp = socket.handshake.address || socket.request.socket.remoteAddress || 'unknown';
        logger.warn(`Connection rate limit exceeded for IP: ${clientIp}`, {
          socketId: socket.id,
          remaining: result.remaining,
          resetTime: new Date(result.resetTime).toISOString(),
        });
        return next(new Error('Too many connections. Please try again later.'));
      }

      // Store rate limit info in socket data for potential use
      socket.data.rateLimit = {
        connectionRemaining: result.remaining,
        connectionResetTime: result.resetTime,
      };

      next();
    } catch (error) {
      logger.error('Rate limit middleware error:', error);
      // On error, allow connection (fail open)
      next();
    }
  };
}

/**
 * Wrapper for socket event handlers to add per-event rate limiting
 */
export function withEventRateLimit<T extends any[]>(
  handler: (socket: Socket, ...args: T) => void | Promise<void>,
  eventName: string,
  options?: Partial<RateLimitOptions>
) {
  return async (socket: Socket, ...args: T) => {
    try {
      const result = await checkEventRateLimit(socket, eventName, options);
      
      if (!result.allowed) {
        logger.warn(`Event rate limit exceeded for event: ${eventName}`, {
          socketId: socket.id,
          userId: socket.data?.userId,
          remaining: result.remaining,
          resetTime: new Date(result.resetTime).toISOString(),
        });
        socket.emit('error', {
          type: 'RATE_LIMIT_EXCEEDED',
          message: `Too many ${eventName} events. Please slow down.`,
          resetTime: result.resetTime,
        });
        return;
      }

      // Call the original handler
      await handler(socket, ...args);
    } catch (error) {
      logger.error(`Error in rate-limited handler for ${eventName}:`, error);
      socket.emit('error', {
        type: 'HANDLER_ERROR',
        message: 'An error occurred processing your request.',
      });
    }
  };
}

