import Redis, { Cluster } from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';
import { CircuitBreakers } from '../services/circuit-breaker';

// Redis connection options
const redisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  // Support Redis Cluster mode
  ...(config.redis.cluster ? {
    enableReadyCheck: true,
    maxRetriesPerRequest: null,
  } : {}),
};

// Main Redis client for general operations
// Use Cluster if cluster mode is enabled, otherwise use regular Redis client
const redis: Redis | Cluster = config.redis.cluster && config.redis.clusterNodes
  ? new Redis.Cluster(config.redis.clusterNodes, {
      redisOptions: {
        password: config.redis.password,
      },
      enableReadyCheck: true,
      maxRedirections: 3,
    })
  : new Redis(redisOptions);

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (error: Error) => {
  logger.error('Redis connection error:', error);
  // Circuit breaker will handle failures automatically
});

// Wrap Redis operations with circuit breaker
const wrapRedisOperation = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await CircuitBreakers.redis.execute(operation);
  } catch (error: any) {
    // If circuit breaker is open, throw with clearer message
    if (error.message?.includes('Circuit breaker is OPEN')) {
      logger.error('Redis circuit breaker is OPEN - service unavailable');
      throw new Error('Redis service temporarily unavailable. Please retry later.');
    }
    throw error;
  }
};

// Enhanced Redis client with circuit breaker
export const redisWithCircuitBreaker = {
  get: async (key: string) => wrapRedisOperation(() => redis.get(key)),
  set: async (key: string, value: string) => wrapRedisOperation(() => redis.set(key, value)),
  setex: async (key: string, seconds: number, value: string) => 
    wrapRedisOperation(() => redis.setex(key, seconds, value)),
  del: async (...keys: string[]) => wrapRedisOperation(() => redis.del(...keys)),
  exists: async (key: string) => wrapRedisOperation(() => redis.exists(key)),
  keys: async (pattern: string) => wrapRedisOperation(() => redis.keys(pattern)),
  ping: async () => wrapRedisOperation(() => redis.ping()),
  publish: async (channel: string, message: string) => 
    wrapRedisOperation(() => redis.publish(channel, message)),
  sadd: async (key: string, ...members: (string | number)[]) => 
    wrapRedisOperation(() => redis.sadd(key, ...members)),
  srem: async (key: string, ...members: (string | number)[]) => 
    wrapRedisOperation(() => redis.srem(key, ...members)),
  smembers: async (key: string) => wrapRedisOperation(() => redis.smembers(key)),
  scard: async (key: string) => wrapRedisOperation(() => redis.scard(key)),
  // For compatibility, also expose the underlying client
  _client: redis,
};

// Create separate Redis clients for Socket.io adapter (pub/sub)
// These are needed because Socket.io adapter requires separate pub/sub clients
const createAdapterClients = () => {
  const pubClient: Redis | Cluster = config.redis.cluster && config.redis.clusterNodes
    ? new Redis.Cluster(config.redis.clusterNodes, {
        redisOptions: {
          password: config.redis.password,
        },
        enableReadyCheck: true,
        maxRedirections: 3,
      })
    : new Redis(redisOptions);

  const subClient: Redis | Cluster = config.redis.cluster && config.redis.clusterNodes
    ? new Redis.Cluster(config.redis.clusterNodes, {
        redisOptions: {
          password: config.redis.password,
        },
        enableReadyCheck: true,
        maxRedirections: 3,
      })
    : new Redis(redisOptions);

  pubClient.on('error', (error: Error) => {
    logger.error('Redis pub client error:', error);
  });

  subClient.on('error', (error: Error) => {
    logger.error('Redis sub client error:', error);
  });

  pubClient.on('connect', () => {
    logger.info('Redis pub client connected');
  });

  subClient.on('connect', () => {
    logger.info('Redis sub client connected');
  });

  return { pubClient, subClient };
};

export default redis;
export { createAdapterClients };

