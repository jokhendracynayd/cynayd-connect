import { Producer } from 'mediasoup/node/lib/types';
import { logger } from '../shared/utils/logger';
import { RedisStateService } from '../shared/services/state.redis';

type ProducerSource = 'microphone' | 'camera' | 'screen' | 'data' | 'unknown';

export class ProducerManager {
  private static producers: Map<string, Producer[]> = new Map();
  // Store producer metadata (producerId -> { socketId, roomId, userId, kind, source })
  private static producerMetadata: Map<string, { socketId: string; roomId: string; userId: string; kind: 'audio' | 'video'; source: ProducerSource }> = new Map();

  static async addProducer(
    socketId: string,
    producer: Producer,
    roomId: string,
    userId: string
  ): Promise<void> {
    const socketProducers = this.producers.get(socketId) || [];
    socketProducers.push(producer);
    this.producers.set(socketId, socketProducers);

    // Store metadata locally and in Redis
    const source = (producer.appData?.source as ProducerSource | undefined) ?? (producer.kind === 'audio' ? 'microphone' : 'camera');

    const metadata = { socketId, roomId, userId, kind: producer.kind, source };
    this.producerMetadata.set(producer.id, metadata);
    
    try {
      await RedisStateService.storeProducerMetadata(
        producer.id,
        socketId,
        roomId,
        userId,
        producer.kind,
        source
      );
    } catch (error) {
      logger.error(`Failed to store producer metadata in Redis: ${producer.id}`, error);
      // Continue without Redis - graceful degradation
    }

    producer.on('transportclose', async () => {
      logger.debug(`Producer ${producer.id} transport closed`);
      await this.removeProducer(socketId, producer.id);
    });

    logger.debug(`Producer added: ${producer.id} (${producer.kind})`);
  }

  static getProducers(socketId: string): Producer[] {
    return this.producers.get(socketId) || [];
  }

  static getAllProducers(): Producer[] {
    const allProducers: Producer[] = [];
    this.producers.forEach((producers) => {
      allProducers.push(...producers);
    });
    return allProducers;
  }

  static getProducerById(producerId: string): { socketId: string; producer: Producer } | null {
    // First try local memory
    for (const [socketId, producers] of this.producers.entries()) {
      const producer = producers.find(p => p.id === producerId);
      if (producer) {
        return { socketId, producer };
      }
    }
    
    // If not found locally, check metadata (for cross-server scenarios)
    const metadata = this.producerMetadata.get(producerId);
    if (metadata) {
      // Producer exists on another server - return metadata only
      logger.debug(`Producer ${producerId} found in metadata but not in local memory (likely on another server)`);
      // Return null since we can't access the actual producer object cross-server
      // The caller should use Socket.io to communicate with the owning server
    }
    
    return null;
  }

  static getProducerMetadata(producerId: string): { socketId: string; roomId: string; userId: string; kind: 'audio' | 'video'; source: ProducerSource } | null {
    return this.producerMetadata.get(producerId) || null;
  }

  static async closeProducer(socketId: string, producerId: string): Promise<void> {
    const producers = this.producers.get(socketId) || [];
    const producer = producers.find(p => p.id === producerId);
    
    if (producer) {
      producer.close();
      await this.removeProducer(socketId, producerId);
      logger.debug(`Producer closed: ${producerId}`);
    } else {
      // Producer might not be in local memory (could be on another server)
      // Still try to clean up metadata
      const metadata = this.producerMetadata.get(producerId);
      if (metadata) {
        await this.removeProducer(metadata.socketId, producerId);
        logger.debug(`Producer metadata removed (was on another server): ${producerId}`);
      }
    }
  }

  static async closeAllProducers(socketId: string): Promise<void> {
    const producers = this.producers.get(socketId) || [];
    
    // Clean up all producers for this socket
    const cleanupPromises = producers.map(async (producer) => {
      const metadata = this.producerMetadata.get(producer.id);
      producer.close();
      if (metadata) {
        try {
          await RedisStateService.removeProducerMetadata(
            producer.id,
            socketId,
            metadata.roomId
          );
        } catch (error) {
          logger.error(`Failed to remove producer metadata from Redis: ${producer.id}`, error);
        }
      }
    });
    
    await Promise.all(cleanupPromises);
    
    // Remove from local storage
    producers.forEach(p => {
      this.producerMetadata.delete(p.id);
    });
    this.producers.delete(socketId);
    
    logger.debug(`Closed all producers for socket ${socketId}`);
  }

  private static async removeProducer(socketId: string, producerId: string): Promise<void> {
    const producers = this.producers.get(socketId) || [];
    const filtered = producers.filter(p => p.id !== producerId);
    this.producers.set(socketId, filtered);
    
    // Remove metadata
    const metadata = this.producerMetadata.get(producerId);
    if (metadata) {
      this.producerMetadata.delete(producerId);
      
      try {
        await RedisStateService.removeProducerMetadata(producerId, socketId, metadata.roomId);
      } catch (error) {
        logger.error(`Failed to remove producer metadata from Redis: ${producerId}`, error);
      }
    }
  }

  static getProducerByKind(socketId: string, kind: 'audio' | 'video'): Producer | null {
    const producers = this.producers.get(socketId) || [];
    return producers.find(p => p.kind === kind) || null;
  }

  static pauseProducerByKind(socketId: string, kind: 'audio' | 'video'): boolean {
    const producer = this.getProducerByKind(socketId, kind);
    if (producer) {
      producer.pause();
      logger.debug(`Producer paused: ${producer.id} (${kind})`);
      return true;
    }
    return false;
  }

  static resumeProducerByKind(socketId: string, kind: 'audio' | 'video'): boolean {
    const producer = this.getProducerByKind(socketId, kind);
    if (producer) {
      producer.resume();
      logger.debug(`Producer resumed: ${producer.id} (${kind})`);
      return true;
    }
    return false;
  }

  static getStats() {
    return {
      totalSockets: this.producers.size,
      totalProducers: this.getAllProducers().length,
    };
  }
}

