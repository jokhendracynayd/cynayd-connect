import prisma from '../database/prisma';
import { NotFoundError, ForbiddenError, ConflictError } from '../utils/errors';
import { logger } from '../utils/logger';

export class RoomService {
  static async createRoom(userId: string, data: { name?: string; isPublic?: boolean }) {
    // Generate lowercase room code for consistency
    const roomCode = this.generateRoomCode().toLowerCase();

    const room = await prisma.room.create({
      data: {
        roomCode,
        name: data.name,
        adminId: userId,
        isPublic: data.isPublic ?? true, // Default to public
      },
      include: {
        admin: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return room;
  }

  static async getRoomByCode(roomCode: string) {
    // Normalize room code (trim whitespace, lowercase for case-insensitive search)
    const normalizedRoomCode = roomCode.trim().toLowerCase();
    
    // First try exact match with normalized code
    let room = await prisma.room.findUnique({
      where: { roomCode: normalizedRoomCode },
      include: {
        admin: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        participants: {
          where: { leftAt: null },
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
        },
      },
    });

    // If not found, try case-insensitive search (for existing mixed-case rooms)
    if (!room) {
      const allRooms = await prisma.room.findMany({
        include: {
          admin: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          participants: {
            where: { leftAt: null },
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
          },
        },
      });
      
      room = allRooms.find(r => r.roomCode.toLowerCase() === normalizedRoomCode) || null;
    }

    if (!room) {
      throw new NotFoundError(`Room not found: ${roomCode}`);
    }

    return room;
  }

  static async joinRoom(userId: string, roomCode: string) {
    // Normalize room code for consistency
    const normalizedRoomCode = roomCode.trim().toLowerCase();
    const room = await this.getRoomByCode(normalizedRoomCode);

    // Check if already joined (active participant)
    const existingParticipant = await prisma.participant.findFirst({
      where: {
        roomId: room.id,
        userId,
        leftAt: null,
      },
    });

    // If already an active participant, just return the room
    if (existingParticipant) {
      logger.debug(`User ${userId} already a participant in room ${normalizedRoomCode}`);
      return room;
    }

    // Check if room is private and user is not admin
    if (!room.isPublic && room.adminId !== userId) {
      // Check if there's a pending or approved request
      const existingRequest = await prisma.roomJoinRequest.findFirst({
        where: {
          roomId: room.id,
          userId,
        },
      });

      if (!existingRequest || existingRequest.status !== 'approved') {
        throw new ForbiddenError('Room is private. Please request access from the admin.');
      }
    }

    // Create or update participant record
    // Since the unique constraint includes joinedAt (timestamp), we need to handle this carefully:
    // - If user previously left (leftAt is set), create a NEW participant record with NEW joinedAt
    // - If no previous record, create new one
    // - Handle race conditions where multiple joins happen simultaneously
    
    try {
      // Try to create a new participant record
      // Use a small delay to ensure joinedAt timestamps are different (prevents unique constraint violation)
      // This handles the case where user rejoins immediately after leaving
      const now = new Date();
      
      await prisma.participant.create({
        data: {
          roomId: room.id,
          userId,
          role: room.adminId === userId ? 'admin' : 'participant',
          joinedAt: now, // Explicitly set to current time
        },
      });
      
      logger.debug(`Created new participant record for user ${userId} in room ${normalizedRoomCode}`);
    } catch (error: any) {
      // Handle unique constraint violation (race condition or immediate rejoin)
      if (error.code === 'P2002' || error.message?.includes('Unique constraint')) {
        logger.warn(`Participant creation conflict for user ${userId} in room ${normalizedRoomCode} (likely race condition), checking existing records`);
        
        // Wait a tiny bit (1ms) to ensure different timestamp, then check again
        await new Promise(resolve => setTimeout(resolve, 1));
        
        // Check again if an active participant exists now (race condition - another request created it)
        const raceConditionParticipant = await prisma.participant.findFirst({
          where: {
            roomId: room.id,
            userId,
            leftAt: null,
          },
        });

        if (raceConditionParticipant) {
          logger.debug(`Participant created by concurrent request, using existing record`);
          return room;
        }
        
        // Check if there's a participant with the same joinedAt (very rare - exact same millisecond)
        // If so, try creating again with a slightly different timestamp
        const conflictingParticipant = await prisma.participant.findFirst({
          where: {
            roomId: room.id,
            userId,
          },
          orderBy: {
            joinedAt: 'desc',
          },
        });

        if (conflictingParticipant) {
          // Wait a bit more to ensure different timestamp
          await new Promise(resolve => setTimeout(resolve, 10));
          
          // Try creating again with new timestamp
          try {
            await prisma.participant.create({
              data: {
                roomId: room.id,
                userId,
                role: room.adminId === userId ? 'admin' : 'participant',
                joinedAt: new Date(), // New timestamp
              },
            });
            logger.debug(`Created participant after timestamp delay for user ${userId} in room ${normalizedRoomCode}`);
            return this.getRoomByCode(normalizedRoomCode);
          } catch (retryError: any) {
            // If still fails, check one more time if participant exists
            const finalCheck = await prisma.participant.findFirst({
              where: {
                roomId: room.id,
                userId,
                leftAt: null,
              },
            });

            if (finalCheck) {
              logger.debug(`Participant exists after retry, using existing record`);
              return room;
            }

            logger.error(`Failed to create participant after retry for user ${userId} in room ${normalizedRoomCode}: ${retryError.message}`);
            throw new Error('Failed to join room due to database conflict. Please try again.');
          }
        } else {
          // No conflicting participant found, but still got unique constraint error
          // This shouldn't happen, but handle gracefully
          logger.error(`Unique constraint error but no conflicting participant found for user ${userId} in room ${normalizedRoomCode}`);
          throw new Error('Failed to join room. Please try again.');
        }
      } else {
        // Re-throw other errors
        logger.error(`Error creating participant for user ${userId} in room ${normalizedRoomCode}: ${error.message}`);
        throw error;
      }
    }

    return this.getRoomByCode(normalizedRoomCode);
  }

  static async requestRoomJoin(userId: string, roomCode: string) {
    const normalizedRoomCode = roomCode.trim().toLowerCase();
    const room = await this.getRoomByCode(normalizedRoomCode);

    // Check if room is private
    if (room.isPublic) {
      throw new ConflictError('Room is public. You can join directly.');
    }

    // Check if user is admin
    if (room.adminId === userId) {
      throw new ConflictError('You are the admin of this room.');
    }

    // Check if already a participant
    const existingParticipant = await prisma.participant.findFirst({
      where: {
        roomId: room.id,
        userId,
        leftAt: null,
      },
    });

    if (existingParticipant) {
      throw new ConflictError('You are already in this room.');
    }

    // Check if request already exists first
    const existingRequest = await prisma.roomJoinRequest.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            picture: true,
          },
        },
        room: {
          select: {
            id: true,
            roomCode: true,
            name: true,
            isPublic: true,
          },
        },
      },
    });

    // If request exists and is approved, allow them to join directly
    if (existingRequest && existingRequest.status === 'approved') {
      return await this.joinRoom(userId, roomCode);
    }

    // If request exists and is pending, return it
    if (existingRequest && existingRequest.status === 'pending') {
      return existingRequest;
    }

    // If request exists and is rejected, update it to pending (or delete and recreate)
    if (existingRequest && existingRequest.status === 'rejected') {
      await prisma.roomJoinRequest.delete({
        where: {
          id: existingRequest.id,
        },
      });
    }

    // Create new request (or recreate if deleted)
    const request = await prisma.roomJoinRequest.create({
      data: {
        roomId: room.id,
        userId,
        status: 'pending',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            picture: true,
          },
        },
        room: {
          select: {
            id: true,
            roomCode: true,
            name: true,
            isPublic: true,
          },
        },
      },
    });

    return request;
  }

  static async approveJoinRequest(adminId: string, roomCode: string, requestId: string) {
    const normalizedRoomCode = roomCode.trim().toLowerCase();
    const room = await this.getRoomByCode(normalizedRoomCode);

    // Verify admin
    if (room.adminId !== adminId) {
      throw new ForbiddenError('Only room admin can approve join requests.');
    }

    // Get request
    const request = await prisma.roomJoinRequest.findUnique({
      where: { id: requestId },
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

    if (!request || request.roomId !== room.id) {
      throw new NotFoundError('Join request not found.');
    }

    if (request.status !== 'pending') {
      throw new ConflictError(`Request already ${request.status}.`);
    }

    // Update request status
    await prisma.roomJoinRequest.update({
      where: { id: requestId },
      data: {
        status: 'approved',
        respondedAt: new Date(),
      },
    });

    return {
      request,
      message: 'Join request approved',
    };
  }

  static async rejectJoinRequest(adminId: string, roomCode: string, requestId: string) {
    const normalizedRoomCode = roomCode.trim().toLowerCase();
    const room = await this.getRoomByCode(normalizedRoomCode);

    // Verify admin
    if (room.adminId !== adminId) {
      throw new ForbiddenError('Only room admin can reject join requests.');
    }

    // Get request
    const request = await prisma.roomJoinRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.roomId !== room.id) {
      throw new NotFoundError('Join request not found.');
    }

    if (request.status !== 'pending') {
      throw new ConflictError(`Request already ${request.status}.`);
    }

    // Update request status
    await prisma.roomJoinRequest.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        respondedAt: new Date(),
      },
    });

    return {
      request,
      message: 'Join request rejected',
    };
  }

  static async getPendingRequests(adminId: string, roomCode: string) {
    const normalizedRoomCode = roomCode.trim().toLowerCase();
    const room = await this.getRoomByCode(normalizedRoomCode);

    // Verify admin
    if (room.adminId !== adminId) {
      throw new ForbiddenError('Only room admin can view pending requests.');
    }

    const requests = await prisma.roomJoinRequest.findMany({
      where: {
        roomId: room.id,
        status: 'pending',
      },
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
      orderBy: {
        requestedAt: 'asc',
      },
    });

    return requests;
  }

  static async updateRoomSettings(adminId: string, roomCode: string, settings: { isPublic?: boolean }) {
    const normalizedRoomCode = roomCode.trim().toLowerCase();
    const room = await this.getRoomByCode(normalizedRoomCode);

    // Verify admin
    if (room.adminId !== adminId) {
      throw new ForbiddenError('Only room admin can update room settings.');
    }

    const updatedRoom = await prisma.room.update({
      where: { id: room.id },
      data: {
        isPublic: settings.isPublic ?? room.isPublic,
      },
      include: {
        admin: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return updatedRoom;
  }

  static async leaveRoom(userId: string, roomCode: string) {
    const normalizedRoomCode = roomCode.trim().toLowerCase();
    const room = await this.getRoomByCode(normalizedRoomCode);

    await prisma.participant.updateMany({
      where: {
        roomId: room.id,
        userId,
        leftAt: null,
      },
      data: {
        leftAt: new Date(),
      },
    });

    return { success: true };
  }

  private static generateRoomCode(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const segment = () =>
      Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${segment()}-${segment()}-${segment()}`;
  }
}

