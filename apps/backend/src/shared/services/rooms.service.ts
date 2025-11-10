import prisma from '../database/prisma';
import { Prisma, RoomControlState, ParticipantRole } from '@prisma/client';
import type { Participant as PrismaParticipant } from '@prisma/client';
import { NotFoundError, ForbiddenError, ConflictError } from '../utils/errors';
import { logger } from '../utils/logger';

let muteColumnsAvailable: boolean | null = null;
let lastMuteColumnCheck: number | null = null;
const MUTE_COLUMN_CHECK_INTERVAL_MS = 60_000; // 1 minute cache

export interface ParticipantControlState {
  forcedAudio: boolean;
  forcedVideo: boolean;
  forcedAudioAt: Date | null;
  forcedVideoAt: Date | null;
  forcedBy: string | null;
  forcedReason: string | null;
}

export interface RoomHostControlState {
  locked: boolean;
  lockedBy: string | null;
  lockedAt: Date | null;
  lockedReason: string | null;
  audioForceAll: boolean;
  audioForcedBy: string | null;
  audioForcedAt: Date | null;
  audioForceReason: string | null;
  videoForceAll: boolean;
  videoForcedBy: string | null;
  videoForcedAt: Date | null;
  videoForceReason: string | null;
  chatForceAll: boolean;
  chatForcedBy: string | null;
  chatForcedAt: Date | null;
  chatForceReason: string | null;
}

