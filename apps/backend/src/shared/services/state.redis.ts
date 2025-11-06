import { redisWithCircuitBreaker as redis } from '../database/redis';
import { logger } from '../utils/logger';
import { config } from '../config';

/**
 * Redis-backed state management service
 * Stores metadata about Producers, Consumers, Transports, and Routers
 * for cross-server discovery in horizontal scaling setup.
 * 
 * Note: Actual Mediasoup objects stay in memory, but their metadata
 * (IDs, mappings, ownership) is stored in Redis.
 */
export class RedisStateService {
  private static readonly KEY_PREFIX = 'connect:state';
  private static readonly TTL_SECONDS = 3600; // 1 hour default TTL

  // Producer metadata storage
  static async storeProducerMetadata(
    producerId: string,
    socketId: string,
    roomId: string,
    userId: string,
    kind: 'audio' | 'video',
    source: 'microphone' | 'camera' | 'screen' | 'data' | 'unknown',
    serverInstanceId?: string
  ): Promise<void> {
    const key = `${this.KEY_PREFIX}:producer:${producerId}`;
    const metadata = {
      producerId,
      socketId,
      roomId,
      userId,
      kind,
      source,
      serverInstanceId: serverInstanceId || config.server.instanceId,
      createdAt: Date.now(),
    };

    await redis.setex(key, this.TTL_SECONDS, JSON.stringify(metadata));
    
    // Also maintain socket -> producers mapping
    await redis.sadd(`${this.KEY_PREFIX}:socket:${socketId}:producers`, producerId);
    
    // Maintain room -> producers mapping
    await redis.sadd(`${this.KEY_PREFIX}:room:${roomId}:producers`, producerId);
    
    logger.debug(`Stored producer metadata in Redis: ${producerId}`);
  }

  static async getProducerMetadata(producerId: string): Promise<{
    producerId: string;
    socketId: string;
    roomId: string;
    userId: string;
    kind: 'audio' | 'video';
    source: 'microphone' | 'camera' | 'screen' | 'data' | 'unknown';
    serverInstanceId: string;
    createdAt: number;
  } | null> {
    const key = `${this.KEY_PREFIX}:producer:${producerId}`;
    const data = await redis.get(key);
    
    if (!data) return null;
    
    return JSON.parse(data);
  }

  static async removeProducerMetadata(producerId: string, socketId: string, roomId: string): Promise<void> {
    const key = `${this.KEY_PREFIX}:producer:${producerId}`;
    await redis.del(key);
    
    // Remove from socket mapping
    await redis.srem(`${this.KEY_PREFIX}:socket:${socketId}:producers`, producerId);
    
    // Remove from room mapping
    await redis.srem(`${this.KEY_PREFIX}:room:${roomId}:producers`, producerId);
    
    logger.debug(`Removed producer metadata from Redis: ${producerId}`);
  }

  static async getSocketProducers(socketId: string): Promise<string[]> {
    const key = `${this.KEY_PREFIX}:socket:${socketId}:producers`;
    return redis.smembers(key);
  }

  static async getRoomProducers(roomId: string): Promise<string[]> {
    const key = `${this.KEY_PREFIX}:room:${roomId}:producers`;
    return redis.smembers(key);
  }

  // Consumer metadata storage
  static async storeConsumerMetadata(
    consumerId: string,
    socketId: string,
    producerId: string,
    kind: 'audio' | 'video',
    serverInstanceId?: string
  ): Promise<void> {
    const key = `${this.KEY_PREFIX}:consumer:${consumerId}`;
    const metadata = {
      consumerId,
      socketId,
      producerId,
      kind,
      serverInstanceId: serverInstanceId || config.server.instanceId,
      createdAt: Date.now(),
    };

    await redis.setex(key, this.TTL_SECONDS, JSON.stringify(metadata));
    
    // Maintain socket -> consumers mapping
    await redis.sadd(`${this.KEY_PREFIX}:socket:${socketId}:consumers`, consumerId);
    
    logger.debug(`Stored consumer metadata in Redis: ${consumerId}`);
  }

  static async getConsumerMetadata(consumerId: string): Promise<{
    consumerId: string;
    socketId: string;
    producerId: string;
    kind: 'audio' | 'video';
    serverInstanceId: string;
    createdAt: number;
  } | null> {
    const key = `${this.KEY_PREFIX}:consumer:${consumerId}`;
    const data = await redis.get(key);
    
    if (!data) return null;
    
    return JSON.parse(data);
  }

  static async removeConsumerMetadata(consumerId: string, socketId: string): Promise<void> {
    const key = `${this.KEY_PREFIX}:consumer:${consumerId}`;
    await redis.del(key);
    
    // Remove from socket mapping
    await redis.srem(`${this.KEY_PREFIX}:socket:${socketId}:consumers`, consumerId);
    
    logger.debug(`Removed consumer metadata from Redis: ${consumerId}`);
  }

  static async getSocketConsumers(socketId: string): Promise<string[]> {
    const key = `${this.KEY_PREFIX}:socket:${socketId}:consumers`;
    return redis.smembers(key);
  }

