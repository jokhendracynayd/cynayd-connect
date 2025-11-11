import { redisWithCircuitBreaker as redis } from '../database/redis';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface RedisParticipantMuteStatePayload {
  roomCode: string;
  userId: string;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  audioMutedAt: number | null;
  videoMutedAt: number | null;
  updatedAt: number;
  forcedAudio?: boolean;
  forcedVideo?: boolean;
  forcedAudioAt?: number | null;
  forcedVideoAt?: number | null;
  forcedBy?: string | null;
  forcedReason?: string | null;
}

export interface RedisRoomControlStatePayload {
  roomCode: string;
  locked: boolean;
  lockedBy: string | null;
  lockedAt: number | null;
  lockedReason: string | null;
  audioForceAll: boolean;
  audioForcedBy: string | null;
  audioForcedAt: number | null;
  audioForceReason: string | null;
  videoForceAll: boolean;
  videoForcedBy: string | null;
  videoForcedAt: number | null;
  videoForceReason: string | null;
  chatForceAll: boolean;
  chatForcedBy: string | null;
  chatForcedAt: number | null;
  chatForceReason: string | null;
  updatedAt: number;
}

type RecordingStatusValue = 'STARTING' | 'RECORDING' | 'UPLOADING' | 'COMPLETED' | 'FAILED';

export interface RedisRecordingStatePayload {
  roomId: string;
  sessionId: string;
  status: RecordingStatusValue;
  startedAt: number;
  updatedAt: number;
  hostId: string;
  serverInstanceId?: string;
}

/**
* Redis-backed state management service
* Stores metadata about Producers, Consumers, Transports, and Routers
* for cross-server discovery in horizontal scaling setup.
* 
* Note: Actual Mediasoup objects stay in memory, but their metadata
* (IDs, mappings, ownership) is stored in Redis.
*/
export class RedisStateService {
  private static readonly KEY_PREFIX = 'connect:state';
  private static readonly TTL_SECONDS = 3600; // 1 hour default TTL
  private static readonly MUTE_STATE_TTL_SECONDS = 3600; // 1 hour, refreshed on updates
  private static readonly ROOM_CONTROL_TTL_SECONDS = 3600;
  private static readonly RECORDING_STATE_TTL_SECONDS = 900; // 15 minutes

  // Producer metadata storage
  static async storeProducerMetadata(
    producerId: string,
    socketId: string,
    roomId: string,
    userId: string,
    kind: 'audio' | 'video',
    source: 'microphone' | 'camera' | 'screen' | 'data' | 'unknown',
    serverInstanceId?: string
  ): Promise<void> {
    const key = `${this.KEY_PREFIX}:producer:${producerId}`;
    const metadata = {
      producerId,
      socketId,
      roomId,
      userId,
      kind,
      source,
      serverInstanceId: serverInstanceId || config.server.instanceId,
      createdAt: Date.now(),
    };

    await redis.setex(key, this.TTL_SECONDS, JSON.stringify(metadata));
    
    // Also maintain socket -> producers mapping
    await redis.sadd(`${this.KEY_PREFIX}:socket:${socketId}:producers`, producerId);
    
    // Maintain room -> producers mapping
    await redis.sadd(`${this.KEY_PREFIX}:room:${roomId}:producers`, producerId);
    
    logger.debug(`Stored producer metadata in Redis: ${producerId}`);
  }

  static async getProducerMetadata(producerId: string): Promise<{
    producerId: string;
    socketId: string;
    roomId: string;
    userId: string;
    kind: 'audio' | 'video';
    source: 'microphone' | 'camera' | 'screen' | 'data' | 'unknown';
    serverInstanceId: string;
    createdAt: number;
  } | null> {
    const key = `${this.KEY_PREFIX}:producer:${producerId}`;
    const data = await redis.get(key);
    
    if (!data) return null;
    
    return JSON.parse(data);
  }

  static async removeProducerMetadata(producerId: string, socketId: string, roomId: string): Promise<void> {
    const key = `${this.KEY_PREFIX}:producer:${producerId}`;
    await redis.del(key);
    
    // Remove from socket mapping
    await redis.srem(`${this.KEY_PREFIX}:socket:${socketId}:producers`, producerId);
    
    // Remove from room mapping
    await redis.srem(`${this.KEY_PREFIX}:room:${roomId}:producers`, producerId);
    
    logger.debug(`Removed producer metadata from Redis: ${producerId}`);
  }

