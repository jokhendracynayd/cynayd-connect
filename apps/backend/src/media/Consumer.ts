import { Consumer } from 'mediasoup/node/lib/types';
import { logger } from '../shared/utils/logger';

export class ConsumerManager {
  private static consumers: Map<string, Consumer[]> = new Map();

  static addConsumer(socketId: string, consumer: Consumer) {
    const socketConsumers = this.consumers.get(socketId) || [];
    socketConsumers.push(consumer);
    this.consumers.set(socketId, socketConsumers);

    consumer.on('transportclose', () => {
      logger.debug(`Consumer ${consumer.id} transport closed`);
      this.removeConsumer(socketId, consumer.id);
    });

    consumer.on('producerclose', () => {
      logger.debug(`Consumer ${consumer.id} producer closed`);
      consumer.close();
      this.removeConsumer(socketId, consumer.id);
    });

    logger.debug(`Consumer added: ${consumer.id} (${consumer.kind})`);
  }

  static getConsumers(socketId: string): Consumer[] {
    return this.consumers.get(socketId) || [];
  }

  static closeConsumer(socketId: string, consumerId: string) {
    const consumers = this.consumers.get(socketId) || [];
    const consumer = consumers.find(c => c.id === consumerId);
    
    if (consumer) {
      consumer.close();
      this.removeConsumer(socketId, consumerId);
      logger.debug(`Consumer closed: ${consumerId}`);
    }
  }

  static closeAllConsumers(socketId: string) {
    const consumers = this.consumers.get(socketId) || [];
    consumers.forEach(c => c.close());
    this.consumers.delete(socketId);
    logger.debug(`Closed all consumers for socket ${socketId}`);
  }

  private static removeConsumer(socketId: string, consumerId: string) {
    const consumers = this.consumers.get(socketId) || [];
    const filtered = consumers.filter(c => c.id !== consumerId);
    this.consumers.set(socketId, filtered);
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

