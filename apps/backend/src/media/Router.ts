import { Router } from 'mediasoup/node/lib/types';
import { WorkerManager } from './Worker';
import { mediasoupConfig } from '../shared/config/mediasoup.config';
import { logger } from '../shared/utils/logger';

export class RouterManager {
  private static routers: Map<string, Router> = new Map();

  static async createRouter(roomId: string): Promise<Router> {
    // Return existing router if already created
    if (this.routers.has(roomId)) {
      return this.routers.get(roomId)!;
    }

    // Get least loaded worker
    const worker = WorkerManager.getWorker();

    // Create router
    const router = await worker.createRouter({
      mediaCodecs: mediasoupConfig.router.mediaCodecs,
    });

    logger.info(`Router created for room ${roomId} (Router ID: ${router.id})`);

    // Store router
    this.routers.set(roomId, router);

    return router;
  }

  static getRouter(roomId: string): Router | undefined {
    return this.routers.get(roomId);
  }

  static hasRouter(roomId: string): boolean {
    return this.routers.has(roomId);
  }

  static async closeRouter(roomId: string) {
    const router = this.routers.get(roomId);
    if (router) {
      router.close();
      this.routers.delete(roomId);
      logger.info(`Router closed for room ${roomId}`);
    }
  }

  static async closeAll() {
    logger.info('Closing all routers...');
    for (const [roomId, router] of this.routers.entries()) {
      router.close();
    }
    this.routers.clear();
    logger.info('All routers closed');
  }

  static getStats() {
    return {
      total: this.routers.size,
      rooms: Array.from(this.routers.keys()),
    };
  }
}