  static async getSocketProducers(socketId: string): Promise<string[]> {
    const key = `${this.KEY_PREFIX}:socket:${socketId}:producers`;
    return redis.smembers(key);
  }

  static async getRoomProducers(roomId: string): Promise<string[]> {
    const key = `${this.KEY_PREFIX}:room:${roomId}:producers`;
    return redis.smembers(key);
  }

  // Consumer metadata storage
  static async storeConsumerMetadata(
    consumerId: string,
    socketId: string,
    producerId: string,
    kind: 'audio' | 'video',
    serverInstanceId?: string
  ): Promise<void> {
    const key = `${this.KEY_PREFIX}:consumer:${consumerId}`;
    const metadata = {
      consumerId,
      socketId,
      producerId,
      kind,
      serverInstanceId: serverInstanceId || config.server.instanceId,
      createdAt: Date.now(),
    };

    await redis.setex(key, this.TTL_SECONDS, JSON.stringify(metadata));
    
    // Maintain socket -> consumers mapping
    await redis.sadd(`${this.KEY_PREFIX}:socket:${socketId}:consumers`, consumerId);
    
    logger.debug(`Stored consumer metadata in Redis: ${consumerId}`);
  }

  static async getConsumerMetadata(consumerId: string): Promise<{
    consumerId: string;
    socketId: string;
    producerId: string;
    kind: 'audio' | 'video';
    serverInstanceId: string;
    createdAt: number;
  } | null> {
    const key = `${this.KEY_PREFIX}:consumer:${consumerId}`;
    const data = await redis.get(key);
    
    if (!data) return null;
    
    return JSON.parse(data);
  }

  static async removeConsumerMetadata(consumerId: string, socketId: string): Promise<void> {
    const key = `${this.KEY_PREFIX}:consumer:${consumerId}`;
    await redis.del(key);
    
    // Remove from socket mapping
    await redis.srem(`${this.KEY_PREFIX}:socket:${socketId}:consumers`, consumerId);
    
    logger.debug(`Removed consumer metadata from Redis: ${consumerId}`);
  }

  // Recording state
  static async storeRecordingState(payload: RedisRecordingStatePayload): Promise<void> {
    const key = `${this.KEY_PREFIX}:recording:${payload.roomId}`;
    const enriched = {
      ...payload,
      serverInstanceId: payload.serverInstanceId || config.server.instanceId,
      updatedAt: Date.now(),
    };

    await redis.setex(key, this.RECORDING_STATE_TTL_SECONDS, JSON.stringify(enriched));
    logger.debug(`Stored recording state in Redis for room ${payload.roomId}`, {
      roomId: payload.roomId,
      sessionId: payload.sessionId,
      status: payload.status,
    });
  }

  static async getRecordingState(roomId: string): Promise<RedisRecordingStatePayload | null> {
    const key = `${this.KEY_PREFIX}:recording:${roomId}`;
    const data = await redis.get(key);
    if (!data) {
      return null;
    }
    try {
      return JSON.parse(data) as RedisRecordingStatePayload;
    } catch (error) {
      logger.error('Failed to parse recording state from Redis', { roomId, error });
      return null;
    }
  }

  static async removeRecordingState(roomId: string): Promise<void> {
    const key = `${this.KEY_PREFIX}:recording:${roomId}`;
    await redis.del(key);
    logger.debug(`Removed recording state from Redis for room ${roomId}`);
  }

  static async getSocketConsumers(socketId: string): Promise<string[]> {
    const key = `${this.KEY_PREFIX}:socket:${socketId}:consumers`;
    return redis.smembers(key);
  }

