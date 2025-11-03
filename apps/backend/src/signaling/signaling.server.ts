import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from '../shared/config';
import { logger } from '../shared/utils/logger';
import { TokenService } from '../shared/services/token.service';
import { roomHandler } from './handlers/room.handler';
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

    socket.on('disconnect', (reason) => {
      logger.info(`Client disconnected: ${socket.id} (Reason: ${reason})`);
      
      // Cleanup on disconnect
      if (socket.data.roomId) {
        roomHandler(io, socket); // Trigger cleanup
      }
    });
  });

  logger.info('Socket.io signaling server initialized');

  return io;
}

