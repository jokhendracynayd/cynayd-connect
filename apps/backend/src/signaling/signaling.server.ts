import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { config } from '../shared/config';
import { logger } from '../shared/utils/logger';
import { TokenService } from '../shared/services/token.service';
import { createAdapterClients } from '../shared/database/redis';
import { createConnectionRateLimitMiddleware, parseTimeWindow } from '../shared/utils/socket-rate-limiter';
import { roomHandler, handleSocketLeave } from './handlers/room.handler';
import { mediaHandler } from './handlers/media.handler';
import { chatHandler } from './handlers/chat.handler';
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

  // Rate limiting middleware (before authentication)
  io.use(createConnectionRateLimitMiddleware({
    maxConnections: config.socketRateLimit.maxConnections,
    windowMs: parseTimeWindow(config.socketRateLimit.connectionWindow),
  }));

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

    // Track cleanup timeouts for sockets
    const cleanupTimeouts = new Map<string, NodeJS.Timeout>();

    socket.on('disconnect', async (reason) => {
      logger.info(`Client disconnected: ${socket.id} (User: ${socket.data.userId}, Reason: ${reason})`);
      
      const userId = socket.data.userId;
      if (!userId) {
        // No user associated, cleanup immediately
        try {
          await handleSocketLeave(io, socket, {
            reason: reason ?? 'disconnect',
            triggeredByDisconnect: true,
          });
        } catch (error) {
          logger.error('Error handling disconnect cleanup for unauthenticated socket', {
            socketId: socket.id,
            error,
          });
        }
        return;
      }

      // Record disconnect timestamp using userId (since new socket will have different socket.id)
      // Use a combination that can be looked up by userId
      await RedisStateService.recordDisconnectTimestamp(`${userId}:${socket.id}`);
      
      // Schedule delayed cleanup after grace period
      const cleanupTimeout = setTimeout(async () => {
        // Check if user reconnected (by checking if there's a new socket for this user)
        const isWithinGracePeriod = await RedisStateService.isWithinGracePeriod(`${userId}:${socket.id}`);
        if (!isWithinGracePeriod) {
          // Grace period expired, check if user has a new socket
          const allSockets = await io.fetchSockets();
          const userHasActiveSocket = allSockets.some(s => 
            s.data.userId === userId && s.id !== socket.id
          );

          if (!userHasActiveSocket) {
            // No active socket for this user, proceed with cleanup
            try {
              await handleSocketLeave(io, socket, {
                reason: reason ?? 'disconnect',
                triggeredByDisconnect: true,
              });
            } catch (error) {
              logger.error('Error handling delayed disconnect cleanup', {
                socketId: socket.id,
                userId,
                reason,
                error,
              });
            }
          } else {
            logger.debug(`Cleanup skipped for socket ${socket.id} - user ${userId} has active socket`);
          }
        }
        cleanupTimeouts.delete(socket.id);
      }, 30000); // 30 seconds grace period

      cleanupTimeouts.set(socket.id, cleanupTimeout);
    });
  });

  logger.info('Socket.io signaling server initialized');

  return io;
}