  // Transport metadata storage
  static async storeTransportMetadata(
    transportId: string,
    socketId: string,
    roomId: string,
    isProducer: boolean,
    serverInstanceId?: string
  ): Promise<void> {
    const key = `${this.KEY_PREFIX}:transport:${transportId}`;
    const metadata = {
      transportId,
      socketId,
      roomId,
      isProducer,
      serverInstanceId: serverInstanceId || config.server.instanceId,
      createdAt: Date.now(),
    };

    await redis.setex(key, this.TTL_SECONDS, JSON.stringify(metadata));
    
    // Maintain socket -> transports mapping
    await redis.sadd(`${this.KEY_PREFIX}:socket:${socketId}:transports`, transportId);
    
    logger.debug(`Stored transport metadata in Redis: ${transportId}`);
  }

  static async getTransportMetadata(transportId: string): Promise<{
    transportId: string;
    socketId: string;
    roomId: string;
    isProducer: boolean;
    serverInstanceId: string;
    createdAt: number;
  } | null> {
    const key = `${this.KEY_PREFIX}:transport:${transportId}`;
    const data = await redis.get(key);
    
    if (!data) return null;
    
    return JSON.parse(data);
  }

  static async removeTransportMetadata(transportId: string, socketId: string): Promise<void> {
    const key = `${this.KEY_PREFIX}:transport:${transportId}`;
    await redis.del(key);
    
    // Remove from socket mapping
    await redis.srem(`${this.KEY_PREFIX}:socket:${socketId}:transports`, transportId);
    
    logger.debug(`Removed transport metadata from Redis: ${transportId}`);
  }

  static async getSocketTransports(socketId: string): Promise<string[]> {
    const key = `${this.KEY_PREFIX}:socket:${socketId}:transports`;
    return redis.smembers(key);
  }

  // Router metadata storage (room -> server mapping)
  static async storeRouterMetadata(
    roomId: string,
    routerId: string,
    serverInstanceId?: string
  ): Promise<void> {
    const key = `${this.KEY_PREFIX}:router:${roomId}`;
    const metadata = {
      roomId,
      routerId,
      serverInstanceId: serverInstanceId || config.server.instanceId,
      createdAt: Date.now(),
    };

    await redis.setex(key, this.TTL_SECONDS * 24, JSON.stringify(metadata)); // 24 hours for routers
    
    logger.debug(`Stored router metadata in Redis: ${roomId} -> ${routerId}`);
  }

  static async getRouterMetadata(roomId: string): Promise<{
    roomId: string;
    routerId: string;
    serverInstanceId: string;
    createdAt: number;
  } | null> {
    const key = `${this.KEY_PREFIX}:router:${roomId}`;
    const data = await redis.get(key);
    
    if (!data) return null;
    
    return JSON.parse(data);
  }

  static async removeRouterMetadata(roomId: string): Promise<void> {
    const key = `${this.KEY_PREFIX}:router:${roomId}`;
    await redis.del(key);
    
    logger.debug(`Removed router metadata from Redis: ${roomId}`);
  }

  // Cleanup all state for a socket (called on disconnect)
  static async cleanupSocketState(socketId: string): Promise<void> {
    try {
      // Get all associated IDs
      const producerIds = await this.getSocketProducers(socketId);
      const consumerIds = await this.getSocketConsumers(socketId);
      const transportIds = await this.getSocketTransports(socketId);

      // Remove all metadata
      if (producerIds.length > 0) {
        for (const producerId of producerIds) {
          const metadata = await this.getProducerMetadata(producerId);
          if (metadata) {
            await this.removeProducerMetadata(producerId, socketId, metadata.roomId);
          }
        }
      }

      if (consumerIds.length > 0) {
        for (const consumerId of consumerIds) {
          await this.removeConsumerMetadata(consumerId, socketId);
        }
      }

      if (transportIds.length > 0) {
        for (const transportId of transportIds) {
          await this.removeTransportMetadata(transportId, socketId);
        }
      }

      // Clean up socket mapping sets
      await redis.del(`${this.KEY_PREFIX}:socket:${socketId}:producers`);
      await redis.del(`${this.KEY_PREFIX}:socket:${socketId}:consumers`);
      await redis.del(`${this.KEY_PREFIX}:socket:${socketId}:transports`);
      
      logger.debug(`Cleaned up all state for socket: ${socketId}`);
    } catch (error) {
      logger.error(`Error cleaning up socket state for ${socketId}:`, error);
    }
  }

