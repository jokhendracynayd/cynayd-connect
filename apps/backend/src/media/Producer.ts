import { Producer } from 'mediasoup/node/lib/types';
import { logger } from '../shared/utils/logger';

export class ProducerManager {
  private static producers: Map<string, Producer[]> = new Map();

  static addProducer(socketId: string, producer: Producer) {
    const socketProducers = this.producers.get(socketId) || [];
    socketProducers.push(producer);
    this.producers.set(socketId, socketProducers);

    producer.on('transportclose', () => {
      logger.debug(`Producer ${producer.id} transport closed`);
      this.removeProducer(socketId, producer.id);
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
    for (const [socketId, producers] of this.producers.entries()) {
      const producer = producers.find(p => p.id === producerId);
      if (producer) {
        return { socketId, producer };
      }
    }
    return null;
  }

  static closeProducer(socketId: string, producerId: string) {
    const producers = this.producers.get(socketId) || [];
    const producer = producers.find(p => p.id === producerId);
    
    if (producer) {
      producer.close();
      this.removeProducer(socketId, producerId);
      logger.debug(`Producer closed: ${producerId}`);
    }
  }

  static closeAllProducers(socketId: string) {
    const producers = this.producers.get(socketId) || [];
    producers.forEach(p => p.close());
    this.producers.delete(socketId);
    logger.debug(`Closed all producers for socket ${socketId}`);
  }

  private static removeProducer(socketId: string, producerId: string) {
    const producers = this.producers.get(socketId) || [];
    const filtered = producers.filter(p => p.id !== producerId);
    this.producers.set(socketId, filtered);
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

