import { Server as SocketIOServer, Socket } from 'socket.io';
import { ChatMessageType } from '@prisma/client';
import { logger } from '../../shared/utils/logger';
import { ChatService } from '../../shared/services/chat.service';
import { RedisStateService } from '../../shared/services/state.redis';
import { RoomService } from '../../shared/services/rooms.service';

const MAX_MESSAGE_LENGTH = 2000;
const HISTORY_DEFAULT_LIMIT = 50;

type SendChatPayload = {
  content?: string;
  recipientId?: string | null;
  clientMessageId?: string;
};

type HistoryPayload = {
  limit?: number;
  cursor?: string;
  participantId?: string | null;
};

export function chatHandler(io: SocketIOServer, socket: Socket) {
  const sendChatMessage = async (data: SendChatPayload, callback?: (payload: any) => void) => {
    try {
      const roomId: string | undefined = socket.data.roomId;
      const roomCode: string | undefined = socket.data.roomCode;
      const senderId: string | undefined = socket.data.userId;

      if (!roomId || !roomCode || !senderId) {
        logger.warn('Chat send failed - missing socket metadata', {
          socketId: socket.id,
          roomId,
          roomCode,
          senderId,
        });
        callback?.({ success: false, error: 'Not joined to a room' });
        return;
      }

      const rawContent = typeof data?.content === 'string' ? data.content.trim() : '';
      if (!rawContent) {
        callback?.({ success: false, error: 'Message cannot be empty' });
        return;
      }

      if (rawContent.length > MAX_MESSAGE_LENGTH) {
        callback?.({ success: false, error: 'Message is too long' });
        return;
      }

      const recipientId =
        typeof data?.recipientId === 'string' && data.recipientId.trim().length > 0
          ? data.recipientId.trim()
          : null;

      let messageType: ChatMessageType = ChatMessageType.BROADCAST;
      let directRecipientSockets: Socket[] = [];

      if (recipientId) {
        if (recipientId === senderId) {
          callback?.({ success: false, error: 'Cannot send direct messages to yourself' });
          return;
        }

        messageType = ChatMessageType.DIRECT;
        directRecipientSockets = Array.from(io.sockets.sockets.values()).filter(
          s => s.data.roomCode === roomCode && s.data.userId === recipientId
        );

        if (directRecipientSockets.length === 0) {
          callback?.({ success: false, error: 'Recipient is not connected to this room' });
          return;
        }
      }

      const savedMessage = await ChatService.saveMessage({
        roomId,
        senderId,
        recipientId,
        content: rawContent,
        messageType,
      });

      const payload = {
        id: savedMessage.id,
        roomId: savedMessage.roomId,
        senderId: savedMessage.senderId,
        recipientId: savedMessage.recipientId,
        content: savedMessage.content,
        messageType: savedMessage.messageType,
        createdAt: savedMessage.createdAt,
        updatedAt: savedMessage.updatedAt,
        sender: savedMessage.sender,
        recipient: savedMessage.recipient,
        clientMessageId: data?.clientMessageId,
      };

      if (messageType === ChatMessageType.DIRECT) {
        // Emit to recipient sockets and echo back to sender
        directRecipientSockets.forEach(targetSocket => {
          targetSocket.emit('chat:message', payload);
        });
        socket.emit('chat:message', payload);
      } else {
        io.to(roomCode).emit('chat:message', payload);
      }

      callback?.({
        success: true,
        messageId: savedMessage.id,
        timestamp: savedMessage.createdAt,
        clientMessageId: data?.clientMessageId,
      });
    } catch (error: any) {
      logger.error('Error sending chat message', {
        socketId: socket.id,
        error: error?.message ?? error,
      });
      callback?.({ success: false, error: 'Failed to send message' });
    }
  };

  const handleHistoryRequest = async (data: HistoryPayload, callback?: (payload: any) => void) => {
    try {
      const roomId: string | undefined = socket.data.roomId;
      const participantId: string | undefined = socket.data.userId;

      if (!roomId || !participantId) {
        callback?.({ success: false, error: 'Not joined to a room' });
        return;
      }

      const limit = Number.isFinite(data?.limit) ? Number(data?.limit) : HISTORY_DEFAULT_LIMIT;
      const cursor = typeof data?.cursor === 'string' ? data.cursor : undefined;
      const otherParticipantId =
        typeof data?.participantId === 'string' && data.participantId.trim().length > 0
          ? data.participantId.trim()
          : undefined;

      let messages;
      if (otherParticipantId) {
        messages = await ChatService.getDirectMessages({
          roomId,
          limit,
          cursor,
          participantAId: participantId,
          participantBId: otherParticipantId,
        });
      } else {
        messages = await ChatService.getBroadcastMessages({
          roomId,
          limit,
          cursor,
        });
      }

      const nextCursor = messages.length > 0 ? messages[messages.length - 1].id : null;

      callback?.({
        success: true,
        messages,
        nextCursor,
      });
    } catch (error: any) {
      logger.error('Error fetching chat history', {
        socketId: socket.id,
        error: error?.message ?? error,
      });
      callback?.({ success: false, error: 'Failed to load history' });
    }
  };

  // New structured event for sending messages
  socket.on('chat:send', (data: SendChatPayload, callback?: (payload: any) => void) => {
    void sendChatMessage(data, callback);
  });

  // Legacy support for existing clients emitting "chat"
  socket.on('chat', (data: { message?: string }) => {
    void sendChatMessage({ content: data?.message ?? '' });
  });

  socket.on('chat:history', (data: HistoryPayload, callback?: (payload: any) => void) => {
    void handleHistoryRequest(data, callback);
  });

  socket.on('active-speaker', (data: { uid: string; isActiveSpeaker: boolean }) => {
    try {
      const { roomCode, userId } = socket.data;

      if (!roomCode) {
        return;
      }

      // Broadcast active speaker change with userId
      socket.to(roomCode).emit('active-speaker', {
        uid: data.uid,
        userId: userId || data.uid, // Use socket userId if available, fallback to uid
        isActiveSpeaker: data.isActiveSpeaker,
      });
    } catch (error: any) {
      logger.error('Error handling active speaker:', error);
    }
  });

  socket.on('audio-mute', async (data: { isAudioMuted: boolean; uid: string }) => {
    try {
      const { roomCode, roomId } = socket.data;
      const socketUserId: string | undefined = socket.data.userId;

      if (!roomCode) {
        return;
      }

      const targetUserId = socketUserId || data.uid;
      if (!targetUserId) {
        logger.warn('Audio mute event missing user identifier', { socketId: socket.id, roomCode });
        return;
      }

      const normalizedAudioMuted = Boolean(data.isAudioMuted);
      const timestamp = Date.now();

      let isVideoMuted: boolean | undefined;
      let videoMutedAt: number | null | undefined;

      const redisState = await RedisStateService.getParticipantMuteState(roomCode, targetUserId);
      if (redisState) {
        isVideoMuted = redisState.isVideoMuted;
        videoMutedAt = redisState.videoMutedAt ?? null;
      }

      if (typeof isVideoMuted !== 'boolean' && roomId) {
        const dbState = await RoomService.getParticipantMuteState(roomId, targetUserId);
        if (dbState) {
          isVideoMuted = dbState.isVideoMuted;
          videoMutedAt = dbState.videoMutedAt ? dbState.videoMutedAt.getTime() : null;
        }
      }

      if (typeof isVideoMuted !== 'boolean') {
        isVideoMuted = true;
        videoMutedAt = null;
      }

      await RedisStateService.setParticipantMuteState(roomCode, targetUserId, {
        isAudioMuted: normalizedAudioMuted,
        isVideoMuted,
        audioMutedAt: timestamp,
        videoMutedAt: videoMutedAt ?? null,
      });

      if (roomId) {
        await RoomService.updateParticipantMuteState(roomId, targetUserId, {
          isAudioMuted: normalizedAudioMuted,
          audioMutedAt: new Date(timestamp),
        });
      } else {
        logger.warn('Skipping database persistence for audio mute due to missing roomId', {
          socketId: socket.id,
          roomCode,
          targetUserId,
        });
      }

      socket.to(roomCode).emit('audio-mute', {
        ...data,
        isAudioMuted: normalizedAudioMuted,
        userId: targetUserId,
      });
    } catch (error: any) {
      logger.error('Error handling audio mute:', {
        error: error?.message ?? error,
        socketId: socket.id,
      });
    }
  });

  socket.on('video-mute', async (data: { isVideoMuted: boolean; uid: string }) => {
    try {
      const { roomCode, roomId } = socket.data;
      const socketUserId: string | undefined = socket.data.userId;

      if (!roomCode) {
        return;
      }

      const targetUserId = socketUserId || data.uid;

      if (!targetUserId) {
        logger.warn('Video mute event missing user identifier', { socketId: socket.id, roomCode });
        return;
      }

      const normalizedVideoMuted = Boolean(data.isVideoMuted);
      const timestamp = Date.now();

      let isAudioMuted: boolean | undefined;
      let audioMutedAt: number | null | undefined;

      const redisState = await RedisStateService.getParticipantMuteState(roomCode, targetUserId);
      if (redisState) {
        isAudioMuted = redisState.isAudioMuted;
        audioMutedAt = redisState.audioMutedAt ?? null;
      }

      if (typeof isAudioMuted !== 'boolean' && roomId) {
        const dbState = await RoomService.getParticipantMuteState(roomId, targetUserId);
        if (dbState) {
          isAudioMuted = dbState.isAudioMuted;
          audioMutedAt = dbState.audioMutedAt ? dbState.audioMutedAt.getTime() : null;
        }
      }

      if (typeof isAudioMuted !== 'boolean') {
        isAudioMuted = true;
        audioMutedAt = null;
      }

      await RedisStateService.setParticipantMuteState(roomCode, targetUserId, {
        isAudioMuted,
        isVideoMuted: normalizedVideoMuted,
        audioMutedAt: audioMutedAt ?? null,
        videoMutedAt: timestamp,
      });

      if (roomId) {
        await RoomService.updateParticipantMuteState(roomId, targetUserId, {
          isVideoMuted: normalizedVideoMuted,
          videoMutedAt: new Date(timestamp),
        });
      } else {
        logger.warn('Skipping database persistence for video mute due to missing roomId', {
          socketId: socket.id,
          roomCode,
          targetUserId,
        });
      }

      socket.to(roomCode).emit('video-mute', {
        ...data,
        isVideoMuted: normalizedVideoMuted,
        userId: targetUserId,
      });
    } catch (error: any) {
      logger.error('Error handling video mute:', {
        error: error?.message ?? error,
        socketId: socket.id,
      });
    }
  });

  socket.on('raised-hand', (data: { uid: string; isRaised: boolean }) => {
    try {
      const { roomCode, userId } = socket.data;

      if (!roomCode) {
        return;
      }

      // Broadcast with userId included
      socket.to(roomCode).emit('raised-hand', {
        ...data,
        userId: userId || data.uid, // Use socket userId if available, fallback to uid
      });
    } catch (error: any) {
      logger.error('Error handling raised hand:', error);
    }
  });
}