async function areMuteColumnsAvailable(): Promise<boolean> {
  const now = Date.now();

  if (
    typeof muteColumnsAvailable === 'boolean' &&
    lastMuteColumnCheck !== null &&
    now - lastMuteColumnCheck < MUTE_COLUMN_CHECK_INTERVAL_MS
  ) {
    return muteColumnsAvailable;
  }

  try {
    const result = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'Participant'
        AND column_name IN ('audioMuted', 'videoMuted', 'audioMutedAt', 'videoMutedAt')
    `;

    const columns = new Set(result.map(row => row.column_name));
    const hasColumns =
      columns.has('audioMuted') &&
      columns.has('videoMuted') &&
      columns.has('audioMutedAt') &&
      columns.has('videoMutedAt');

    muteColumnsAvailable = hasColumns;
    lastMuteColumnCheck = now;

    if (!hasColumns) {
      logger.warn(
        'Participant mute state columns missing in database. Run latest migrations to enable persistence.'
      );
    }

    return hasColumns;
  } catch (error) {
    logger.warn('Failed to verify participant mute columns. Assuming unavailable.', { error });
    muteColumnsAvailable = false;
    lastMuteColumnCheck = now;
    return false;
  }
}

function isMuteColumnMissingError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  const message =
    typeof error === 'string'
      ? error
      : (error as { message?: string })?.message ?? '';

  if (!message) {
    return false;
  }

  const patterns = [
    'Unknown field `audioMuted`',
    'Unknown field `videoMuted`',
    'column "audioMuted" does not exist',
    'column "videoMuted" does not exist',
  ];

  if (patterns.some(pattern => message.includes(pattern))) {
    return true;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2021' || error.code === 'P2022') {
      return true;
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    if (patterns.some(pattern => message.includes(pattern))) {
      return true;
    }
  }

  return false;
}

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
          role: room.adminId === userId ? ParticipantRole.HOST : ParticipantRole.PARTICIPANT,
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
                role: room.adminId === userId ? ParticipantRole.HOST : ParticipantRole.PARTICIPANT,
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

  static async setParticipantRole(
    actorUserId: string,
    roomId: string,
    targetUserId: string,
    nextRole: ParticipantRole
  ): Promise<{ userId: string; role: ParticipantRole }> {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        adminId: true,
      },
    });

    if (!room) {
      throw new NotFoundError('Room not found.');
    }

    if (room.adminId !== actorUserId) {
      throw new ForbiddenError('Only the room host can manage co-hosts.');
    }

    if (targetUserId === room.adminId) {
      throw new ConflictError('Host role cannot be reassigned.');
    }

    if (nextRole === ParticipantRole.HOST) {
      throw new ConflictError('Host role is reserved for the room owner.');
    }

    const participant = await prisma.participant.findFirst({
      where: {
        roomId: room.id,
        userId: targetUserId,
        leftAt: null,
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (!participant) {
      throw new NotFoundError('Participant not found.');
    }

    if (participant.role === nextRole) {
      return { userId: targetUserId, role: participant.role };
    }

    const result = await prisma.participant.update({
      where: { id: participant.id },
      data: {
        role: nextRole,
      },
      select: {
        role: true,
      },
    });

    return {
      userId: targetUserId,
      role: result.role,
    };
  }

  static async promoteToCoHost(
    actorUserId: string,
    roomId: string,
    targetUserId: string
  ): Promise<{ userId: string; role: ParticipantRole }> {
    return this.setParticipantRole(actorUserId, roomId, targetUserId, ParticipantRole.COHOST);
  }

  static async demoteToParticipant(
    actorUserId: string,
    roomId: string,
    targetUserId: string
  ): Promise<{ userId: string; role: ParticipantRole }> {
    return this.setParticipantRole(actorUserId, roomId, targetUserId, ParticipantRole.PARTICIPANT);
  }

  static isModeratorRole(role: ParticipantRole | null | undefined): boolean {
    return role === ParticipantRole.HOST || role === ParticipantRole.COHOST;
  }

  static async updateParticipantMuteState(
    roomId: string,
    userId: string,
    updates: {
      isAudioMuted?: boolean;
      isVideoMuted?: boolean;
      audioMutedAt?: Date | null;
      videoMutedAt?: Date | null;
    }
  ): Promise<void> {
    const data: Record<string, unknown> = {};

    if (typeof updates.isAudioMuted === 'boolean') {
      data.audioMuted = updates.isAudioMuted;
      data.audioMutedAt = updates.audioMutedAt ?? new Date();
    }

    if (typeof updates.isVideoMuted === 'boolean') {
      data.videoMuted = updates.isVideoMuted;
      data.videoMutedAt = updates.videoMutedAt ?? new Date();
    }

    if (Object.keys(data).length === 0) {
      return;
    }

    const columnsAvailable = await areMuteColumnsAvailable();
    if (!columnsAvailable) {
      return;
    }

    try {
      const result = await prisma.participant.updateMany({
        where: {
          roomId,
          userId,
          leftAt: null,
        },
        data,
      });

      if (result.count === 0) {
        logger.warn('No active participant found to update mute state', { roomId, userId });
      }
    } catch (error: any) {
      if (isMuteColumnMissingError(error)) {
        logger.warn(
          'Mute state columns missing in database, skipping participant mute update. Run latest migrations to enable persistence.',
          { roomId, userId }
        );
        return;
      }

      throw error;
    }
  }

  static async getParticipantMuteState(roomId: string, userId: string): Promise<{
    isAudioMuted: boolean;
    isVideoMuted: boolean;
    audioMutedAt: Date | null;
    videoMutedAt: Date | null;
  } | null> {
    const columnsAvailable = await areMuteColumnsAvailable();
    if (!columnsAvailable) {
      return null;
    }

    try {
      const participant = await prisma.participant.findFirst({
        where: {
          roomId,
          userId,
          leftAt: null,
        },
        select: {
          audioMuted: true,
          videoMuted: true,
          audioMutedAt: true,
          videoMutedAt: true,
        },
      });

      if (!participant) {
        return null;
      }

      return {
        isAudioMuted: participant.audioMuted,
        isVideoMuted: participant.videoMuted,
        audioMutedAt: participant.audioMutedAt,
        videoMutedAt: participant.videoMutedAt,
      };
    } catch (error: any) {
      if (isMuteColumnMissingError(error)) {
        logger.warn(
          'Mute state columns missing in database, returning default mute state. Run latest migrations to enable persistence.',
          { roomId, userId }
        );
        return null;
      }

      throw error;
    }
  }

  static async getRoomParticipantMuteStates(roomId: string): Promise<Record<string, {
    isAudioMuted: boolean;
    isVideoMuted: boolean;
    audioMutedAt: Date | null;
    videoMutedAt: Date | null;
  }>> {
    const columnsAvailable = await areMuteColumnsAvailable();
    if (!columnsAvailable) {
      return {};
    }

    try {
      const participants = await prisma.participant.findMany({
        where: {
          roomId,
          leftAt: null,
        },
        select: {
          userId: true,
          audioMuted: true,
          videoMuted: true,
          audioMutedAt: true,
          videoMutedAt: true,
        },
      });

      return participants.reduce<Record<string, {
        isAudioMuted: boolean;
        isVideoMuted: boolean;
        audioMutedAt: Date | null;
        videoMutedAt: Date | null;
      }>>((acc, participant) => {
        acc[participant.userId] = {
          isAudioMuted: participant.audioMuted,
          isVideoMuted: participant.videoMuted,
          audioMutedAt: participant.audioMutedAt,
          videoMutedAt: participant.videoMutedAt,
        };
        return acc;
      }, {});
    } catch (error: any) {
      if (isMuteColumnMissingError(error)) {
        logger.warn(
          'Mute state columns missing in database, returning empty mute state map. Run latest migrations to enable persistence.',
          { roomId }
        );
        return {};
      }

      throw error;
    }
  }

  static async setParticipantControlState(
    roomId: string,
    userId: string,
    state: {
      forcedAudio?: boolean;
      forcedVideo?: boolean;
      forcedAudioAt?: Date | null;
      forcedVideoAt?: Date | null;
      forcedBy?: string | null;
      forcedReason?: string | null;
    }
  ): Promise<RoomControlState | null> {
    const existing = await prisma.roomControlState.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId,
        },
      },
    });

    const nextForcedAudio =
      state.forcedAudio !== undefined ? state.forcedAudio : existing?.forcedAudio ?? false;
    const nextForcedVideo =
      state.forcedVideo !== undefined ? state.forcedVideo : existing?.forcedVideo ?? false;

    const nextForcedAudioAt =
      state.forcedAudio !== undefined
        ? state.forcedAudio
          ? state.forcedAudioAt ?? new Date()
          : null
        : existing?.forcedAudioAt ?? null;

    const nextForcedVideoAt =
      state.forcedVideo !== undefined
        ? state.forcedVideo
          ? state.forcedVideoAt ?? new Date()
          : null
        : existing?.forcedVideoAt ?? null;

    const hasForcedBy = Object.prototype.hasOwnProperty.call(state, 'forcedBy');
    const nextForcedBy = hasForcedBy ? state.forcedBy ?? null : existing?.forcedBy ?? null;

    const hasForcedReason = Object.prototype.hasOwnProperty.call(state, 'forcedReason');
    const nextForcedReason = hasForcedReason
      ? state.forcedReason ?? null
      : existing?.forcedReason ?? null;

    if (!nextForcedAudio && !nextForcedVideo) {
      if (existing) {
        await prisma.roomControlState.delete({
          where: {
            roomId_userId: {
              roomId,
              userId,
            },
          },
        });
      }

      return null;
    }

    return prisma.roomControlState.upsert({
      where: {
        roomId_userId: {
          roomId,
          userId,
        },
      },
      create: {
        roomId,
        userId,
        forcedAudio: nextForcedAudio,
        forcedVideo: nextForcedVideo,
        forcedAudioAt: nextForcedAudioAt,
        forcedVideoAt: nextForcedVideoAt,
        forcedBy: nextForcedBy,
        forcedReason: nextForcedReason,
      },
      update: {
        forcedAudio: nextForcedAudio,
        forcedVideo: nextForcedVideo,
        forcedAudioAt: nextForcedAudioAt,
        forcedVideoAt: nextForcedVideoAt,
        forcedBy: nextForcedBy,
        forcedReason: nextForcedReason,
      },
    });
  }

  static async getParticipantControlState(
    roomId: string,
    userId: string
  ): Promise<ParticipantControlState | null> {
    const state = await prisma.roomControlState.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId,
        },
      },
    });

    if (!state) {
      return null;
    }

    return {
      forcedAudio: state.forcedAudio,
      forcedVideo: state.forcedVideo,
      forcedAudioAt: state.forcedAudioAt,
      forcedVideoAt: state.forcedVideoAt,
      forcedBy: state.forcedBy ?? null,
      forcedReason: state.forcedReason ?? null,
    };
  }

  static async getRoomControlStates(roomId: string): Promise<Record<string, ParticipantControlState>> {
    const states = await prisma.roomControlState.findMany({
      where: {
        roomId,
      },
    });

    return states.reduce<Record<string, ParticipantControlState>>((acc, state) => {
      acc[state.userId] = {
        forcedAudio: state.forcedAudio,
        forcedVideo: state.forcedVideo,
        forcedAudioAt: state.forcedAudioAt,
        forcedVideoAt: state.forcedVideoAt,
        forcedBy: state.forcedBy ?? null,
        forcedReason: state.forcedReason ?? null,
      };
      return acc;
    }, {});
  }

  static async clearParticipantControlState(roomId: string, userId: string): Promise<void> {
    await prisma.roomControlState.deleteMany({
      where: {
        roomId,
        userId,
      },
    });
  }

  static async getRoomHostState(roomId: string): Promise<RoomHostControlState | null> {
    const state = await prisma.roomHostState.findUnique({
      where: { roomId },
    });

    if (!state) {
      return null;
    }

    return {
      locked: state.locked,
      lockedBy: state.lockedBy ?? null,
      lockedAt: state.lockedAt ?? null,
      lockedReason: state.lockedReason ?? null,
      audioForceAll: state.audioForceAll,
      audioForcedBy: state.audioForcedBy ?? null,
      audioForcedAt: state.audioForcedAt ?? null,
      audioForceReason: state.audioForceReason ?? null,
      videoForceAll: state.videoForceAll,
      videoForcedBy: state.videoForcedBy ?? null,
      videoForcedAt: state.videoForcedAt ?? null,
      videoForceReason: state.videoForceReason ?? null,
      chatForceAll: state.chatForceAll,
      chatForcedBy: state.chatForcedBy ?? null,
      chatForcedAt: state.chatForcedAt ?? null,
      chatForceReason: state.chatForceReason ?? null,
    };
  }

  static async upsertRoomHostState(
    roomId: string,
    updates: Partial<RoomHostControlState>
  ): Promise<RoomHostControlState> {
    const existing = await prisma.roomHostState.findUnique({
      where: { roomId },
    });

    const now = new Date();

    const lockedUpdateProvided = Object.prototype.hasOwnProperty.call(updates, 'locked');
    const lockedByUpdateProvided = Object.prototype.hasOwnProperty.call(updates, 'lockedBy');
    const lockedAtUpdateProvided = Object.prototype.hasOwnProperty.call(updates, 'lockedAt');

    const nextLocked = lockedUpdateProvided ? Boolean(updates.locked) : existing?.locked ?? false;

    const nextLockedBy = lockedUpdateProvided
      ? nextLocked
        ? lockedByUpdateProvided
          ? updates.lockedBy ?? null
          : existing?.lockedBy ?? null
        : null
      : lockedByUpdateProvided
      ? updates.lockedBy ?? null
      : existing?.lockedBy ?? null;

    let nextLockedAt: Date | null;
    if (lockedUpdateProvided) {
      if (nextLocked) {
        if (lockedAtUpdateProvided) {
          nextLockedAt = updates.lockedAt ?? null;
        } else if (existing?.lockedAt) {
          nextLockedAt = existing.lockedAt;
        } else {
          nextLockedAt = now;
        }
      } else {
        nextLockedAt = null;
      }
    } else if (lockedAtUpdateProvided) {
      nextLockedAt = updates.lockedAt ?? null;
    } else {
      nextLockedAt = existing?.lockedAt ?? null;
    }

    const lockedReasonUpdateProvided = Object.prototype.hasOwnProperty.call(
      updates,
      'lockedReason'
    );

    const nextLockedReason = lockedUpdateProvided
      ? nextLocked
        ? lockedReasonUpdateProvided
          ? updates.lockedReason ?? null
          : existing?.lockedReason ?? null
        : null
      : lockedReasonUpdateProvided
      ? updates.lockedReason ?? null
      : existing?.lockedReason ?? null;

    const audioForceUpdateProvided = Object.prototype.hasOwnProperty.call(
      updates,
      'audioForceAll'
    );
    const audioForcedByUpdateProvided = Object.prototype.hasOwnProperty.call(
      updates,
      'audioForcedBy'
    );
    const audioForcedAtUpdateProvided = Object.prototype.hasOwnProperty.call(
      updates,
      'audioForcedAt'
    );

    const nextAudioForceAll = audioForceUpdateProvided
      ? Boolean(updates.audioForceAll)
      : existing?.audioForceAll ?? false;

    const nextAudioForcedBy = audioForceUpdateProvided
      ? nextAudioForceAll
        ? audioForcedByUpdateProvided
          ? updates.audioForcedBy ?? null
          : existing?.audioForcedBy ?? null
        : null
      : audioForcedByUpdateProvided
      ? updates.audioForcedBy ?? null
      : existing?.audioForcedBy ?? null;

    let nextAudioForcedAt: Date | null;
    if (audioForceUpdateProvided) {
      if (nextAudioForceAll) {
        if (audioForcedAtUpdateProvided) {
          nextAudioForcedAt = updates.audioForcedAt ?? null;
        } else if (existing?.audioForcedAt) {
          nextAudioForcedAt = existing.audioForcedAt;
        } else {
          nextAudioForcedAt = now;
        }
      } else {
        nextAudioForcedAt = null;
      }
    } else if (audioForcedAtUpdateProvided) {
      nextAudioForcedAt = updates.audioForcedAt ?? null;
    } else {
      nextAudioForcedAt = existing?.audioForcedAt ?? null;
    }

    const audioForceReasonUpdateProvided = Object.prototype.hasOwnProperty.call(
      updates,
      'audioForceReason'
    );

    const nextAudioForceReason = audioForceUpdateProvided
      ? nextAudioForceAll
        ? audioForceReasonUpdateProvided
          ? updates.audioForceReason ?? null
          : existing?.audioForceReason ?? null
        : null
      : audioForceReasonUpdateProvided
      ? updates.audioForceReason ?? null
      : existing?.audioForceReason ?? null;

    const videoForceUpdateProvided = Object.prototype.hasOwnProperty.call(
      updates,
      'videoForceAll'
    );
    const videoForcedByUpdateProvided = Object.prototype.hasOwnProperty.call(
      updates,
      'videoForcedBy'
    );
    const videoForcedAtUpdateProvided = Object.prototype.hasOwnProperty.call(
      updates,
      'videoForcedAt'
    );

    const nextVideoForceAll = videoForceUpdateProvided
      ? Boolean(updates.videoForceAll)
      : existing?.videoForceAll ?? false;

    const nextVideoForcedBy = videoForceUpdateProvided
      ? nextVideoForceAll
        ? videoForcedByUpdateProvided
          ? updates.videoForcedBy ?? null
          : existing?.videoForcedBy ?? null
        : null
      : videoForcedByUpdateProvided
      ? updates.videoForcedBy ?? null
      : existing?.videoForcedBy ?? null;

    let nextVideoForcedAt: Date | null;
    if (videoForceUpdateProvided) {
      if (nextVideoForceAll) {
        if (videoForcedAtUpdateProvided) {
          nextVideoForcedAt = updates.videoForcedAt ?? null;
        } else if (existing?.videoForcedAt) {
          nextVideoForcedAt = existing.videoForcedAt;
        } else {
          nextVideoForcedAt = now;
        }
      } else {
        nextVideoForcedAt = null;
      }
    } else if (videoForcedAtUpdateProvided) {
      nextVideoForcedAt = updates.videoForcedAt ?? null;
    } else {
      nextVideoForcedAt = existing?.videoForcedAt ?? null;
    }

    const videoForceReasonUpdateProvided = Object.prototype.hasOwnProperty.call(
      updates,
      'videoForceReason'
    );

    const nextVideoForceReason = videoForceUpdateProvided
      ? nextVideoForceAll
        ? videoForceReasonUpdateProvided
          ? updates.videoForceReason ?? null
          : existing?.videoForceReason ?? null
        : null
      : videoForceReasonUpdateProvided
      ? updates.videoForceReason ?? null
      : existing?.videoForceReason ?? null;

    const chatForceUpdateProvided = Object.prototype.hasOwnProperty.call(
      updates,
      'chatForceAll'
    );
    const chatForcedByUpdateProvided = Object.prototype.hasOwnProperty.call(
      updates,
      'chatForcedBy'
    );
    const chatForcedAtUpdateProvided = Object.prototype.hasOwnProperty.call(
      updates,
      'chatForcedAt'
    );

    const nextChatForceAll = chatForceUpdateProvided
      ? Boolean(updates.chatForceAll)
      : existing?.chatForceAll ?? false;

    const nextChatForcedBy = chatForceUpdateProvided
      ? nextChatForceAll
        ? chatForcedByUpdateProvided
          ? updates.chatForcedBy ?? null
          : existing?.chatForcedBy ?? null
        : null
      : chatForcedByUpdateProvided
      ? updates.chatForcedBy ?? null
      : existing?.chatForcedBy ?? null;

    let nextChatForcedAt: Date | null;
    if (chatForceUpdateProvided) {
      if (nextChatForceAll) {
        if (chatForcedAtUpdateProvided) {
          nextChatForcedAt = updates.chatForcedAt ?? null;
        } else if (existing?.chatForcedAt) {
          nextChatForcedAt = existing.chatForcedAt;
        } else {
          nextChatForcedAt = now;
        }
      } else {
        nextChatForcedAt = null;
      }
    } else if (chatForcedAtUpdateProvided) {
      nextChatForcedAt = updates.chatForcedAt ?? null;
    } else {
      nextChatForcedAt = existing?.chatForcedAt ?? null;
    }

    const chatForceReasonUpdateProvided = Object.prototype.hasOwnProperty.call(
      updates,
      'chatForceReason'
    );

    const nextChatForceReason = chatForceUpdateProvided
      ? nextChatForceAll
        ? chatForceReasonUpdateProvided
          ? updates.chatForceReason ?? null
          : existing?.chatForceReason ?? null
        : null
      : chatForceReasonUpdateProvided
      ? updates.chatForceReason ?? null
      : existing?.chatForceReason ?? null;

    const record = await prisma.roomHostState.upsert({
      where: { roomId },
      create: {
        roomId,
        locked: nextLocked,
        lockedBy: nextLockedBy,
        lockedAt: nextLockedAt,
        lockedReason: nextLockedReason,
        audioForceAll: nextAudioForceAll,
        audioForcedBy: nextAudioForcedBy,
        audioForcedAt: nextAudioForcedAt,
        audioForceReason: nextAudioForceReason,
        videoForceAll: nextVideoForceAll,
        videoForcedBy: nextVideoForcedBy,
        videoForcedAt: nextVideoForcedAt,
        videoForceReason: nextVideoForceReason,
        chatForceAll: nextChatForceAll,
        chatForcedBy: nextChatForcedBy,
        chatForcedAt: nextChatForcedAt,
        chatForceReason: nextChatForceReason,
      },
      update: {
        locked: nextLocked,
        lockedBy: nextLockedBy,
        lockedAt: nextLockedAt,
        lockedReason: nextLockedReason,
        audioForceAll: nextAudioForceAll,
        audioForcedBy: nextAudioForcedBy,
        audioForcedAt: nextAudioForcedAt,
        audioForceReason: nextAudioForceReason,
        videoForceAll: nextVideoForceAll,
        videoForcedBy: nextVideoForcedBy,
        videoForcedAt: nextVideoForcedAt,
        videoForceReason: nextVideoForceReason,
        chatForceAll: nextChatForceAll,
        chatForcedBy: nextChatForcedBy,
        chatForcedAt: nextChatForcedAt,
        chatForceReason: nextChatForceReason,
      },
    });

    return {
      locked: record.locked,
      lockedBy: record.lockedBy ?? null,
      lockedAt: record.lockedAt ?? null,
      lockedReason: record.lockedReason ?? null,
      audioForceAll: record.audioForceAll,
      audioForcedBy: record.audioForcedBy ?? null,
      audioForcedAt: record.audioForcedAt ?? null,
      audioForceReason: record.audioForceReason ?? null,
      videoForceAll: record.videoForceAll,
      videoForcedBy: record.videoForcedBy ?? null,
      videoForcedAt: record.videoForcedAt ?? null,
      videoForceReason: record.videoForceReason ?? null,
      chatForceAll: record.chatForceAll,
      chatForcedBy: record.chatForcedBy ?? null,
      chatForcedAt: record.chatForcedAt ?? null,
      chatForceReason: record.chatForceReason ?? null,
    };
  }

  static async clearRoomHostState(roomId: string): Promise<void> {
    await prisma.roomHostState.deleteMany({
      where: { roomId },
    });
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

