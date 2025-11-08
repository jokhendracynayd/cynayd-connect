import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { config } from '../shared/config';
import { logger } from '../shared/utils/logger';
import { TokenService } from '../shared/services/token.service';
import { createAdapterClients } from '../shared/database/redis';
import { roomHandler, handleSocketLeave } from './handlers/room.handler';
import { mediaHandler } from './handlers/media.handler';
import { chatHandler } from './handlers/chat.handler';

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
      
      try {
        await handleSocketLeave(io, socket, {
          reason: reason ?? 'disconnect',
          triggeredByDisconnect: true,
        });
      } catch (error) {
        logger.error('Error handling disconnect cleanup', {
          socketId: socket.id,
          reason,
          error,
        });
      }
    });
  });

  logger.info('Socket.io signaling server initialized');

  return io;
}

