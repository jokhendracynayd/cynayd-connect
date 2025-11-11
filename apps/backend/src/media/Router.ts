import * as mediasoup from 'mediasoup';
import { WorkerManager } from './Worker';
import { mediasoupConfig } from '../shared/config/mediasoup.config';
import { logger } from '../shared/utils/logger';
import { RedisStateService } from '../shared/services/state.redis';
import { RoomRoutingService } from '../shared/services/room-routing.service';

type Router = mediasoup.types.Router;

export class RouterManager {
  private static routers: Map<string, Router> = new Map();

  static async createRouter(roomId: string): Promise<Router> {
    // Check if current server should handle this room (sticky sessions)
    const shouldHandle = await RoomRoutingService.shouldHandleRoom(roomId);
    if (!shouldHandle) {
      const assignedServer = await RoomRoutingService.getRoomServer(roomId);
      logger.warn(`Room ${roomId} is assigned to server ${assignedServer}, but router requested on this server`);
      // Still create router (for failover scenarios), but log warning
    }

    // Return existing router if already created locally
    if (this.routers.has(roomId)) {
      return this.routers.get(roomId)!;
    }
    
    // Check Redis for router metadata (might exist on another server)
    const routerMetadata = await RedisStateService.getRouterMetadata(roomId);
    if (routerMetadata) {
      logger.debug(`Room ${roomId} has router on server ${routerMetadata.serverInstanceId}`);
      // If router is on another server, we still need to create one locally
      // The actual Mediasoup router can't be shared, but metadata tells us where it is
    }

    // Assign room to current server (if not already assigned)
    await RoomRoutingService.getOrAssignServer(roomId);

    // Get least loaded worker
    const worker = WorkerManager.getWorker();
    const workerStats = WorkerManager.getStats();
    const workerIndex = workerStats.currentIndex === 0 ? workerStats.total - 1 : workerStats.currentIndex - 1;

    // Create router
    const router = await worker.createRouter({
      mediaCodecs: mediasoupConfig.router.mediaCodecs as any,
    });

    logger.info(`Router created for room ${roomId} (Router ID: ${router.id}) on worker index ${workerIndex}`);

    // Store router locally
    this.routers.set(roomId, router);

    // Register router with worker manager
    WorkerManager.registerRouter(workerIndex);

    // Store router metadata in Redis
    try {
      await RedisStateService.storeRouterMetadata(roomId, router.id);
    } catch (error) {
      logger.error(`Failed to store router metadata in Redis: ${roomId}`, error);
      // Continue without Redis - graceful degradation
    }

    return router;
  }

  static getRouter(roomId: string): Router | undefined {
    return this.routers.get(roomId);
  }

  static hasRouter(roomId: string): boolean {
    return this.routers.has(roomId);
  }

  static async closeRouter(roomId: string): Promise<void> {
    const router = this.routers.get(roomId);
    if (router) {
      router.close();
      this.routers.delete(roomId);
      
      // Unregister from worker manager (we need to find which worker it was on)
      // Since we don't track this directly, we'll use a best-effort approach
      // In production, you might want to track router->worker mapping
      const workerStats = WorkerManager.getStats();
      if (workerStats.workers.length > 0) {
        // Decrement from most loaded worker (best guess)
        const mostLoaded = workerStats.workers.reduce((max, w) => 
          w.routerCount > max.routerCount ? w : max
        );
        WorkerManager.unregisterRouter(mostLoaded.index);
      }
      
      // Remove from Redis
      try {
        await RedisStateService.removeRouterMetadata(roomId);
      } catch (error) {
        logger.error(`Failed to remove router metadata from Redis: ${roomId}`, error);
      }
      
      logger.info(`Router closed for room ${roomId}`);
    }
  }

  static async closeAll(): Promise<void> {
    logger.info('Closing all routers...');
    const closePromises = Array.from(this.routers.entries()).map(async ([roomId, router]) => {
      router.close();
      try {
        await RedisStateService.removeRouterMetadata(roomId);
      } catch (error) {
        logger.error(`Failed to remove router metadata from Redis: ${roomId}`, error);
      }
    });
    await Promise.all(closePromises);
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

