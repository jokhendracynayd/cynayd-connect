import { Consumer } from 'mediasoup/node/lib/types';
import { logger } from '../shared/utils/logger';
import { RedisStateService } from '../shared/services/state.redis';

export class ConsumerManager {
  private static consumers: Map<string, Consumer[]> = new Map();
  // Store consumer metadata
  private static consumerMetadata: Map<string, { socketId: string; producerId: string; kind: 'audio' | 'video' }> = new Map();

  static async addConsumer(
    socketId: string,
    consumer: Consumer,
    producerId: string
  ): Promise<void> {
    const socketConsumers = this.consumers.get(socketId) || [];
    socketConsumers.push(consumer);
    this.consumers.set(socketId, socketConsumers);

    // Store metadata locally and in Redis
    const metadata = { socketId, producerId, kind: consumer.kind };
    this.consumerMetadata.set(consumer.id, metadata);
    
    try {
      await RedisStateService.storeConsumerMetadata(
        consumer.id,
        socketId,
        producerId,
        consumer.kind
      );
    } catch (error) {
      logger.error(`Failed to store consumer metadata in Redis: ${consumer.id}`, error);
      // Continue without Redis - graceful degradation
    }

    consumer.on('transportclose', async () => {
      logger.debug(`Consumer ${consumer.id} transport closed`);
      await this.removeConsumer(socketId, consumer.id);
    });

    consumer.on('producerclose', async () => {
      logger.debug(`Consumer ${consumer.id} producer closed`);
      consumer.close();
      await this.removeConsumer(socketId, consumer.id);
    });

    logger.debug(`Consumer added: ${consumer.id} (${consumer.kind})`);
  }

  static getConsumers(socketId: string): Consumer[] {
    return this.consumers.get(socketId) || [];
  }

  static async closeConsumer(socketId: string, consumerId: string): Promise<void> {
    const consumers = this.consumers.get(socketId) || [];
    const consumer = consumers.find(c => c.id === consumerId);
    
    if (consumer) {
      consumer.close();
      await this.removeConsumer(socketId, consumerId);
      logger.debug(`Consumer closed: ${consumerId}`);
    } else {
      // Consumer might not be in local memory (could be on another server)
      const metadata = this.consumerMetadata.get(consumerId);
      if (metadata) {
        await this.removeConsumer(metadata.socketId, consumerId);
        logger.debug(`Consumer metadata removed (was on another server): ${consumerId}`);
      }
    }
  }

  static async closeAllConsumers(socketId: string): Promise<void> {
    const consumers = this.consumers.get(socketId) || [];
    
    // Clean up all consumers for this socket
    const cleanupPromises = consumers.map(async (consumer) => {
      const metadata = this.consumerMetadata.get(consumer.id);
      consumer.close();
      if (metadata) {
        try {
          await RedisStateService.removeConsumerMetadata(consumer.id, socketId);
        } catch (error) {
          logger.error(`Failed to remove consumer metadata from Redis: ${consumer.id}`, error);
        }
      }
    });
    
    await Promise.all(cleanupPromises);
    
    // Remove from local storage
    consumers.forEach(c => {
      this.consumerMetadata.delete(c.id);
    });
    this.consumers.delete(socketId);
    
    logger.debug(`Closed all consumers for socket ${socketId}`);
  }

  private static async removeConsumer(socketId: string, consumerId: string): Promise<void> {
    const consumers = this.consumers.get(socketId) || [];
    const filtered = consumers.filter(c => c.id !== consumerId);
    this.consumers.set(socketId, filtered);
    
    // Remove metadata
    const metadata = this.consumerMetadata.get(consumerId);
    if (metadata) {
      this.consumerMetadata.delete(consumerId);
      
      try {
        await RedisStateService.removeConsumerMetadata(consumerId, socketId);
      } catch (error) {
        logger.error(`Failed to remove consumer metadata from Redis: ${consumerId}`, error);
      }
    }
  }

  static getStats() {
    let totalConsumers = 0;
    this.consumers.forEach((consumers) => {
      totalConsumers += consumers.length;
    });
    return {
      totalSockets: this.consumers.size,
      totalConsumers,
    };
  }
}

