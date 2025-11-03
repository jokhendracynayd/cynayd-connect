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
        try {
          // Clean up media resources
          await Promise.all([
            ProducerManager.closeAllProducers(socket.id).catch(err => 
              logger.error(`Error closing producers for ${socket.id}:`, err)
            ),
            ConsumerManager.closeAllConsumers(socket.id).catch(err => 
              logger.error(`Error closing consumers for ${socket.id}:`, err)
            ),
            TransportManager.closeAllTransports(socket.id).catch(err => 
              logger.error(`Error closing transports for ${socket.id}:`, err)
            ),
          ]);

          // Cleanup Redis state
          await RedisStateService.cleanupSocketState(socket.id).catch(err =>
            logger.error(`Error cleaning Redis state for ${socket.id}:`, err)
          );
        } catch (error) {
          logger.error(`Error during disconnect cleanup for ${socket.id}:`, error);
        }
      }
    });
  });

  logger.info('Socket.io signaling server initialized');

  return io;
}

