import prisma from '../database/prisma';
import { NotFoundError, ForbiddenError } from '../utils/errors';

export class RoomService {
  static async createRoom(userId: string, data: { name?: string }) {
    // Generate lowercase room code for consistency
    const roomCode = this.generateRoomCode().toLowerCase();

    const room = await prisma.room.create({
      data: {
        roomCode,
        name: data.name,
        adminId: userId,
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

    // Check if already joined
    const existingParticipant = await prisma.participant.findFirst({
      where: {
        roomId: room.id,
        userId,
        leftAt: null,
      },
    });

    if (existingParticipant) {
      return room;
    }

    // Add participant
    await prisma.participant.create({
      data: {
        roomId: room.id,
        userId,
        role: room.adminId === userId ? 'admin' : 'participant',
      },
    });

    return this.getRoomByCode(normalizedRoomCode);
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

