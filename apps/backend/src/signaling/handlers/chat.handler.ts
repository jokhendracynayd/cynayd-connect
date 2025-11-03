import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../../shared/utils/logger';

export function chatHandler(io: SocketIOServer, socket: Socket) {
  
  socket.on('chat', (data: { message: string }) => {
    try {
      const { roomCode, userName, userId } = socket.data;

      if (!roomCode) {
        logger.error('Chat: No room code in socket data');
        return;
      }

      logger.debug(`Chat message from ${userName} in room ${roomCode}: ${data.message}`);

      // Broadcast to all users in room
      io.to(roomCode).emit('chat', {
        message: data.message,
        name: userName,
        userId,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('Error sending chat:', error);
    }
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

  socket.on('audio-mute', (data: { isAudioMuted: boolean; uid: string }) => {
    try {
      const { roomCode, userId } = socket.data;

      if (!roomCode) {
        return;
      }

      // Broadcast with userId included
      socket.to(roomCode).emit('audio-mute', {
        ...data,
        userId: userId || data.uid, // Use socket userId if available, fallback to uid
      });
    } catch (error: any) {
      logger.error('Error handling audio mute:', error);
    }
  });

  socket.on('video-mute', (data: { isVideoMuted: boolean; uid: string }) => {
    try {
      const { roomCode, userId } = socket.data;

      if (!roomCode) {
        return;
      }

      // Broadcast with userId included
      socket.to(roomCode).emit('video-mute', {
        ...data,
        userId: userId || data.uid, // Use socket userId if available, fallback to uid
      });
    } catch (error: any) {
      logger.error('Error handling video mute:', error);
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

