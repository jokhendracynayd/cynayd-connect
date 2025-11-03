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
import prisma from '../../shared/database/prisma';

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

      // First get room info to check privacy
      const room = await RoomService.getRoomByCode(normalizedRoomCode);

      // Check if room is private and user is not admin
      if (!room.isPublic && room.adminId !== userId) {
        // Check if user has an approved request (use findUnique for exact match)
        const existingRequest = await prisma.roomJoinRequest.findUnique({
          where: {
            roomId_userId: {
              roomId: room.id,
              userId,
            },
          },
        });

        // If no request exists OR request is not approved, check for pending/rejected
        if (!existingRequest || existingRequest.status !== 'approved') {
          // Check if there's a pending request
          if (existingRequest && existingRequest.status === 'pending') {
            // Request is pending, notify admin (in case they weren't notified before) and return waiting status
            // Notify admin - use Socket.io room emission for reliability
            const userInfo = await prisma.user.findUnique({
              where: { id: userId },
              select: { id: true, name: true, email: true, picture: true },
            });

            if (userInfo) {
              const requestData = {
                requestId: existingRequest.id,
                userId: userInfo.id,
                name: userInfo.name,
                email: userInfo.email,
                picture: userInfo.picture,
                requestedAt: existingRequest.requestedAt,
              };
              
              // Find admin sockets
              const adminSockets = Array.from(io.sockets.sockets.values()).filter(s => 
                s.data.userId === room.adminId
              );
              
              // If admin is in the room, emit to room only (avoids duplicates)
              const adminInRoom = adminSockets.some(s => s.rooms.has(normalizedRoomCode));
              
              if (adminInRoom) {
                // Admin is in room, emit to room only
                io.to(normalizedRoomCode).emit('join-request', requestData);
              } else {
                // Admin not in room, emit directly to their sockets
                adminSockets.forEach(adminSocket => {
                  adminSocket.emit('join-request', requestData);
                });
              }
              
              logger.info(`Notified admin ${room.adminId} about pending join request from ${userInfo.name} (room: ${normalizedRoomCode})`);
            }

            return callback({
              success: false,
              error: 'Room is private. Waiting for admin approval.',
              waitingApproval: true,
              requestId: existingRequest.id,
            });
          } else {
            // No request exists or was rejected, automatically create a request for the user
            try {
              // Create the request automatically (this will return existing if already pending)
              const request = await RoomService.requestRoomJoin(userId, normalizedRoomCode);
              
              // Notify admin - use Socket.io room emission OR direct socket (not both to avoid duplicates)
              if (request.user) {
                const requestData = {
                  requestId: request.id,
                  userId: request.user.id,
                  name: request.user.name,
                  email: request.user.email,
                  picture: request.user.picture,
                  requestedAt: request.requestedAt,
                };
                
                // Find admin sockets
                const adminSockets = Array.from(io.sockets.sockets.values()).filter(s => 
                  s.data.userId === room.adminId
                );
                
                // If admin is in the room, emit to room only (avoids duplicates)
                const adminInRoom = adminSockets.some(s => s.rooms.has(normalizedRoomCode));
                
                if (adminInRoom) {
                  // Admin is in room, emit to room only
                  io.to(normalizedRoomCode).emit('join-request', requestData);
                } else {
                  // Admin not in room, emit directly to their sockets
                  adminSockets.forEach(adminSocket => {
                    adminSocket.emit('join-request', requestData);
                  });
                }
                
                logger.info(`Notified admin ${room.adminId} about join request from ${request.user.name} (room: ${normalizedRoomCode})`);
              }

              // Return waiting status so user sees waiting screen
              return callback({
                success: false,
                error: 'Room is private. Join request sent. Waiting for admin approval.',
                waitingApproval: true,
                requestId: request.id,
              });
            } catch (requestError: any) {
              // If request creation fails (e.g., already exists), check for existing request
              if (requestError.message?.includes('already pending') || requestError.message?.includes('Unique constraint')) {
                // Request already exists, get it and return waiting status
                const existingReq = await prisma.roomJoinRequest.findFirst({
                  where: {
                    roomId: room.id,
                    userId,
                    status: 'pending',
                  },
                  include: {
                    user: {
                      select: { id: true, name: true, email: true, picture: true },
                    },
                  },
                });

                if (existingReq && existingReq.user) {
                  // Notify admin - use Socket.io room emission for reliability
                  const requestData = {
                    requestId: existingReq.id,
                    userId: existingReq.user.id,
                    name: existingReq.user.name,
                    email: existingReq.user.email,
                    picture: existingReq.user.picture,
                    requestedAt: existingReq.requestedAt,
                  };
                  
                  // Find admin sockets
                  const adminSockets = Array.from(io.sockets.sockets.values()).filter(s => 
                    s.data.userId === room.adminId
                  );
                  
                  // If admin is in the room, emit to room only (avoids duplicates)
                  const adminInRoom = adminSockets.some(s => s.rooms.has(normalizedRoomCode));
                  
                  if (adminInRoom) {
                    // Admin is in room, emit to room only
                    io.to(normalizedRoomCode).emit('join-request', requestData);
                  } else {
                    // Admin not in room, emit directly to their sockets
                    adminSockets.forEach(adminSocket => {
                      adminSocket.emit('join-request', requestData);
                    });
                  }
                  
                  logger.info(`Notified admin ${room.adminId} about existing join request from ${existingReq.user.name} (room: ${normalizedRoomCode})`);
                  
                  return callback({
                    success: false,
                    error: 'Room is private. Waiting for admin approval.',
                    waitingApproval: true,
                    requestId: existingReq.id,
                  });
                }
              }

              // If we get here, it's a real error
              return callback({
                success: false,
                error: requestError.message || 'Failed to request room access',
                requiresRequest: true,
              });
            }
          }
        }
        // If approved request exists, continue to join
      }

      // User can join (public room, admin, or has approved request)
      // Now actually join the room - get updated room object
      const updatedRoom = await RoomService.joinRoom(userId, normalizedRoomCode);
      
      // Use the updated room from joinRoom (ensures we have latest data)
      const roomId = updatedRoom.id;

      // Check/assign room to server (sticky session routing)
      const assignedServer = await RoomRoutingService.getOrAssignServer(roomId);
      const currentServer = config.server.instanceId;
      
      if (assignedServer !== currentServer) {
        logger.warn(`Room ${normalizedRoomCode} assigned to server ${assignedServer}, but client connected to ${currentServer}`);
        // In production with load balancer, this shouldn't happen if sticky sessions are configured
        // For now, we'll still allow it but log a warning
      }

      // Create Mediasoup router for this room
      // RouterManager will check if this server should handle the room
      const router = await RouterManager.createRouter(roomId);

      // Join Socket.io room (use normalized code)
      await socket.join(normalizedRoomCode);

      // Store socket data (use normalized room code) - IMPORTANT: Set AFTER successful join
      socket.data.roomCode = normalizedRoomCode;
      socket.data.roomId = roomId;
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

      // If user is admin, check for pending requests and notify them
      // HYBRID APPROACH: Frontend will call API to load requests (reliable)
      // We also emit socket event for verification and real-time updates
      if (updatedRoom.adminId === userId) {
        try {
          const pendingRequests = await RoomService.getPendingRequests(userId, normalizedRoomCode);
          logger.info(`Admin ${userId} joining room ${normalizedRoomCode} - found ${pendingRequests.length} pending requests`);
          
          // Emit socket event for verification and real-time updates
          // Frontend will also call API directly for reliable initial load
          // Use a delay to ensure frontend socket listeners are set up
          setTimeout(() => {
            const requestData = {
              requests: pendingRequests.map((req: any) => ({
                id: req.id,
                userId: req.user.id,
                name: req.user.name,
                email: req.user.email,
                picture: req.user.picture,
                requestedAt: req.requestedAt,
              })),
            };
            
            // Emit to socket for verification/backup
            // This works as a backup if API call fails or for real-time verification
            socket.emit('pending-requests-loaded', requestData);
            
            // Also emit to the room (redundancy - ensures delivery)
            io.to(normalizedRoomCode).emit('pending-requests-loaded', requestData);
            
            logger.info(`Sent pending-requests-loaded event to admin ${userId} with ${pendingRequests.length} requests (hybrid: API + Socket)`);
          }, 500); // Increased delay to ensure frontend listeners are ready
        } catch (error) {
          logger.error('Failed to load pending requests for admin:', error);
          // Continue anyway - frontend will call API as primary method
        }
      }

      callback({
        success: true,
        rtpCapabilities: router.rtpCapabilities,
        otherProducers: producerInfoList,
        existingParticipants, // Send user info for existing participants
        isAdmin: updatedRoom.adminId === userId, // Include admin status in response
        isPublic: updatedRoom.isPublic, // Include room privacy status
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

        // Cleanup media with retry logic
        await cleanupSocketWithRetry(socket.id);

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
        socket.data.roomCode = undefined;
        socket.data.roomId = undefined;

        logger.info(`User ${userId} left room ${roomCode}`);
      }
    } catch (error: any) {
      logger.error('Error leaving room:', error);
    }
  });

  socket.on('requestRoomJoin', async (data: { roomCode: string }, callback) => {
    const userId = socket.data.userId;
    
    try {
      if (!userId) {
        return callback({
          success: false,
          error: 'Authentication required',
        });
      }

      const normalizedRoomCode = data.roomCode.trim().toLowerCase();
      const request = await RoomService.requestRoomJoin(userId, normalizedRoomCode);

      // Notify admin - use room OR direct socket (not both to avoid duplicates)
      const room = await RoomService.getRoomByCode(normalizedRoomCode);
      const adminSockets = Array.from(io.sockets.sockets.values()).filter(s => 
        s.data.userId === room.adminId
      );

      if (adminSockets.length > 0 && request.user) {
        const requestData = {
          requestId: request.id,
          userId: request.user.id,
          name: request.user.name,
          email: request.user.email,
          picture: request.user.picture,
          requestedAt: request.requestedAt,
        };
        
        // If admin is in the room, emit to room only (avoids duplicates)
        const adminInRoom = adminSockets.some(s => s.rooms.has(normalizedRoomCode));
        
        if (adminInRoom) {
          // Admin is in room, emit to room only
          io.to(normalizedRoomCode).emit('join-request', requestData);
        } else {
          // Admin not in room, emit directly to their sockets
          adminSockets.forEach(adminSocket => {
            adminSocket.emit('join-request', requestData);
          });
        }
      }

      callback({
        success: true,
        requestId: request.id,
        message: 'Join request sent. Waiting for admin approval.',
      });
    } catch (error: any) {
      logger.error('Error requesting room join:', error);
      callback({
        success: false,
        error: error.message || 'Failed to request room join',
      });
    }
  });

  socket.on('approveJoinRequest', async (data: { requestId: string }, callback) => {
    const userId = socket.data.userId;
    
    try {
      if (!userId) {
        return callback({
          success: false,
          error: 'Authentication required',
        });
      }

      const { roomCode } = socket.data;
      if (!roomCode) {
        return callback({
          success: false,
          error: 'Not in a room',
        });
      }

      const normalizedRoomCode = roomCode.trim().toLowerCase();
      const result = await RoomService.approveJoinRequest(userId, normalizedRoomCode, data.requestId);

      // Notify the requesting user - try multiple ways to find their socket
      const requestingUserId = result.request.user.id;
      
      // Method 1: Find by userId (user might not be in room yet)
      const requestingUserSockets = Array.from(io.sockets.sockets.values()).filter(s => 
        s.data.userId === requestingUserId
      );

      const approvedData = {
        roomCode: normalizedRoomCode,
        requestId: data.requestId,
        message: 'Your join request has been approved',
      };

      if (requestingUserSockets.length > 0) {
        // Emit to all sockets for this user (in case they have multiple tabs)
        requestingUserSockets.forEach(sock => {
          sock.emit('join-approved', approvedData);
        });
        logger.info(`Notified user ${requestingUserId} about approved join request (${requestingUserSockets.length} socket(s))`);
      } else {
        // Also emit to the room in case user joins later
        io.to(normalizedRoomCode).emit('join-approved', approvedData);
        logger.warn(`User ${requestingUserId} not connected, will receive notification when they connect`);
      }

      callback({
        success: true,
        message: 'Join request approved',
      });
    } catch (error: any) {
      logger.error('Error approving join request:', error);
      callback({
        success: false,
        error: error.message || 'Failed to approve join request',
      });
    }
  });

  socket.on('rejectJoinRequest', async (data: { requestId: string }, callback) => {
    const userId = socket.data.userId;
    
    try {
      if (!userId) {
        return callback({
          success: false,
          error: 'Authentication required',
        });
      }

      const { roomCode } = socket.data;
      if (!roomCode) {
        return callback({
          success: false,
          error: 'Not in a room',
        });
      }

      const result = await RoomService.rejectJoinRequest(userId, roomCode, data.requestId);

      // Get request with user info
      const requestWithUser = await prisma.roomJoinRequest.findUnique({
        where: { id: data.requestId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              picture: true,
            },
          },
        },
      });

      // Notify the requesting user
      const requestingUserSocket = Array.from(io.sockets.sockets.values()).find(s => 
        s.data.userId === requestWithUser?.userId
      );

      if (requestingUserSocket) {
        requestingUserSocket.emit('join-rejected', {
          roomCode,
          requestId: data.requestId,
          message: 'Your join request has been rejected',
        });
      }

      callback({
        success: true,
        message: 'Join request rejected',
      });
    } catch (error: any) {
      logger.error('Error rejecting join request:', error);
      callback({
        success: false,
        error: error.message || 'Failed to reject join request',
      });
    }
  });

}