  // Get all producers in a room (cross-server)
  static async getAllRoomProducers(roomId: string): Promise<Array<{
    producerId: string;
    socketId: string;
    userId: string;
    kind: 'audio' | 'video';
    serverInstanceId: string;
  }>> {
    const producerIds = await this.getRoomProducers(roomId);
    const producers: Array<{
      producerId: string;
      socketId: string;
      userId: string;
      kind: 'audio' | 'video';
      serverInstanceId: string;
    }> = [];

    for (const producerId of producerIds) {
      const metadata = await this.getProducerMetadata(producerId);
      if (metadata) {
        producers.push({
          producerId: metadata.producerId,
          socketId: metadata.socketId,
          userId: metadata.userId,
          kind: metadata.kind,
          serverInstanceId: metadata.serverInstanceId,
        });
      }
    }

    return producers;
  }

  // Participant mute state management
  static async setParticipantMuteState(
    roomCode: string,
    userId: string,
    state: {
      isAudioMuted: boolean;
      isVideoMuted: boolean;
      audioMutedAt?: number | null;
      videoMutedAt?: number | null;
      forcedAudio?: boolean;
      forcedVideo?: boolean;
      forcedAudioAt?: number | null;
      forcedVideoAt?: number | null;
      forcedBy?: string | null;
      forcedReason?: string | null;
      updatedAt?: number;
    }
  ): Promise<void> {
    const key = `${this.KEY_PREFIX}:room:${roomCode}:mute:${userId}`;
    const setKey = `${this.KEY_PREFIX}:room:${roomCode}:mute:participants`;

    const now = Date.now();
    const payload: RedisParticipantMuteStatePayload = {
      roomCode,
      userId,
      isAudioMuted: state.isAudioMuted,
      isVideoMuted: state.isVideoMuted,
      audioMutedAt: state.audioMutedAt ?? null,
      videoMutedAt: state.videoMutedAt ?? null,
      updatedAt: state.updatedAt ?? now,
    };

    if (typeof state.forcedAudio === 'boolean') {
      payload.forcedAudio = state.forcedAudio;
      payload.forcedAudioAt =
        state.forcedAudioAt !== undefined
          ? state.forcedAudioAt
          : state.forcedAudio
          ? now
          : null;
    }

    if (typeof state.forcedVideo === 'boolean') {
      payload.forcedVideo = state.forcedVideo;
      payload.forcedVideoAt =
        state.forcedVideoAt !== undefined
          ? state.forcedVideoAt
          : state.forcedVideo
          ? now
          : null;
    }

    if (Object.prototype.hasOwnProperty.call(state, 'forcedBy')) {
      payload.forcedBy = state.forcedBy ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(state, 'forcedReason')) {
      payload.forcedReason = state.forcedReason ?? null;
    }

    const client = redis._client as any;

    if (client && typeof client.pipeline === 'function') {
      await client
        .pipeline()
        .sadd(setKey, userId)
        .set(key, JSON.stringify(payload), 'EX', this.MUTE_STATE_TTL_SECONDS)
        .exec();
    } else {
      await redis.sadd(setKey, userId);
      await redis.setex(key, this.MUTE_STATE_TTL_SECONDS, JSON.stringify(payload));
    }
  }

  static async getParticipantMuteState(
    roomCode: string,
    userId: string
  ): Promise<RedisParticipantMuteStatePayload | null> {
    const key = `${this.KEY_PREFIX}:room:${roomCode}:mute:${userId}`;
    const data = await redis.get(key);
    if (!data) {
      return null;
    }

    try {
      const parsed = JSON.parse(data) as RedisParticipantMuteStatePayload;
      return {
        roomCode: parsed.roomCode ?? roomCode,
        userId: parsed.userId ?? userId,
        isAudioMuted: typeof parsed.isAudioMuted === 'boolean' ? parsed.isAudioMuted : true,
        isVideoMuted: typeof parsed.isVideoMuted === 'boolean' ? parsed.isVideoMuted : true,
        audioMutedAt:
          parsed.audioMutedAt !== undefined && parsed.audioMutedAt !== null
            ? parsed.audioMutedAt
            : null,
        videoMutedAt:
          parsed.videoMutedAt !== undefined && parsed.videoMutedAt !== null
            ? parsed.videoMutedAt
            : null,
        updatedAt: parsed.updatedAt ?? Date.now(),
        forcedAudio: parsed.forcedAudio,
        forcedVideo: parsed.forcedVideo,
        forcedAudioAt:
          parsed.forcedAudioAt !== undefined && parsed.forcedAudioAt !== null
            ? parsed.forcedAudioAt
            : undefined,
        forcedVideoAt:
          parsed.forcedVideoAt !== undefined && parsed.forcedVideoAt !== null
            ? parsed.forcedVideoAt
            : undefined,
        forcedBy: Object.prototype.hasOwnProperty.call(parsed, 'forcedBy')
          ? parsed.forcedBy ?? null
          : undefined,
        forcedReason: Object.prototype.hasOwnProperty.call(parsed, 'forcedReason')
          ? parsed.forcedReason ?? null
          : undefined,
      };
    } catch (error) {
      logger.warn('Failed to parse mute state from Redis', { roomCode, userId, error });
      return null;
    }
  }

