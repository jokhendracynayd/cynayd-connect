import { Server as SocketIOServer, Socket } from 'socket.io';
import { RouterManager } from '../../media/Router';
import { RoomService } from '../../shared/services/rooms.service';
import { ProducerManager } from '../../media/Producer';
import { ConsumerManager } from '../../media/Consumer';
import { TransportManager } from '../../media/Transport';
import { logger } from '../../shared/utils/logger';
import redis from '../../shared/database/redis';
import { RedisStateService } from '../../shared/services/state.redis';
import { RoomRoutingService } from '../../shared/services/room-routing.service';
import { config } from '../../shared/config';

interface JoinRoomData {
  roomCode: string;
  name: string;
  email: string;
  picture?: string;
}

export function roomHandler(io: SocketIOServer, socket: Socket) {
  
  socket.on('joinRoom', async (data: JoinRoomData, callback) => {
    // Get userId outside try block so it's available in catch block
    const userId = socket.data.userId;
    
    try {
      const { roomCode, name, email, picture } = data;

      // Validation
      if (!userId) {
        logger.error('joinRoom: userId not found in socket.data');
        return callback({
          success: false,
          error: 'Authentication required. Please reconnect.',
        });
      }

      if (!roomCode || typeof roomCode !== 'string') {
        logger.error('joinRoom: Invalid roomCode provided', { roomCode });
        return callback({
          success: false,
          error: 'Invalid room code',
        });
      }

      // Normalize room code (trim and lowercase for consistency)
      const normalizedRoomCode = roomCode.trim().toLowerCase();
      logger.info(`User ${userId} joining room: ${normalizedRoomCode} (original: ${roomCode})`);

      // Get or create room in database
      const room = await RoomService.joinRoom(userId, normalizedRoomCode);

      // Check/assign room to server (sticky session routing)
      const assignedServer = await RoomRoutingService.getOrAssignServer(room.id);
      const currentServer = config.server.instanceId;
      
      if (assignedServer !== currentServer) {
        logger.warn(`Room ${normalizedRoomCode} assigned to server ${assignedServer}, but client connected to ${currentServer}`);
        // In production with load balancer, this shouldn't happen if sticky sessions are configured
        // For now, we'll still allow it but log a warning
      }

      // Create Mediasoup router for this room
      // RouterManager will check if this server should handle the room
      const router = await RouterManager.createRouter(room.id);

      // Join Socket.io room (use normalized code)
      await socket.join(normalizedRoomCode);

      // Store socket data (use normalized room code)
      socket.data.roomCode = normalizedRoomCode;
      socket.data.roomId = room.id;
      socket.data.userName = name;
      socket.data.userEmail = email;
      socket.data.userPicture = picture;

      // Publish join event to Redis (for multi-server)
      await redis.publish('room:join', JSON.stringify({
        roomCode: normalizedRoomCode,
        userId,
        socketId: socket.id,
        name,
        email,
        picture,
      }));

      // Notify other participants
      socket.to(normalizedRoomCode).emit('user-joined', {
        userId,
        name,
        email,
        picture,
      });

      // Get existing participants with their producers
      // IMPORTANT: Only get producers from the SAME ROOM
      const allProducers = ProducerManager.getAllProducers();
      const otherProducers = allProducers.filter(p => {
        // Exclude producers from current socket
        const isFromCurrentSocket = ProducerManager.getProducers(socket.id).some(sp => sp.id === p.id);
        if (isFromCurrentSocket) return false;
        
        // Only include producers from the SAME room
        const producerData = ProducerManager.getProducerById(p.id);
        const otherSocket = io.sockets.sockets.get(producerData?.socketId || '');
        const otherRoomCode = otherSocket?.data.roomCode;
        
        // Only include if in the same room
        return otherRoomCode === normalizedRoomCode;
      });

      logger.debug(`Room ${normalizedRoomCode}: Found ${otherProducers.length} producers from other users in same room`);

      // Get producer info with userIds and user info
      // Group by userId to send unique users
      const userMap = new Map<string, {
        userId: string;
        name: string;
        email: string;
        picture?: string;
        producers: Array<{ producerId: string; kind: 'audio' | 'video' }>;
      }>();

      otherProducers.forEach(p => {
        const producerData = ProducerManager.getProducerById(p.id);
        // Find socket by socketId to get userId and user info
        const otherSocket = io.sockets.sockets.get(producerData?.socketId || '');
        const userId = otherSocket?.data.userId || '';
        
        if (userId && otherSocket?.data.roomCode === normalizedRoomCode) {
          if (!userMap.has(userId)) {
            userMap.set(userId, {
              userId,
              name: otherSocket?.data.userName || 'Unknown',
              email: otherSocket?.data.userEmail || '',
              picture: otherSocket?.data.userPicture,
              producers: [],
            });
          }
          userMap.get(userId)!.producers.push({
            producerId: p.id,
            kind: p.kind,
          });
        }
      });

      logger.debug(`Room ${normalizedRoomCode}: Grouped into ${userMap.size} unique users with producers`);

      // Convert to array format for backward compatibility
      const producerInfoList = Array.from(userMap.values()).flatMap(userInfo =>
        userInfo.producers.map(p => ({
          producerId: p.producerId,
          userId: userInfo.userId,
          kind: p.kind,
          name: userInfo.name,
          email: userInfo.email,
          picture: userInfo.picture,
        }))
      );

      // Also send existingParticipants separately for easier frontend handling
      const existingParticipants = Array.from(userMap.values()).map(userInfo => ({
        userId: userInfo.userId,
        name: userInfo.name,
        email: userInfo.email,
        picture: userInfo.picture,
      }));

      logger.info(`User ${userId} joined room ${normalizedRoomCode}`);

      callback({
        success: true,
        rtpCapabilities: router.rtpCapabilities,
        otherProducers: producerInfoList,
        existingParticipants, // Send user info for existing participants
      });
    } catch (error: any) {
      logger.error('Error joining room:', {
        error: error.message,
        stack: error.stack,
        userId: userId || socket.data.userId || 'unknown',
        roomCode: data?.roomCode || 'unknown',
        socketId: socket.id,
      });
      
      // Provide more helpful error messages
      let errorMessage = error.message || 'Failed to join room';
      if (error.message?.includes('Room not found')) {
        errorMessage = `Room "${data.roomCode}" not found. Please verify the room code is correct.`;
      } else if (error.message?.includes('Authentication')) {
        errorMessage = 'Authentication failed. Please reconnect.';
      }
      
      callback({
        success: false,
        error: errorMessage,
      });
    }
  });

  socket.on('leaveRoom', async () => {
    try {
      const { roomCode, userId } = socket.data;

      if (roomCode) {
        logger.info(`User ${userId} leaving room: ${roomCode}`);

        // Cleanup media (async)
        await Promise.all([
          ProducerManager.closeAllProducers(socket.id),
          ConsumerManager.closeAllConsumers(socket.id),
          TransportManager.closeAllTransports(socket.id),
        ]);

        // Cleanup Redis state
        try {
          await RedisStateService.cleanupSocketState(socket.id);
        } catch (error) {
          logger.error(`Failed to cleanup Redis state for socket ${socket.id}:`, error);
        }

        // Leave database room
        await RoomService.leaveRoom(userId, roomCode);
        
        // Notify others
        socket.to(roomCode).emit('user-left', { userId });
        socket.leave(roomCode);

        // Publish to Redis
        await redis.publish('room:leave', JSON.stringify({
          roomCode,
          userId,
          socketId: socket.id,
        }));

        // Clear socket data
        delete socket.data.roomCode;
        delete socket.data.roomId;

        logger.info(`User ${userId} left room ${roomCode}`);
      }
    } catch (error: any) {
      logger.error('Error leaving room:', error);
    }
  });

}

