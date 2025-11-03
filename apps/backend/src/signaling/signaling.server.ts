import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { config } from '../shared/config';
import { logger } from '../shared/utils/logger';
import { TokenService } from '../shared/services/token.service';
import { createAdapterClients } from '../shared/database/redis';
import { roomHandler } from './handlers/room.handler';
import { mediaHandler } from './handlers/media.handler';
import { chatHandler } from './handlers/chat.handler';
import { ProducerManager } from '../media/Producer';
import { ConsumerManager } from '../media/Consumer';
import { TransportManager } from '../media/Transport';
import { RedisStateService } from '../shared/services/state.redis';

/**
 * Cleanup socket resources with retry logic
 */
async function cleanupSocketWithRetry(socketId: string, maxRetries: number = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Clean up media resources
      await Promise.all([
        ProducerManager.closeAllProducers(socketId).catch(err => 
          logger.error(`Error closing producers for ${socketId} (attempt ${attempt}):`, err)
        ),
        ConsumerManager.closeAllConsumers(socketId).catch(err => 
          logger.error(`Error closing consumers for ${socketId} (attempt ${attempt}):`, err)
        ),
        TransportManager.closeAllTransports(socketId).catch(err => 
          logger.error(`Error closing transports for ${socketId} (attempt ${attempt}):`, err)
        ),
      ]);

      // Cleanup Redis state
      await RedisStateService.cleanupSocketState(socketId);

      // Verify cleanup was successful
      await verifySocketCleanup(socketId);
      
      logger.info(`Successfully cleaned up socket ${socketId} (attempt ${attempt})`);
      return; // Success, exit
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      logger.warn(
        `Cleanup attempt ${attempt}/${maxRetries} failed for socket ${socketId}:`,
        error
      );

      if (isLastAttempt) {
        logger.error(`Failed to cleanup socket ${socketId} after ${maxRetries} attempts`);
        // Still try to verify and log what remains
        await verifySocketCleanup(socketId).catch(err =>
          logger.error(`Failed to verify cleanup for ${socketId}:`, err)
        );
        throw error;
      }

      // Exponential backoff: wait before retrying
      const delayMs = 1000 * attempt; // 1s, 2s, 3s...
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Verify that all Redis state has been cleaned up for a socket
 */
async function verifySocketCleanup(socketId: string): Promise<void> {
  try {
    const producers = await RedisStateService.getSocketProducers(socketId);
    const consumers = await RedisStateService.getSocketConsumers(socketId);
    const transports = await RedisStateService.getSocketTransports(socketId);

    if (producers.length > 0 || consumers.length > 0 || transports.length > 0) {
      logger.warn(`Cleanup incomplete for socket ${socketId}:`, {
        producers: producers.length,
        consumers: consumers.length,
        transports: transports.length,
      });

      // Retry cleanup for any remaining state
      if (producers.length > 0 || consumers.length > 0 || transports.length > 0) {
        logger.info(`Retrying cleanup for remaining resources in socket ${socketId}`);
        await RedisStateService.cleanupSocketState(socketId).catch(err =>
          logger.error(`Failed to retry cleanup for ${socketId}:`, err)
        );
      }
    } else {
      logger.debug(`Cleanup verified for socket ${socketId} - all resources cleared`);
    }
  } catch (error) {
    logger.error(`Error verifying cleanup for socket ${socketId}:`, error);
    // Don't throw - verification failure shouldn't break disconnect flow
  }
}

export function createSignalingServer(httpServer: HTTPServer) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.cors.origin,
      credentials: true,
    },
    path: '/socket',
  });

  // Setup Redis adapter for horizontal scaling
  try {
    const { pubClient, subClient } = createAdapterClients();
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.io Redis adapter initialized - horizontal scaling enabled');
  } catch (error) {
    logger.error('Failed to initialize Redis adapter:', error);
    logger.warn('Socket.io will run in single-server mode (no horizontal scaling)');
    // Continue without adapter - single server mode
  }

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = await TokenService.verifyAccessToken(token);
      socket.data.userId = decoded.userId;
      next();
    } catch (error) {
      logger.error('Socket auth error:', error);
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id} (User: ${socket.data.userId})`);

    // Register handlers
    roomHandler(io, socket);
    mediaHandler(io, socket);
    chatHandler(io, socket);

    socket.on('disconnect', async (reason) => {
      logger.info(`Client disconnected: ${socket.id} (Reason: ${reason})`);
      
      // Cleanup on disconnect
      if (socket.data.roomCode || socket.data.roomId) {
        await cleanupSocketWithRetry(socket.id);
      }
    });
  });

  logger.info('Socket.io signaling server initialized');

  return io;
}

