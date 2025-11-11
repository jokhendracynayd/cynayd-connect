import { Server as SocketIOServer, Socket } from 'socket.io';
import { RouterManager } from '../../media/Router';
import { RoomService, type RoomHostControlState } from '../../shared/services/rooms.service';
import { ProducerManager } from '../../media/Producer';
import { ConsumerManager } from '../../media/Consumer';
import { TransportManager } from '../../media/Transport';
import { logger } from '../../shared/utils/logger';
import { ForbiddenError, ConflictError } from '../../shared/utils/errors';
import redis from '../../shared/database/redis';
import { RedisStateService, type RedisRoomControlStatePayload } from '../../shared/services/state.redis';
import { RoomRoutingService } from '../../shared/services/room-routing.service';
import { config } from '../../shared/config';
import prisma from '../../shared/database/prisma';
import type { Participant } from '@prisma/client';
import { ParticipantRole } from '@prisma/client';

type RoomWithParticipants = Awaited<ReturnType<typeof RoomService.getRoomByCode>>;

export interface ParticipantRosterEntry {
  userId: string;
  name: string;
  email: string;
  picture?: string | null;
  role: ParticipantRole;
  isAdmin: boolean;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isAudioForceMuted: boolean;
  isVideoForceMuted: boolean;
  isSpeaking: boolean;
  hasRaisedHand: boolean;
  joinedAt: string;
  audioMutedAt?: string | null;
  videoMutedAt?: string | null;
  audioForceMutedAt?: string | null;
  videoForceMutedAt?: string | null;
  audioForceMutedBy?: string | null;
  videoForceMutedBy?: string | null;
  forceMuteReason?: string | null;
}