  static async getRoomMuteStates(
    roomCode: string
  ): Promise<Record<string, RedisParticipantMuteStatePayload>> {
    const setKey = `${this.KEY_PREFIX}:room:${roomCode}:mute:participants`;
    const participantIds = await redis.smembers(setKey);

    if (participantIds.length === 0) {
      return {};
    }

    const keys = participantIds.map(userId => `${this.KEY_PREFIX}:room:${roomCode}:mute:${userId}`);
    const client = redis._client as any;
    const values: Array<string | null> = client && typeof client.mget === 'function'
      ? await client.mget(...keys)
      : await Promise.all(keys.map(key => redis.get(key)));

    const results: Record<string, RedisParticipantMuteStatePayload> = {};

    participantIds.forEach((userId, index) => {
      const value = values[index];
      if (!value) {
        return;
      }

      try {
        const parsed = JSON.parse(value) as RedisParticipantMuteStatePayload;
        results[userId] = {
          roomCode: parsed.roomCode ?? roomCode,
          userId: parsed.userId ?? userId,
          isAudioMuted: typeof parsed.isAudioMuted === 'boolean' ? parsed.isAudioMuted : true,
          isVideoMuted: typeof parsed.isVideoMuted === 'boolean' ? parsed.isVideoMuted : true,
          audioMutedAt:
            parsed.audioMutedAt !== undefined && parsed.audioMutedAt !== null
              ? parsed.audioMutedAt
              : null,
          videoMutedAt:
            parsed.videoMutedAt !== undefined && parsed.videoMutedAt !== null
              ? parsed.videoMutedAt
              : null,
          updatedAt: parsed.updatedAt ?? Date.now(),
          forcedAudio: parsed.forcedAudio,
          forcedVideo: parsed.forcedVideo,
          forcedAudioAt: parsed.forcedAudioAt,
          forcedVideoAt: parsed.forcedVideoAt,
          forcedBy: Object.prototype.hasOwnProperty.call(parsed, 'forcedBy')
            ? parsed.forcedBy ?? null
            : undefined,
          forcedReason: Object.prototype.hasOwnProperty.call(parsed, 'forcedReason')
            ? parsed.forcedReason ?? null
            : undefined,
        };
      } catch (error) {
        logger.warn('Failed to parse mute state entry from Redis', { roomCode, userId, error });
      }
    });

    return results;
  }

  static async clearParticipantMuteState(roomCode: string, userId: string): Promise<void> {
    const key = `${this.KEY_PREFIX}:room:${roomCode}:mute:${userId}`;
    const setKey = `${this.KEY_PREFIX}:room:${roomCode}:mute:participants`;

    const client = redis._client as any;

    if (client && typeof client.pipeline === 'function') {
      await client
        .pipeline()
        .del(key)
        .srem(setKey, userId)
        .exec();
    } else {
      await redis.del(key);
      await redis.srem(setKey, userId);
    }
  }