  // Transport metadata storage
  static async storeTransportMetadata(
    transportId: string,
    socketId: string,
    roomId: string,
    isProducer: boolean,
    serverInstanceId?: string
  ): Promise<void> {
    const key = `${this.KEY_PREFIX}:transport:${transportId}`;
    const metadata = {
      transportId,
      socketId,
      roomId,
      isProducer,
      serverInstanceId: serverInstanceId || config.server.instanceId,
      createdAt: Date.now(),
    };

    await redis.setex(key, this.TTL_SECONDS, JSON.stringify(metadata));
    
    // Maintain socket -> transports mapping
    await redis.sadd(`${this.KEY_PREFIX}:socket:${socketId}:transports`, transportId);
    
    logger.debug(`Stored transport metadata in Redis: ${transportId}`);
  }

  static async getTransportMetadata(transportId: string): Promise<{
    transportId: string;
    socketId: string;
    roomId: string;
    isProducer: boolean;
    serverInstanceId: string;
    createdAt: number;
  } | null> {
    const key = `${this.KEY_PREFIX}:transport:${transportId}`;
    const data = await redis.get(key);
    
    if (!data) return null;
    
    return JSON.parse(data);
  }

  static async removeTransportMetadata(transportId: string, socketId: string): Promise<void> {
    const key = `${this.KEY_PREFIX}:transport:${transportId}`;
    await redis.del(key);
    
    // Remove from socket mapping
    await redis.srem(`${this.KEY_PREFIX}:socket:${socketId}:transports`, transportId);
    
    logger.debug(`Removed transport metadata from Redis: ${transportId}`);
  }

  static async getSocketTransports(socketId: string): Promise<string[]> {
    const key = `${this.KEY_PREFIX}:socket:${socketId}:transports`;
    return redis.smembers(key);
  }

  // Router metadata storage (room -> server mapping)
  static async storeRouterMetadata(
    roomId: string,
    routerId: string,
    serverInstanceId?: string
  ): Promise<void> {
    const key = `${this.KEY_PREFIX}:router:${roomId}`;
    const metadata = {
      roomId,
      routerId,
      serverInstanceId: serverInstanceId || config.server.instanceId,
      createdAt: Date.now(),
    };

    await redis.setex(key, this.TTL_SECONDS * 24, JSON.stringify(metadata)); // 24 hours for routers
    
    logger.debug(`Stored router metadata in Redis: ${roomId} -> ${routerId}`);
  }

  static async getRouterMetadata(roomId: string): Promise<{
    roomId: string;
    routerId: string;
    serverInstanceId: string;
    createdAt: number;
  } | null> {
    const key = `${this.KEY_PREFIX}:router:${roomId}`;
    const data = await redis.get(key);
    
    if (!data) return null;
    
    return JSON.parse(data);
  }

  static async removeRouterMetadata(roomId: string): Promise<void> {
    const key = `${this.KEY_PREFIX}:router:${roomId}`;
    await redis.del(key);
    
    logger.debug(`Removed router metadata from Redis: ${roomId}`);
  }

  // Cleanup all state for a socket (called on disconnect)
  static async cleanupSocketState(socketId: string): Promise<void> {
    try {
      // Get all associated IDs
      const producerIds = await this.getSocketProducers(socketId);
      const consumerIds = await this.getSocketConsumers(socketId);
      const transportIds = await this.getSocketTransports(socketId);

      // Remove all metadata
      if (producerIds.length > 0) {
        for (const producerId of producerIds) {
          const metadata = await this.getProducerMetadata(producerId);
          if (metadata) {
            await this.removeProducerMetadata(producerId, socketId, metadata.roomId);
          }
        }
      }

      if (consumerIds.length > 0) {
        for (const consumerId of consumerIds) {
          await this.removeConsumerMetadata(consumerId, socketId);
        }
      }

      if (transportIds.length > 0) {
        for (const transportId of transportIds) {
          await this.removeTransportMetadata(transportId, socketId);
        }
      }

      // Clean up socket mapping sets
      await redis.del(`${this.KEY_PREFIX}:socket:${socketId}:producers`);
      await redis.del(`${this.KEY_PREFIX}:socket:${socketId}:consumers`);
      await redis.del(`${this.KEY_PREFIX}:socket:${socketId}:transports`);
      
      logger.debug(`Cleaned up all state for socket: ${socketId}`);
    } catch (error) {
      logger.error(`Error cleaning up socket state for ${socketId}:`, error);
    }
  }

  // Get all producers in a room (cross-server)
  static async getAllRoomProducers(roomId: string): Promise<Array<{
    producerId: string;
    socketId: string;
    userId: string;
    kind: 'audio' | 'video';
    serverInstanceId: string;
  }>> {
    const producerIds = await this.getRoomProducers(roomId);
    const producers: Array<{
      producerId: string;
      socketId: string;
      userId: string;
      kind: 'audio' | 'video';
      serverInstanceId: string;
    }> = [];

    for (const producerId of producerIds) {
      const metadata = await this.getProducerMetadata(producerId);
      if (metadata) {
        producers.push({
          producerId: metadata.producerId,
          socketId: metadata.socketId,
          userId: metadata.userId,
          kind: metadata.kind,
          serverInstanceId: metadata.serverInstanceId,
        });
      }
    }

    return producers;
  }
}