function normalizeDate(value?: Date | string | null): string {
  if (!value) {
    return new Date().toISOString();
  }
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

type PersistedMuteState = {
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  audioMutedAt?: number | null;
  videoMutedAt?: number | null;
  updatedAt?: number;
  forcedAudio?: boolean;
  forcedVideo?: boolean;
  forcedAudioAt?: number | null;
  forcedVideoAt?: number | null;
  forcedBy?: string | null;
  forcedReason?: string | null;
};

function buildParticipantRoster(
  room: RoomWithParticipants,
  muteStateOverrides: Record<string, PersistedMuteState> = {}
): ParticipantRosterEntry[] {
  if (!room?.participants?.length) {
    return [];
  }

  const deduped = new Map<string, ParticipantRosterEntry>();

  for (const participant of room.participants as Array<Participant & { user: { id: string; name: string; email: string; picture?: string | null } }>) {
    if (!participant?.user) {
      continue;
    }

    const { user } = participant;
    const joinedAtIso = normalizeDate(participant.joinedAt ?? undefined);
    const override = muteStateOverrides[user.id];
    const audioMutedAtMs = override?.audioMutedAt ?? participant.audioMutedAt?.getTime() ?? null;
    const videoMutedAtMs = override?.videoMutedAt ?? participant.videoMutedAt?.getTime() ?? null;
    const audioForceMutedAtMs = override?.forcedAudioAt ?? null;
    const videoForceMutedAtMs = override?.forcedVideoAt ?? null;
    const participantRole = participant.role ?? ParticipantRole.PARTICIPANT;

    const entry: ParticipantRosterEntry = {
      userId: user.id,
      name: user.name,
      email: user.email,
      picture: user.picture,
      role: participantRole,
      isAdmin:
        RoomService.isModeratorRole(participantRole) ||
        room.adminId === user.id,
      isAudioMuted: override?.isAudioMuted ?? participant.audioMuted ?? true,
      isVideoMuted: override?.isVideoMuted ?? participant.videoMuted ?? true,
      isAudioForceMuted: override?.forcedAudio ?? false,
      isVideoForceMuted: override?.forcedVideo ?? false,
      isSpeaking: false,
      hasRaisedHand: false,
      joinedAt: joinedAtIso,
      audioMutedAt: audioMutedAtMs ? new Date(audioMutedAtMs).toISOString() : null,
      videoMutedAt: videoMutedAtMs ? new Date(videoMutedAtMs).toISOString() : null,
      audioForceMutedAt: audioForceMutedAtMs ? new Date(audioForceMutedAtMs).toISOString() : null,
      videoForceMutedAt: videoForceMutedAtMs ? new Date(videoForceMutedAtMs).toISOString() : null,
      audioForceMutedBy: override?.forcedBy ?? null,
      videoForceMutedBy: override?.forcedBy ?? null,
      forceMuteReason: override?.forcedReason ?? null,
    };

    const existing = deduped.get(user.id);

    if (!existing) {
      deduped.set(user.id, entry);
      continue;
    }

    // Retain the latest record based on joinedAt
    if (new Date(entry.joinedAt).getTime() >= new Date(existing.joinedAt).getTime()) {
      deduped.set(user.id, entry);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
}

interface RoomJoinRequestUser {
  id: string;
  name: string;
  email: string;
  picture?: string | null;
}

interface RoomJoinRequestWithUser {
  id: string;
  requestedAt: Date;
  user: RoomJoinRequestUser;
}

function isRoomJoinRequestWithUser(value: unknown): value is RoomJoinRequestWithUser {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<RoomJoinRequestWithUser>;
  const user = candidate.user as Partial<RoomJoinRequestUser> | undefined;

  return (
    typeof candidate.id === 'string' &&
    candidate.requestedAt instanceof Date &&
    !!user &&
    typeof user.id === 'string' &&
    typeof user.name === 'string' &&
    typeof user.email === 'string'
  );
}

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

interface HandleSocketLeaveOptions {
  reason?: string | null;
  triggeredByDisconnect?: boolean;
}

interface HandleSocketLeaveResult {
  success: boolean;
  skipped?: boolean;
  alreadyLeft?: boolean;
  reason?: string | null;
  cleanupFailed?: boolean;
}

export async function handleSocketLeave(
  _io: SocketIOServer,
  socket: Socket,
  options: HandleSocketLeaveOptions = {}
): Promise<HandleSocketLeaveResult> {
  const roomCode: string | undefined = socket.data.roomCode;
  const userId: string | undefined = socket.data.userId;

  const reason = options.reason ?? null;
  const triggeredByDisconnect = options.triggeredByDisconnect ?? false;

  if (!roomCode || !userId) {
    logger.debug('handleSocketLeave: socket not associated with a room, skipping', {
      socketId: socket.id,
      reason,
    });
    return { success: true, skipped: true, reason };
  }

  if (socket.data.hasLeftRoom) {
    logger.debug('handleSocketLeave: socket already processed leave, ignoring duplicate call', {
      socketId: socket.id,
      userId,
      roomCode,
      reason,
    });
    return { success: true, alreadyLeft: true, reason };
  }

  socket.data.hasLeftRoom = true;

  let cleanupFailed = false;

  try {
    await cleanupSocketWithRetry(socket.id);
  } catch (error) {
    cleanupFailed = true;
    logger.error('handleSocketLeave: failed to cleanup socket resources', {
      socketId: socket.id,
      userId,
      roomCode,
      error,
    });
  }

  try {
    await RoomService.leaveRoom(userId, roomCode);
  } catch (error: any) {
    logger.warn('handleSocketLeave: error updating participant record during leave', {
      socketId: socket.id,
      userId,
      roomCode,
      error: error?.message || error,
    });
  }

  if (userId) {
    try {
      await RedisStateService.clearParticipantMuteState(roomCode, userId);
    } catch (error: any) {
      logger.warn('handleSocketLeave: failed to clear participant mute state', {
        socketId: socket.id,
        userId,
        roomCode,
        error: error?.message || error,
      });
    }
  }

  const payload = {
    userId,
    leftAt: new Date().toISOString(),
    reason,
  };

  try {
    socket.to(roomCode).emit('user-left', payload);
  } catch (error) {
    logger.warn('handleSocketLeave: failed to emit user-left event', {
      socketId: socket.id,
      userId,
      roomCode,
      error,
    });
  }

  try {
    await socket.leave(roomCode);
  } catch (error) {
    logger.warn('handleSocketLeave: failed to leave socket room', {
      socketId: socket.id,
      userId,
      roomCode,
      error,
    });
  }

  try {
    await redis.publish('room:leave', JSON.stringify({
      roomCode,
      userId,
      socketId: socket.id,
      reason,
    }));
  } catch (error) {
    logger.warn('handleSocketLeave: failed to publish room leave event', {
      socketId: socket.id,
      userId,
      roomCode,
      error,
    });
  }

  socket.data.roomCode = undefined;
  socket.data.roomId = undefined;
  socket.data.participantRole = undefined;
  socket.data.isHost = false;
  socket.data.isAdmin = false;
  socket.data.roomAdminId = undefined;

  logger.info('handleSocketLeave: user left room', {
    socketId: socket.id,
    userId,
    roomCode,
    reason,
    triggeredByDisconnect,
    cleanupFailed,
  });

  return { success: true, reason, cleanupFailed };
}

interface JoinRoomData {
  roomCode: string;
  name: string;
  email: string;
  picture?: string;
}

interface UpdateRolePayload {
  targetUserId?: string;
  role?: string;
}

export function roomHandler(io: SocketIOServer, socket: Socket) {
  const resolveHostContext = (options?: { requireHost?: boolean }) => {
    const roomCode: string | undefined = socket.data.roomCode;
    const roomId: string | undefined = socket.data.roomId;
    const actorUserId: string | undefined = socket.data.userId;
    const participantRole: ParticipantRole | undefined = socket.data.participantRole;
    const roomAdminId: string | undefined = socket.data.roomAdminId;
    const isHost = socket.data.isHost === true || (!!roomAdminId && roomAdminId === actorUserId);
    const isModerator =
      isHost || RoomService.isModeratorRole(participantRole);

    if (!roomCode || !roomId || !actorUserId) {
      throw new Error('Host control requires active room context.');
    }

    if (options?.requireHost) {
      if (!isHost) {
      throw new ForbiddenError('Only the room host can perform this action.');
      }
    } else if (!isModerator) {
      throw new ForbiddenError('Only hosts or co-hosts can perform this action.');
    }

    return { roomCode, roomId, actorUserId, participantRole, isHost, roomAdminId };
  };

  const emitRoomHostState = async (roomCode: string, roomId: string) => {
    try {
      const [hostState, redisState] = await Promise.all([
        RoomService.getRoomHostState(roomId),
        RedisStateService.getRoomControlState(roomCode),
      ]);

      io.to(roomCode).emit('host-control:room-state', {
        locked: hostState?.locked ?? redisState?.locked ?? false,
        lockedBy: hostState?.lockedBy ?? redisState?.lockedBy ?? null,
        lockedReason: hostState?.lockedReason ?? redisState?.lockedReason ?? null,
        audioForceAll: hostState?.audioForceAll ?? redisState?.audioForceAll ?? false,
        audioForcedBy: hostState?.audioForcedBy ?? redisState?.audioForcedBy ?? null,
        audioForceReason:
          hostState?.audioForceReason ?? redisState?.audioForceReason ?? null,
        videoForceAll: hostState?.videoForceAll ?? redisState?.videoForceAll ?? false,
        videoForcedBy: hostState?.videoForcedBy ?? redisState?.videoForcedBy ?? null,
        videoForceReason:
          hostState?.videoForceReason ?? redisState?.videoForceReason ?? null,
        chatForceAll: hostState?.chatForceAll ?? redisState?.chatForceAll ?? false,
        chatForcedBy: hostState?.chatForcedBy ?? redisState?.chatForcedBy ?? null,
        chatForceReason:
          hostState?.chatForceReason ?? redisState?.chatForceReason ?? null,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to emit room host state', { roomCode, roomId, error });
    }
  };

  const enforceParticipantMute = async ({
    targetUserId,
    roomCode,
    roomId,
    actorUserId,
    targets,
    mute,
    reason,
    timestamp,
    roomSockets,
    roomAdminId,
  }: {
    targetUserId: string;
    roomCode: string;
    roomId: string;
    actorUserId: string;
    targets: Set<'audio' | 'video'>;
    mute: boolean;
    reason: string | null;
    timestamp: number;
    roomSockets: Array<any>;
    roomAdminId?: string;
  }) => {
    const targetSockets = roomSockets.filter(
      participantSocket => participantSocket.data.userId === targetUserId
    );

    const redisState = await RedisStateService.getParticipantMuteState(
      roomCode,
      targetUserId
    );

    let currentAudioMuted = redisState?.isAudioMuted;
    let currentVideoMuted = redisState?.isVideoMuted;

    let existingAudioMutedAt =
      typeof redisState?.audioMutedAt === 'number' ? redisState.audioMutedAt : null;
    let existingVideoMutedAt =
      typeof redisState?.videoMutedAt === 'number' ? redisState.videoMutedAt : null;

    if (
      roomId &&
      (typeof currentAudioMuted !== 'boolean' ||
        typeof currentVideoMuted !== 'boolean' ||
        existingAudioMutedAt === null ||
        existingVideoMutedAt === null)
    ) {
      const dbState = await RoomService.getParticipantMuteState(roomId, targetUserId);
      if (dbState) {
        if (typeof currentAudioMuted !== 'boolean') {
          currentAudioMuted = dbState.isAudioMuted;
        }
        if (typeof currentVideoMuted !== 'boolean') {
          currentVideoMuted = dbState.isVideoMuted;
        }
        if (existingAudioMutedAt === null && dbState.audioMutedAt) {
          existingAudioMutedAt = dbState.audioMutedAt.getTime();
        }
        if (existingVideoMutedAt === null && dbState.videoMutedAt) {
          existingVideoMutedAt = dbState.videoMutedAt.getTime();
        }
      }
    }

    if (typeof currentAudioMuted !== 'boolean') {
      currentAudioMuted = true;
    }
    if (typeof currentVideoMuted !== 'boolean') {
      currentVideoMuted = true;
    }

    let nextAudioMuted = currentAudioMuted;
    let nextVideoMuted = currentVideoMuted;

    if (targets.has('audio')) {
      nextAudioMuted = mute;
    }
    if (targets.has('video')) {
      nextVideoMuted = mute;
    }

    const nextAudioMutedAtMs = targets.has('audio')
      ? mute
        ? timestamp
        : null
      : existingAudioMutedAt;
    const nextVideoMutedAtMs = targets.has('video')
      ? mute
        ? timestamp
        : null
      : existingVideoMutedAt;

    const isTargetHost = roomAdminId ? targetUserId === roomAdminId : false;
    const shouldForceAudio = targets.has('audio') && mute && !isTargetHost;
    const shouldForceVideo = targets.has('video') && mute && !isTargetHost;
    const forcedByValue = shouldForceAudio || shouldForceVideo ? actorUserId : null;
    const forcedReasonValue =
      shouldForceAudio || shouldForceVideo ? reason ?? null : null;

    for (const targetSocket of targetSockets) {
      if (targets.has('audio')) {
        if (mute) {
          ProducerManager.pauseProducerByKind(targetSocket.id, 'audio');
        } else if (!nextAudioMuted) {
          ProducerManager.resumeProducerByKind(targetSocket.id, 'audio');
        }
      }

      if (targets.has('video')) {
        if (mute) {
          ProducerManager.pauseProducerByKind(targetSocket.id, 'video');
        } else if (!nextVideoMuted) {
          ProducerManager.resumeProducerByKind(targetSocket.id, 'video');
        }
      }
    }

    await RedisStateService.setParticipantMuteState(roomCode, targetUserId, {
      isAudioMuted: nextAudioMuted,
      isVideoMuted: nextVideoMuted,
      audioMutedAt: nextAudioMutedAtMs ?? null,
      videoMutedAt: nextVideoMutedAtMs ?? null,
      forcedAudio: targets.has('audio')
        ? shouldForceAudio
        : redisState?.forcedAudio ?? false,
      forcedVideo: targets.has('video')
        ? shouldForceVideo
        : redisState?.forcedVideo ?? false,
      forcedAudioAt:
        targets.has('audio')
          ? shouldForceAudio
          ? timestamp
            : null
          : redisState?.forcedAudioAt,
      forcedVideoAt:
        targets.has('video')
          ? shouldForceVideo
          ? timestamp
            : null
          : redisState?.forcedVideoAt,
      forcedBy:
        targets.has('audio') || targets.has('video')
          ? forcedByValue
          : redisState?.forcedBy ?? null,
      forcedReason:
        targets.has('audio') || targets.has('video')
          ? forcedReasonValue
          : redisState?.forcedReason ?? null,
      updatedAt: timestamp,
    });

    if (targets.has('audio')) {
      await RoomService.updateParticipantMuteState(roomId, targetUserId, {
        isAudioMuted: nextAudioMuted,
        audioMutedAt: nextAudioMutedAtMs ? new Date(nextAudioMutedAtMs) : null,
      });
    }

    if (targets.has('video')) {
      await RoomService.updateParticipantMuteState(roomId, targetUserId, {
        isVideoMuted: nextVideoMuted,
        videoMutedAt: nextVideoMutedAtMs ? new Date(nextVideoMutedAtMs) : null,
      });
    }

    await RoomService.setParticipantControlState(roomId, targetUserId, {
      forcedAudio: targets.has('audio') ? shouldForceAudio : undefined,
      forcedVideo: targets.has('video') ? shouldForceVideo : undefined,
      forcedAudioAt:
        targets.has('audio')
          ? shouldForceAudio
          ? new Date(timestamp)
            : null
          : undefined,
      forcedVideoAt:
        targets.has('video')
          ? shouldForceVideo
          ? new Date(timestamp)
            : null
          : undefined,
      forcedBy:
        targets.has('audio') || targets.has('video') ? forcedByValue : undefined,
      forcedReason:
        targets.has('audio') || targets.has('video') ? forcedReasonValue : undefined,
    });

    if (targets.has('audio')) {
      io.to(roomCode).emit('audio-mute', {
        userId: targetUserId,
        isAudioMuted: nextAudioMuted,
        forced: shouldForceAudio,
        forcedBy: shouldForceAudio ? actorUserId : null,
        reason: shouldForceAudio ? reason ?? null : null,
        enforced: true,
        timestamp,
      });
    }

    if (targets.has('video')) {
      io.to(roomCode).emit('video-mute', {
        userId: targetUserId,
        isVideoMuted: nextVideoMuted,
        forced: shouldForceVideo,
        forcedBy: shouldForceVideo ? actorUserId : null,
        reason: shouldForceVideo ? reason ?? null : null,
        enforced: true,
        timestamp,
      });
    }

    io.to(roomCode).emit('host-control:participant-state', {
      userId: targetUserId,
      audio: targets.has('audio')
        ? { muted: nextAudioMuted, forced: shouldForceAudio }
        : undefined,
      video: targets.has('video')
        ? { muted: nextVideoMuted, forced: shouldForceVideo }
        : undefined,
      reason: forcedReasonValue,
      actorUserId,
      timestamp,
    });
  };
  
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

      const [roomHostState, redisRoomControlState] = await Promise.all([
        RoomService.getRoomHostState(room.id),
        RedisStateService.getRoomControlState(normalizedRoomCode),
      ]);

      const isRoomLocked =
        (roomHostState?.locked ?? false) || (redisRoomControlState?.locked ?? false);

      if (isRoomLocked && room.adminId !== userId) {
        logger.info(
          `Blocking user ${userId} from joining locked room ${normalizedRoomCode}`
        );
        return callback({
          success: false,
          error: 'Room is currently locked by the host.',
          locked: true,
        });
      }

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
              const joinRequest = isRoomJoinRequestWithUser(request) ? request : undefined;
              
              // Notify admin - use Socket.io room emission OR direct socket (not both to avoid duplicates)
              if (joinRequest) {
                const requestData = {
                  requestId: joinRequest.id,
                  userId: joinRequest.user.id,
                  name: joinRequest.user.name,
                  email: joinRequest.user.email,
                  picture: joinRequest.user.picture,
                  requestedAt: joinRequest.requestedAt,
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
                
                logger.info(`Notified admin ${room.adminId} about join request from ${joinRequest.user.name} (room: ${normalizedRoomCode})`);
              } else {
                logger.warn('RoomService.requestRoomJoin returned unexpected result when creating join request', {
                  userId,
                  roomCode: normalizedRoomCode,
                });
              }

              // Return waiting status so user sees waiting screen
              return callback({
                success: false,
                error: 'Room is private. Join request sent. Waiting for admin approval.',
                waitingApproval: true,
                ...(joinRequest ? { requestId: joinRequest.id } : {}),
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

      const participantRecord = updatedRoom.participants.find(
        participantEntry => participantEntry.userId === userId
      );
      const isHost = updatedRoom.adminId === userId;
      const participantRole =
        participantRecord?.role ??
        (isHost ? ParticipantRole.HOST : ParticipantRole.PARTICIPANT);
      const isModerator =
        isHost || RoomService.isModeratorRole(participantRole);

      // Store socket data (use normalized room code) - IMPORTANT: Set AFTER successful join
      socket.data.roomCode = normalizedRoomCode;
      socket.data.roomId = roomId;
      socket.data.userName = name;
      socket.data.userEmail = email;
      socket.data.userPicture = picture;
      socket.data.hasLeftRoom = false;
      socket.data.participantRole = participantRole;
      socket.data.isHost = isHost;
      socket.data.isAdmin = isModerator;
      socket.data.roomAdminId = updatedRoom.adminId;

      // Publish join event to Redis (for multi-server)
      await redis.publish('room:join', JSON.stringify({
        roomCode: normalizedRoomCode,
        userId,
        socketId: socket.id,
        name,
        email,
        picture,
      }));

      const redisMuteStates = await RedisStateService.getRoomMuteStates(normalizedRoomCode);
      const dbMuteStates = await RoomService.getRoomParticipantMuteStates(roomId);
      const controlStates = await RoomService.getRoomControlStates(roomId);

      const allUserIds = new Set<string>([
        ...Object.keys(dbMuteStates),
        ...Object.keys(redisMuteStates),
        ...Object.keys(controlStates),
      ]);

      if (!allUserIds.has(userId)) {
        allUserIds.add(userId);
      }

      const combinedMuteStates: Record<string, PersistedMuteState> = {};
      const usersNeedingRedisSync: Array<{ userId: string; state: PersistedMuteState }> = [];
      const controlStatePersistenceQueue: Array<{
        userId: string;
        forcedAudio: boolean;
        forcedVideo: boolean;
        forcedAudioAt: number | null;
        forcedVideoAt: number | null;
        forcedBy: string | null;
        forcedReason: string | null;
      }> = [];

      for (const userIdKey of allUserIds) {
        const dbState = dbMuteStates[userIdKey];
        const redisState = redisMuteStates[userIdKey];
        const controlState = controlStates[userIdKey];

        const redisAudioMutedAt =
          typeof redisState?.audioMutedAt === 'number' ? redisState.audioMutedAt : null;
        const redisVideoMutedAt =
          typeof redisState?.videoMutedAt === 'number' ? redisState.videoMutedAt : null;

        const audioMutedAtMs =
          redisAudioMutedAt ??
          (dbState?.audioMutedAt ? dbState.audioMutedAt.getTime() : null);
        const videoMutedAtMs =
          redisVideoMutedAt ??
          (dbState?.videoMutedAt ? dbState.videoMutedAt.getTime() : null);

        const isAudioMuted =
          typeof redisState?.isAudioMuted === 'boolean'
            ? redisState.isAudioMuted
            : dbState?.isAudioMuted ?? true;
        const isVideoMuted =
          typeof redisState?.isVideoMuted === 'boolean'
            ? redisState.isVideoMuted
            : dbState?.isVideoMuted ?? true;

        let forcedAudio =
          controlState?.forcedAudio ??
          (typeof redisState?.forcedAudio === 'boolean' ? redisState.forcedAudio : undefined) ??
          false;
        let forcedVideo =
          controlState?.forcedVideo ??
          (typeof redisState?.forcedVideo === 'boolean' ? redisState.forcedVideo : undefined) ??
          false;

        let forcedAudioAt =
          forcedAudio
            ? controlState?.forcedAudioAt?.getTime() ??
              (typeof redisState?.forcedAudioAt === 'number'
                ? redisState.forcedAudioAt
                : null)
            : null;
        let forcedVideoAt =
          forcedVideo
            ? controlState?.forcedVideoAt?.getTime() ??
              (typeof redisState?.forcedVideoAt === 'number'
                ? redisState.forcedVideoAt
                : null)
            : null;

        let forcedBy =
          controlState?.forcedBy ??
          (redisState && Object.prototype.hasOwnProperty.call(redisState, 'forcedBy')
            ? redisState.forcedBy ?? null
            : null);
        let forcedReason = controlState?.forcedReason ?? redisState?.forcedReason ?? null;

        const globalAudioForce =
          roomHostState?.audioForceAll ??
          redisRoomControlState?.audioForceAll ??
          false;
        const globalVideoForce =
          roomHostState?.videoForceAll ??
          redisRoomControlState?.videoForceAll ??
          false;

        if (!forcedAudio && globalAudioForce && userIdKey !== room.adminId) {
          forcedAudio = true;
          forcedAudioAt =
            roomHostState?.audioForcedAt?.getTime() ??
            (typeof redisRoomControlState?.audioForcedAt === 'number'
              ? redisRoomControlState.audioForcedAt
              : forcedAudioAt ?? Date.now());
          forcedBy =
            roomHostState?.audioForcedBy ??
            redisRoomControlState?.audioForcedBy ??
            forcedBy ??
            room.adminId;
          if (!forcedReason) {
            forcedReason =
              roomHostState?.audioForceReason ??
              redisRoomControlState?.audioForceReason ??
              null;
          }
        }

        if (!forcedVideo && globalVideoForce && userIdKey !== room.adminId) {
          forcedVideo = true;
          forcedVideoAt =
            roomHostState?.videoForcedAt?.getTime() ??
            (typeof redisRoomControlState?.videoForcedAt === 'number'
              ? redisRoomControlState.videoForcedAt
              : forcedVideoAt ?? Date.now());
          forcedBy =
            roomHostState?.videoForcedBy ??
            redisRoomControlState?.videoForcedBy ??
            forcedBy ??
            room.adminId;
          if (!forcedReason) {
            forcedReason =
              roomHostState?.videoForceReason ??
              redisRoomControlState?.videoForceReason ??
              null;
          }
        }

        const updatedAtCandidate = Math.max(
          audioMutedAtMs ?? 0,
          videoMutedAtMs ?? 0,
          forcedAudioAt ?? 0,
          forcedVideoAt ?? 0
        );

        const combined: PersistedMuteState = {
          isAudioMuted,
          isVideoMuted,
          audioMutedAt: audioMutedAtMs,
          videoMutedAt: videoMutedAtMs,
          updatedAt: updatedAtCandidate > 0 ? updatedAtCandidate : undefined,
          forcedAudio,
          forcedVideo,
          forcedAudioAt,
          forcedVideoAt,
          forcedBy: forcedBy ?? null,
          forcedReason: forcedReason ?? null,
        };

        if (
          (forcedAudio || forcedVideo) &&
          (!controlState ||
            controlState.forcedAudio !== forcedAudio ||
            controlState.forcedVideo !== forcedVideo ||
            (forcedAudio && !controlState.forcedAudioAt) ||
            (forcedVideo && !controlState.forcedVideoAt))
        ) {
          controlStatePersistenceQueue.push({
            userId: userIdKey,
            forcedAudio,
            forcedVideo,
            forcedAudioAt: forcedAudio ? forcedAudioAt ?? Date.now() : null,
            forcedVideoAt: forcedVideo ? forcedVideoAt ?? Date.now() : null,
            forcedBy: forcedBy ?? room.adminId,
            forcedReason: forcedReason ?? null,
          });
        }

        combinedMuteStates[userIdKey] = combined;

        const normalizedRedis = redisState
          ? {
              isAudioMuted: redisState.isAudioMuted,
              isVideoMuted: redisState.isVideoMuted,
              audioMutedAt: redisAudioMutedAt,
              videoMutedAt: redisVideoMutedAt,
              forcedAudio: redisState.forcedAudio ?? false,
              forcedVideo: redisState.forcedVideo ?? false,
              forcedAudioAt:
                redisState.forcedAudioAt !== undefined && redisState.forcedAudioAt !== null
                  ? redisState.forcedAudioAt
                  : null,
              forcedVideoAt:
                redisState.forcedVideoAt !== undefined && redisState.forcedVideoAt !== null
                  ? redisState.forcedVideoAt
                  : null,
              forcedBy: Object.prototype.hasOwnProperty.call(redisState, 'forcedBy')
                ? redisState.forcedBy ?? null
                : null,
              forcedReason: Object.prototype.hasOwnProperty.call(redisState, 'forcedReason')
                ? redisState.forcedReason ?? null
                : null,
            }
          : null;

        const targetForComparison = {
          isAudioMuted,
          isVideoMuted,
          audioMutedAt: audioMutedAtMs ?? null,
          videoMutedAt: videoMutedAtMs ?? null,
          forcedAudio,
          forcedVideo,
          forcedAudioAt: forcedAudio ? forcedAudioAt ?? null : null,
          forcedVideoAt: forcedVideo ? forcedVideoAt ?? null : null,
          forcedBy:
            forcedAudio || forcedVideo
              ? forcedBy ?? null
              : null,
          forcedReason: forcedReason ?? null,
        };

        const needsSync =
          !normalizedRedis ||
          normalizedRedis.isAudioMuted !== targetForComparison.isAudioMuted ||
          normalizedRedis.isVideoMuted !== targetForComparison.isVideoMuted ||
          (normalizedRedis.audioMutedAt ?? null) !== targetForComparison.audioMutedAt ||
          (normalizedRedis.videoMutedAt ?? null) !== targetForComparison.videoMutedAt ||
          (normalizedRedis.forcedAudio ?? false) !== targetForComparison.forcedAudio ||
          (normalizedRedis.forcedVideo ?? false) !== targetForComparison.forcedVideo ||
          (normalizedRedis.forcedAudioAt ?? null) !== targetForComparison.forcedAudioAt ||
          (normalizedRedis.forcedVideoAt ?? null) !== targetForComparison.forcedVideoAt ||
          (normalizedRedis.forcedBy ?? null) !== targetForComparison.forcedBy ||
          (normalizedRedis.forcedReason ?? null) !== targetForComparison.forcedReason;

        if (needsSync) {
          usersNeedingRedisSync.push({ userId: userIdKey, state: combined });
        }
      }

      if (usersNeedingRedisSync.length > 0) {
        await Promise.all(
          usersNeedingRedisSync.map(({ userId: targetUserId, state }) =>
            RedisStateService.setParticipantMuteState(normalizedRoomCode, targetUserId, {
              isAudioMuted: state.isAudioMuted,
              isVideoMuted: state.isVideoMuted,
              audioMutedAt: state.audioMutedAt ?? null,
              videoMutedAt: state.videoMutedAt ?? null,
              forcedAudio: state.forcedAudio ?? false,
              forcedVideo: state.forcedVideo ?? false,
              forcedAudioAt:
                state.forcedAudio ?? false ? state.forcedAudioAt ?? null : null,
              forcedVideoAt:
                state.forcedVideo ?? false ? state.forcedVideoAt ?? null : null,
              forcedBy:
                state.forcedAudio || state.forcedVideo ? state.forcedBy ?? null : null,
              forcedReason: state.forcedReason ?? null,
              updatedAt: state.updatedAt ?? Date.now(),
            })
          )
        );
      }

      if (controlStatePersistenceQueue.length > 0) {
        await Promise.all(
          controlStatePersistenceQueue.map(entry =>
            RoomService.setParticipantControlState(roomId, entry.userId, {
              forcedAudio: entry.forcedAudio,
              forcedVideo: entry.forcedVideo,
              forcedAudioAt:
                entry.forcedAudio && entry.forcedAudioAt
                  ? new Date(entry.forcedAudioAt)
                  : entry.forcedAudio
                  ? new Date()
                  : null,
              forcedVideoAt:
                entry.forcedVideo && entry.forcedVideoAt
                  ? new Date(entry.forcedVideoAt)
                  : entry.forcedVideo
                  ? new Date()
                  : null,
              forcedBy: entry.forcedBy,
              forcedReason: entry.forcedReason,
            })
          )
        );
      }

      const participantRoster = buildParticipantRoster(updatedRoom, combinedMuteStates);
      const joiningMuteState = combinedMuteStates[userId];
      const joiningParticipant =
        participantRoster.find((participant) => participant.userId === userId) ||
        {
          userId,
          name,
          email,
          picture,
          isAdmin: updatedRoom.adminId === userId,
          isAudioMuted: joiningMuteState?.isAudioMuted ?? true,
          isVideoMuted: joiningMuteState?.isVideoMuted ?? true,
          isAudioForceMuted: joiningMuteState?.forcedAudio ?? false,
          isVideoForceMuted: joiningMuteState?.forcedVideo ?? false,
          isSpeaking: false,
          hasRaisedHand: false,
          joinedAt: new Date().toISOString(),
          audioMutedAt: joiningMuteState?.audioMutedAt
            ? new Date(joiningMuteState.audioMutedAt).toISOString()
            : null,
          videoMutedAt: joiningMuteState?.videoMutedAt
            ? new Date(joiningMuteState.videoMutedAt).toISOString()
            : null,
          audioForceMutedAt: joiningMuteState?.forcedAudioAt
            ? new Date(joiningMuteState.forcedAudioAt).toISOString()
            : null,
          videoForceMutedAt: joiningMuteState?.forcedVideoAt
            ? new Date(joiningMuteState.forcedVideoAt).toISOString()
            : null,
          audioForceMutedBy: joiningMuteState?.forcedBy ?? null,
          videoForceMutedBy: joiningMuteState?.forcedBy ?? null,
          forceMuteReason: joiningMuteState?.forcedReason ?? null,
        };

      // Notify other participants with normalized payload
      socket.to(normalizedRoomCode).emit('user-joined', joiningParticipant);

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
        producers: Array<{ producerId: string; kind: 'audio' | 'video'; source: string }>;
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
            source: (producerData?.producer.appData?.source as string) || (p.kind === 'audio' ? 'microphone' : 'camera'),
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
          source: p.source,
          name: userInfo.name,
          email: userInfo.email,
          picture: userInfo.picture,
        }))
      );

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

      const hostControlState = {
        locked: roomHostState?.locked ?? redisRoomControlState?.locked ?? false,
        lockedBy: roomHostState?.lockedBy ?? redisRoomControlState?.lockedBy ?? null,
        lockedReason:
          roomHostState?.lockedReason ?? redisRoomControlState?.lockedReason ?? null,
        audioForceAll:
          roomHostState?.audioForceAll ?? redisRoomControlState?.audioForceAll ?? false,
        audioForcedBy:
          roomHostState?.audioForcedBy ?? redisRoomControlState?.audioForcedBy ?? null,
        audioForceReason:
          roomHostState?.audioForceReason ?? redisRoomControlState?.audioForceReason ?? null,
        videoForceAll:
          roomHostState?.videoForceAll ?? redisRoomControlState?.videoForceAll ?? false,
        videoForcedBy:
          roomHostState?.videoForcedBy ?? redisRoomControlState?.videoForcedBy ?? null,
        videoForceReason:
          roomHostState?.videoForceReason ?? redisRoomControlState?.videoForceReason ?? null,
        chatForceAll:
          roomHostState?.chatForceAll ?? redisRoomControlState?.chatForceAll ?? false,
        chatForcedBy:
          roomHostState?.chatForcedBy ?? redisRoomControlState?.chatForcedBy ?? null,
        chatForceReason:
          roomHostState?.chatForceReason ?? redisRoomControlState?.chatForceReason ?? null,
        updatedAt: new Date().toISOString(),
      };

      callback({
        success: true,
        rtpCapabilities: router.rtpCapabilities,
        otherProducers: producerInfoList,
        existingParticipants: Array.from(userMap.values()).map(userInfo => ({
          userId: userInfo.userId,
          name: userInfo.name,
          email: userInfo.email,
          picture: userInfo.picture,
        })),
        participants: participantRoster,
        isAdmin: isModerator,
        isHost,
        role: participantRole,
        isPublic: updatedRoom.isPublic,
        hostControls: hostControlState,
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

  socket.on(
    'host-control:update-role',
    async (data: UpdateRolePayload, callback?: (result: { success: boolean; error?: string; role?: ParticipantRole }) => void) => {
      try {
        const { roomCode, roomId, actorUserId } = resolveHostContext({ requireHost: true });

        const targetUserId =
          typeof data?.targetUserId === 'string' ? data.targetUserId.trim() : '';
        const requestedRole =
          typeof data?.role === 'string' ? data.role.trim().toLowerCase() : '';

        if (!targetUserId) {
          callback?.({ success: false, error: 'A target user is required.' });
          return;
        }

        let result: { userId: string; role: ParticipantRole };
        switch (requestedRole) {
          case 'cohost':
          case 'co-host':
          case 'co_host':
            result = await RoomService.promoteToCoHost(actorUserId, roomId, targetUserId);
            break;
          case 'participant':
            result = await RoomService.demoteToParticipant(actorUserId, roomId, targetUserId);
            break;
          default:
            callback?.({
              success: false,
              error: 'Unsupported role. Use "cohost" or "participant".',
            });
            return;
        }

        const roomSockets = await io.in(roomCode).fetchSockets();
        const targetSockets = roomSockets.filter(
          participantSocket => participantSocket.data.userId === targetUserId
        );

        const nowIso = new Date().toISOString();
        const isModerator = RoomService.isModeratorRole(result.role);

        for (const targetSocket of targetSockets) {
          targetSocket.data.participantRole = result.role;
          targetSocket.data.isAdmin = isModerator || targetSocket.data.isHost === true;
        }

        const payload = {
          userId: targetUserId,
          role: result.role,
          isModerator,
          updatedBy: actorUserId,
          updatedAt: nowIso,
        };

        io.to(roomCode).emit('host-control:role-updated', payload);

        callback?.({ success: true, role: result.role });
      } catch (error: any) {
        logger.error('host-control:update-role failed', {
          error: error?.message ?? error,
          socketId: socket.id,
        });
        callback?.({
          success: false,
          error:
            error instanceof ForbiddenError || error instanceof ConflictError
              ? error.message
              : 'Failed to update participant role.',
        });
      }
    }
  );

  socket.on(
    'host-control:mute-all',
    async (
      data: { targets?: Array<'audio' | 'video'>; mute?: boolean; reason?: string },
      callback?: (result: { success: boolean; error?: string }) => void
    ) => {
      try {
        const { roomCode, roomId, actorUserId, roomAdminId } = resolveHostContext();
        const targetsInput = Array.isArray(data?.targets) ? data.targets : undefined;

        const targets = new Set<'audio' | 'video'>();
        if (targetsInput && targetsInput.length > 0) {
          targetsInput.forEach(target => {
            if (target === 'audio' || target === 'video') {
              targets.add(target);
            }
          });
        }

        if (targets.size === 0) {
          targets.add('audio');
        }

        const mute = data?.mute !== false;
        const reason =
          typeof data?.reason === 'string' ? data.reason.trim().slice(0, 256) : null;

        const roomSockets = await io.in(roomCode).fetchSockets();
        const participantUserIds = Array.from(
          new Set(
            roomSockets
              .map((participantSocket: any) => participantSocket.data.userId)
              .filter((participantUserId: string | undefined) => {
                if (!participantUserId) {
                  return false;
                }
                // When muting everyone, skip the actor (co-host/host) so they aren't force-muted.
                // When releasing, include the actor so their forced state is cleared as well.
                return mute ? participantUserId !== actorUserId : true;
              })
          )
        ) as string[];

        const timestamp = Date.now();

        await Promise.all(
          participantUserIds.map(targetUserId =>
            enforceParticipantMute({
              targetUserId,
              roomCode,
              roomId,
              actorUserId,
              targets,
              mute,
              reason,
              timestamp,
              roomSockets,
              roomAdminId,
            })
          )
        );

        const hostUpdates: Partial<RoomHostControlState> = {};
        const redisUpdates: Partial<Omit<RedisRoomControlStatePayload, 'roomCode' | 'updatedAt'>> =
          {};

        if (targets.has('audio')) {
          hostUpdates.audioForceAll = mute;
          hostUpdates.audioForcedBy = mute ? actorUserId : null;
          hostUpdates.audioForcedAt = mute ? new Date(timestamp) : null;
          hostUpdates.audioForceReason = mute ? reason : null;
          redisUpdates.audioForceAll = mute;
          redisUpdates.audioForcedBy = mute ? actorUserId : null;
          redisUpdates.audioForcedAt = mute ? timestamp : null;
          redisUpdates.audioForceReason = mute ? reason ?? null : null;
        }

        if (targets.has('video')) {
          hostUpdates.videoForceAll = mute;
          hostUpdates.videoForcedBy = mute ? actorUserId : null;
          hostUpdates.videoForcedAt = mute ? new Date(timestamp) : null;
          hostUpdates.videoForceReason = mute ? reason : null;
          redisUpdates.videoForceAll = mute;
          redisUpdates.videoForcedBy = mute ? actorUserId : null;
          redisUpdates.videoForcedAt = mute ? timestamp : null;
          redisUpdates.videoForceReason = mute ? reason ?? null : null;
        }

        if (Object.keys(hostUpdates).length > 0) {
          await RoomService.upsertRoomHostState(roomId, hostUpdates);
        }

        if (Object.keys(redisUpdates).length > 0) {
          await RedisStateService.setRoomControlState(roomCode, {
            ...redisUpdates,
            updatedAt: timestamp,
          });
        }

        await emitRoomHostState(roomCode, roomId);

        callback?.({ success: true });
      } catch (error: any) {
        logger.error('host-control:mute-all failed', {
          error: error?.message ?? error,
          socketId: socket.id,
        });
        callback?.({
          success: false,
          error:
            error instanceof ForbiddenError
              ? error.message
              : 'Failed to update mute state for participants.',
        });
      }
    }
  );

  socket.on(
    'host-control:mute-participant',
    async (
      data: {
        targetUserId?: string;
        targetUserIds?: string[];
        audio?: boolean;
        video?: boolean;
        mute?: boolean;
        reason?: string;
      },
      callback?: (result: { success: boolean; error?: string }) => void
    ) => {
      try {
        const { roomCode, roomId, actorUserId, roomAdminId } = resolveHostContext();
        const targets = new Set<'audio' | 'video'>();

        if (data?.audio || (!data?.audio && !data?.video)) {
          targets.add('audio');
        }

        if (data?.video) {
          targets.add('video');
        }

        if (targets.size === 0) {
          targets.add('audio');
        }

        const mute = data?.mute !== false;
        const reason =
          typeof data?.reason === 'string' ? data.reason.trim().slice(0, 256) : null;

        const roomSockets = await io.in(roomCode).fetchSockets();
        const requestedTargets = Array.isArray(data?.targetUserIds)
          ? data.targetUserIds
          : data?.targetUserId
          ? [data.targetUserId]
          : [];

        const uniqueTargets = Array.from(
          new Set(
            requestedTargets.filter(
              (targetUserId): targetUserId is string =>
                typeof targetUserId === 'string' && targetUserId !== actorUserId
            )
          )
        );

        if (uniqueTargets.length === 0) {
          throw new Error('No target participant specified for host control mute.');
        }

        const timestamp = Date.now();

        await Promise.all(
          uniqueTargets.map(targetUserId =>
            enforceParticipantMute({
              targetUserId,
              roomCode,
              roomId,
              actorUserId,
              targets,
              mute,
              reason,
              timestamp,
              roomSockets,
              roomAdminId,
            })
          )
        );

        callback?.({ success: true });
      } catch (error: any) {
        logger.error('host-control:mute-participant failed', {
          error: error?.message ?? error,
          socketId: socket.id,
        });
        callback?.({
          success: false,
          error:
            error instanceof ForbiddenError
              ? error.message
              : 'Failed to update participant mute state.',
        });
      }
    }
  );

  socket.on(
    'host-control:remove-participant',
    async (
      data: { targetUserId?: string; targetUserIds?: string[]; reason?: string },
      callback?: (result: { success: boolean; error?: string }) => void
    ) => {
      try {
        const { roomCode, actorUserId } = resolveHostContext();
        const requestedTargets = Array.isArray(data?.targetUserIds)
          ? data.targetUserIds
          : data?.targetUserId
          ? [data.targetUserId]
          : [];

        const uniqueTargets = Array.from(
          new Set(
            requestedTargets.filter(
              (targetUserId): targetUserId is string =>
                typeof targetUserId === 'string' && targetUserId !== actorUserId
            )
          )
        );

        if (uniqueTargets.length === 0) {
          throw new Error('No target participant specified for removal.');
        }

        const reason =
          typeof data?.reason === 'string' ? data.reason.trim().slice(0, 256) : null;

        const roomSockets = await io.in(roomCode).fetchSockets();

        await Promise.all(
          uniqueTargets.map(async targetUserId => {
            const targetSockets = roomSockets.filter(
              (participantSocket: any) => participantSocket.data.userId === targetUserId
            );

            const removalPayload = {
              userId: targetUserId,
              reason: reason ?? null,
              actorUserId,
              timestamp: new Date().toISOString(),
            };

            targetSockets.forEach(targetSocket => {
              try {
                targetSocket.emit('host-control:participant-removed', removalPayload);
              } catch (error) {
                logger.warn('Failed to emit removal payload to target socket', {
                  targetUserId,
                  socketId: targetSocket?.id,
                  roomCode,
                  error,
                });
              }
            });

            await Promise.all(
              targetSockets.map(targetSocket =>
                (async () => {
                  const concreteSocket = io.sockets.sockets.get(
                    (targetSocket as any).id
                  ) as Socket | undefined;
                  if (concreteSocket) {
                    await handleSocketLeave(io, concreteSocket, {
                      reason: reason ?? 'host-removed',
                    });
                    try {
                      await new Promise(resolve => setImmediate(resolve));
                      if (concreteSocket.connected) {
                        concreteSocket.disconnect(true);
                      }
                    } catch (error) {
                      logger.warn('Failed to disconnect removed participant socket', {
                        targetUserId,
                        socketId: concreteSocket.id,
                        roomCode,
                        error,
                      });
                    }
                  } else if (typeof targetSocket.disconnect === 'function') {
                    await targetSocket.disconnect(true);
                  }
                })()
              )
            );

            io.to(roomCode).emit('host-control:participant-removed', removalPayload);
          })
        );

        callback?.({ success: true });
      } catch (error: any) {
        logger.error('host-control:remove-participant failed', {
          error: error?.message ?? error,
          socketId: socket.id,
        });
        callback?.({
          success: false,
          error:
            error instanceof ForbiddenError
              ? error.message
              : 'Failed to remove participant from room.',
        });
      }
    }
  );

  socket.on(
    'host-control:mute-chat',
    async (
      data: { mute?: boolean; reason?: string },
      callback?: (result: { success: boolean; error?: string }) => void
    ) => {
      try {
        const { roomCode, roomId, actorUserId } = resolveHostContext();
        const mute = data?.mute !== false;
        const reason =
          typeof data?.reason === 'string' ? data.reason.trim().slice(0, 256) : null;
        const timestamp = Date.now();

        await RoomService.upsertRoomHostState(roomId, {
          chatForceAll: mute,
          chatForcedBy: mute ? actorUserId : null,
          chatForcedAt: mute ? new Date(timestamp) : null,
          chatForceReason: mute ? reason : null,
        });

        await RedisStateService.setRoomControlState(roomCode, {
          chatForceAll: mute,
          chatForcedBy: mute ? actorUserId : null,
          chatForcedAt: mute ? timestamp : null,
          chatForceReason: mute ? reason ?? null : null,
          updatedAt: timestamp,
        });

        io.to(roomCode).emit('host-control:chat-state', {
          chatForceAll: mute,
          chatForcedBy: mute ? actorUserId : null,
          chatForceReason: mute ? reason ?? null : null,
          actorUserId,
          timestamp,
        });

        await emitRoomHostState(roomCode, roomId);

        callback?.({ success: true });
      } catch (error: any) {
        logger.error('host-control:mute-chat failed', {
          error: error?.message ?? error,
          socketId: socket.id,
        });
        callback?.({
          success: false,
          error:
            error instanceof ForbiddenError
              ? error.message
              : 'Failed to update chat mute state.',
        });
      }
    }
  );

  socket.on(
    'host-control:lock-room',
    async (
      data: { locked?: boolean; reason?: string },
      callback?: (result: { success: boolean; error?: string }) => void
    ) => {
      try {
        const { roomCode, roomId, actorUserId } = resolveHostContext();
        const locked = data?.locked !== false;
        const reason =
          typeof data?.reason === 'string' ? data.reason.trim().slice(0, 256) : null;

        const timestamp = Date.now();

        await RoomService.upsertRoomHostState(roomId, {
          locked,
          lockedBy: locked ? actorUserId : null,
          lockedAt: locked ? new Date(timestamp) : null,
          lockedReason: locked ? reason : null,
        });

        await RedisStateService.setRoomControlState(roomCode, {
          locked,
          lockedBy: locked ? actorUserId : null,
          lockedAt: locked ? timestamp : null,
          lockedReason: locked ? reason ?? null : null,
          updatedAt: timestamp,
        });

        await emitRoomHostState(roomCode, roomId);

        callback?.({ success: true });
      } catch (error: any) {
        logger.error('host-control:lock-room failed', {
          error: error?.message ?? error,
          socketId: socket.id,
        });
        callback?.({
          success: false,
          error:
            error instanceof ForbiddenError
              ? error.message
              : 'Failed to update room lock state.',
        });
      }
    }
  );

  socket.on('leaveRoom', async (_data, callback?: (result: HandleSocketLeaveResult) => void) => {
    try {
      const result = await handleSocketLeave(io, socket, { reason: 'manual' });
      callback?.(result);
    } catch (error: any) {
      logger.error('Error leaving room:', error);
      callback?.({ success: false, reason: 'manual', cleanupFailed: true });
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
      const joinRequest = isRoomJoinRequestWithUser(request) ? request : undefined;

      // Notify admin - use room OR direct socket (not both to avoid duplicates)
      const room = await RoomService.getRoomByCode(normalizedRoomCode);
      const adminSockets = Array.from(io.sockets.sockets.values()).filter(s => 
        s.data.userId === room.adminId
      );

      if (adminSockets.length > 0 && joinRequest) {
        const requestData = {
          requestId: joinRequest.id,
          userId: joinRequest.user.id,
          name: joinRequest.user.name,
          email: joinRequest.user.email,
          picture: joinRequest.user.picture,
          requestedAt: joinRequest.requestedAt,
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
      } else if (!joinRequest) {
        logger.info('requestRoomJoin: user already approved or joined, skipping admin notification', {
          socketId: socket.id,
          userId,
          roomCode: normalizedRoomCode,
        });
      }

      if (joinRequest) {
      callback({
        success: true,
          requestId: joinRequest.id,
        message: 'Join request sent. Waiting for admin approval.',
      });
      } else {
        callback({
          success: true,
          message: 'Join request already approved. You can join the room.',
          alreadyApproved: true,
        });
      }
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

      await RoomService.rejectJoinRequest(userId, roomCode, data.requestId);

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