  static async setRoomControlState(
    roomCode: string,
    updates: Partial<Omit<RedisRoomControlStatePayload, 'roomCode' | 'updatedAt'>> & {
      updatedAt?: number;
    }
  ): Promise<RedisRoomControlStatePayload> {
    const key = `${this.KEY_PREFIX}:room:${roomCode}:control`;
    const existing = await this.getRoomControlState(roomCode);
    const base: RedisRoomControlStatePayload =
      existing ?? {
        roomCode,
        locked: false,
        lockedBy: null,
        lockedAt: null,
        lockedReason: null,
        audioForceAll: false,
        audioForcedBy: null,
        audioForcedAt: null,
        audioForceReason: null,
        videoForceAll: false,
        videoForcedBy: null,
        videoForcedAt: null,
        videoForceReason: null,
        chatForceAll: false,
        chatForcedBy: null,
        chatForcedAt: null,
        chatForceReason: null,
        updatedAt: Date.now(),
      };

    const now = updates.updatedAt ?? Date.now();

    const nextLocked = updates.locked ?? base.locked;
    const lockedBy =
      updates.locked !== undefined
        ? nextLocked
          ? updates.lockedBy ?? base.lockedBy ?? null
          : null
        : updates.lockedBy ?? base.lockedBy ?? null;
    const lockedAt =
      updates.locked !== undefined
        ? nextLocked
          ? updates.lockedAt ?? now
          : null
        : updates.lockedAt ?? base.lockedAt ?? null;

    const lockedReason =
      updates.locked !== undefined
        ? nextLocked
          ? Object.prototype.hasOwnProperty.call(updates, 'lockedReason')
            ? updates.lockedReason ?? null
            : base.lockedReason ?? null
          : null
        : Object.prototype.hasOwnProperty.call(updates, 'lockedReason')
        ? updates.lockedReason ?? null
        : base.lockedReason ?? null;

    const nextAudioForceAll = updates.audioForceAll ?? base.audioForceAll;
    const audioForcedBy =
      updates.audioForceAll !== undefined
        ? nextAudioForceAll
          ? updates.audioForcedBy ?? base.audioForcedBy ?? null
          : null
        : updates.audioForcedBy ?? base.audioForcedBy ?? null;
    const audioForcedAt =
      updates.audioForceAll !== undefined
        ? nextAudioForceAll
          ? updates.audioForcedAt ?? now
          : null
        : updates.audioForcedAt ?? base.audioForcedAt ?? null;

    const audioForceReason =
      updates.audioForceAll !== undefined
        ? nextAudioForceAll
          ? Object.prototype.hasOwnProperty.call(updates, 'audioForceReason')
            ? updates.audioForceReason ?? null
            : base.audioForceReason ?? null
          : null
        : Object.prototype.hasOwnProperty.call(updates, 'audioForceReason')
        ? updates.audioForceReason ?? null
        : base.audioForceReason ?? null;

    const nextVideoForceAll = updates.videoForceAll ?? base.videoForceAll;
    const videoForcedBy =
      updates.videoForceAll !== undefined
        ? nextVideoForceAll
          ? updates.videoForcedBy ?? base.videoForcedBy ?? null
          : null
        : updates.videoForcedBy ?? base.videoForcedBy ?? null;
    const videoForcedAt =
      updates.videoForceAll !== undefined
        ? nextVideoForceAll
          ? updates.videoForcedAt ?? now
          : null
        : updates.videoForcedAt ?? base.videoForcedAt ?? null;

    const videoForceReason =
      updates.videoForceAll !== undefined
        ? nextVideoForceAll
          ? Object.prototype.hasOwnProperty.call(updates, 'videoForceReason')
            ? updates.videoForceReason ?? null
            : base.videoForceReason ?? null
          : null
        : Object.prototype.hasOwnProperty.call(updates, 'videoForceReason')
        ? updates.videoForceReason ?? null
        : base.videoForceReason ?? null;

    const nextChatForceAll = updates.chatForceAll ?? base.chatForceAll;
    const chatForcedBy =
      updates.chatForceAll !== undefined
        ? nextChatForceAll
          ? updates.chatForcedBy ?? base.chatForcedBy ?? null
          : null
        : updates.chatForcedBy ?? base.chatForcedBy ?? null;
    const chatForcedAt =
      updates.chatForceAll !== undefined
        ? nextChatForceAll
          ? updates.chatForcedAt ?? now
          : null
        : updates.chatForcedAt ?? base.chatForcedAt ?? null;

    const chatForceReason =
      updates.chatForceAll !== undefined
        ? nextChatForceAll
          ? Object.prototype.hasOwnProperty.call(updates, 'chatForceReason')
            ? updates.chatForceReason ?? null
            : base.chatForceReason ?? null
          : null
        : Object.prototype.hasOwnProperty.call(updates, 'chatForceReason')
        ? updates.chatForceReason ?? null
        : base.chatForceReason ?? null;

    const next: RedisRoomControlStatePayload = {
      roomCode,
      locked: nextLocked,
      lockedBy,
      lockedAt,
      lockedReason,
      audioForceAll: nextAudioForceAll,
      audioForcedBy,
      audioForcedAt,
      audioForceReason,
      videoForceAll: nextVideoForceAll,
      videoForcedBy,
      videoForcedAt,
      videoForceReason,
      chatForceAll: nextChatForceAll,
      chatForcedBy,
      chatForcedAt,
      chatForceReason,
      updatedAt: now,
    };

    await redis.setex(key, this.ROOM_CONTROL_TTL_SECONDS, JSON.stringify(next));
    return next;
  }

