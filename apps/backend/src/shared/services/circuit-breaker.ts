import { logger } from '../utils/logger';

/**
 * Circuit Breaker States
 */
export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

/**
 * Circuit Breaker Configuration
 */
export interface CircuitBreakerOptions {
  failureThreshold: number;      // Number of failures before opening
  resetTimeout: number;            // Time in ms before attempting half-open
  successThreshold: number;        // Successes needed in half-open to close
  timeout: number;                // Operation timeout in ms
  name?: string;                  // Circuit breaker name for logging
}

/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by stopping requests to failing services
 */
export class CircuitBreaker<T = any> {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;

  constructor(private options: CircuitBreakerOptions) {
    if (!options.name) {
      options.name = 'CircuitBreaker';
    }
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute(operation: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      const now = Date.now();
      if (now < this.nextAttemptTime) {
        const waitTime = Math.ceil((this.nextAttemptTime - now) / 1000);
        logger.warn(`${this.options.name}: Circuit is OPEN, rejecting request. Retry in ${waitTime}s`);
        throw new Error(`Circuit breaker is OPEN. Service unavailable. Retry in ${waitTime}s`);
      }

      // Transition to half-open
      this.state = CircuitState.HALF_OPEN;
      this.successes = 0;
      logger.info(`${this.options.name}: Circuit transitioning to HALF_OPEN, testing service`);
    }

    // Execute operation with timeout
    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Operation timed out after ${this.options.timeout}ms`));
          }, this.options.timeout);
        }),
      ]);

      // Operation succeeded
      this.onSuccess();
      return result;
    } catch (error) {
      // Operation failed
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.failures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      logger.debug(`${this.options.name}: Success in HALF_OPEN state (${this.successes}/${this.options.successThreshold})`);

      if (this.successes >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED;
        logger.info(`${this.options.name}: Circuit CLOSED after successful recovery`);
      }
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during half-open, immediately open circuit
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.options.resetTimeout;
      logger.warn(`${this.options.name}: Circuit OPENED after failure in HALF_OPEN state`);
    } else if (this.state === CircuitState.CLOSED) {
      // Check if threshold reached
      if (this.failures >= this.options.failureThreshold) {
        this.state = CircuitState.OPEN;
        this.nextAttemptTime = Date.now() + this.options.resetTimeout;
        logger.error(
          `${this.options.name}: Circuit OPENED after ${this.failures} failures. ` +
          `Will retry after ${this.options.resetTimeout}ms`
        );
      }
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  /**
   * Manually reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
    logger.info(`${this.options.name}: Circuit manually reset to CLOSED`);
  }
}

/**
 * Pre-configured circuit breakers for common services
 */
export class CircuitBreakers {
  // Redis circuit breaker
  static redis = new CircuitBreaker({
    name: 'Redis',
    failureThreshold: 5,
    resetTimeout: 30000,  // 30 seconds
    successThreshold: 2,
    timeout: 5000,        // 5 seconds
  });

  // Database circuit breaker
  static database = new CircuitBreaker({
    name: 'Database',
    failureThreshold: 5,
    resetTimeout: 30000,  // 30 seconds
    successThreshold: 2,
    timeout: 10000,       // 10 seconds
  });

  /**
   * Reset all circuit breakers
   */
  static resetAll(): void {
    this.redis.reset();
    this.database.reset();
  }
}