  static async getRoomControlState(
    roomCode: string
  ): Promise<RedisRoomControlStatePayload | null> {
    const key = `${this.KEY_PREFIX}:room:${roomCode}:control`;
    const data = await redis.get(key);
    if (!data) {
      return null;
    }

    try {
      const parsed = JSON.parse(data) as RedisRoomControlStatePayload;
      return {
        roomCode: parsed.roomCode ?? roomCode,
        locked: typeof parsed.locked === 'boolean' ? parsed.locked : false,
        lockedBy: Object.prototype.hasOwnProperty.call(parsed, 'lockedBy')
          ? parsed.lockedBy ?? null
          : null,
        lockedAt:
          parsed.lockedAt !== undefined && parsed.lockedAt !== null ? parsed.lockedAt : null,
        lockedReason: Object.prototype.hasOwnProperty.call(parsed, 'lockedReason')
          ? parsed.lockedReason ?? null
          : null,
        audioForceAll: typeof parsed.audioForceAll === 'boolean' ? parsed.audioForceAll : false,
        audioForcedBy: Object.prototype.hasOwnProperty.call(parsed, 'audioForcedBy')
          ? parsed.audioForcedBy ?? null
          : null,
        audioForcedAt:
          parsed.audioForcedAt !== undefined && parsed.audioForcedAt !== null
            ? parsed.audioForcedAt
            : null,
        audioForceReason: Object.prototype.hasOwnProperty.call(parsed, 'audioForceReason')
          ? parsed.audioForceReason ?? null
          : null,
        videoForceAll: typeof parsed.videoForceAll === 'boolean' ? parsed.videoForceAll : false,
        videoForcedBy: Object.prototype.hasOwnProperty.call(parsed, 'videoForcedBy')
          ? parsed.videoForcedBy ?? null
          : null,
        videoForcedAt:
          parsed.videoForcedAt !== undefined && parsed.videoForcedAt !== null
            ? parsed.videoForcedAt
            : null,
        videoForceReason: Object.prototype.hasOwnProperty.call(parsed, 'videoForceReason')
          ? parsed.videoForceReason ?? null
          : null,
        chatForceAll: typeof parsed.chatForceAll === 'boolean' ? parsed.chatForceAll : false,
        chatForcedBy: Object.prototype.hasOwnProperty.call(parsed, 'chatForcedBy')
          ? parsed.chatForcedBy ?? null
          : null,
        chatForcedAt:
          parsed.chatForcedAt !== undefined && parsed.chatForcedAt !== null
            ? parsed.chatForcedAt
            : null,
        chatForceReason: Object.prototype.hasOwnProperty.call(parsed, 'chatForceReason')
          ? parsed.chatForceReason ?? null
          : null,
        updatedAt: parsed.updatedAt ?? Date.now(),
      };
    } catch (error) {
      logger.warn('Failed to parse room control state from Redis', { roomCode, error });
      return null;
    }
  }

  static async clearRoomControlState(roomCode: string): Promise<void> {
    const key = `${this.KEY_PREFIX}:room:${roomCode}:control`;
    await redis.del(key);
  }
}

