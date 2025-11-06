import { Server as SocketIOServer, Socket } from 'socket.io';
import { RouterManager } from '../../media/Router';
import { TransportManager } from '../../media/Transport';
import { ProducerManager } from '../../media/Producer';
import { ConsumerManager } from '../../media/Consumer';
import { logger } from '../../shared/utils/logger';
import {
  createTransportSchema,
  connectTransportSchema,
  produceSchema,
  consumeSchema,
  closeProducerSchema,
  pauseProducerSchema,
  resumeProducerSchema,
  replaceTrackSchema,
} from '../../api/schemas/media.schema';

export function mediaHandler(_io: SocketIOServer, socket: Socket) {
  
  // Create WebRTC Transport
  socket.on('createTransport', async (data: unknown, callback) => {
    try {
      // Validate input
      const validatedData = createTransportSchema.parse(data);
      
      const { roomId } = socket.data;

      if (!roomId) {
        return callback({ error: 'Room ID not found. Please join a room first.' });
      }

      const router = RouterManager.getRouter(roomId);

      if (!router) {
        return callback({ error: 'Router not found' });
      }

      const transport = await TransportManager.createTransport(
        router,
        socket.id,
        roomId,
        validatedData.isProducer
      );

      // Get ICE candidates (they may be gathered asynchronously)
      const iceCandidates = transport.iceCandidates || [];

      logger.debug(`Transport created for socket ${socket.id}`, {
        transportId: transport.id,
        iceCandidatesCount: iceCandidates.length,
        iceCandidates: iceCandidates.map((c: any) => ({
          foundation: c.foundation,
          priority: c.priority,
          ip: c.ip,
          port: c.port,
          type: c.type,
          protocol: c.protocol,
        })),
      });

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('Error creating transport:', error);
        callback({ error: error.message });
      } else {
        logger.error('Error creating transport:', error);
        callback({ error: 'Validation error: Invalid input data' });
      }
    }
  });

  // Connect Transport
  socket.on('connectTransport', async (data: unknown, callback) => {
    try {
      // Validate input
      const validatedData = connectTransportSchema.parse(data);
      
      const transport = TransportManager.getTransport(validatedData.transportId);

      if (!transport) {
        return callback({ error: 'Transport not found' });
      }

      await transport.connect({ dtlsParameters: validatedData.dtlsParameters });
      logger.debug(`Transport ${validatedData.transportId} connected`);
      callback({ success: true });
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('Error connecting transport:', error);
        callback({ error: error.message });
      } else {
        logger.error('Error connecting transport:', error);
        callback({ error: 'Validation error: Invalid input data' });
      }
    }
  });

  // Produce (publish audio/video)
  socket.on('produce', async (data: unknown, callback) => {
    try {
      // Validate input
      const validatedData = produceSchema.parse(data);
      
      const transport = TransportManager.getTransport(validatedData.transportId);

      if (!transport) {
        return callback({ error: 'Transport not found' });
      }

      const inferredSource = validatedData.appData?.source
        ? String(validatedData.appData.source)
        : validatedData.kind === 'audio'
          ? 'microphone'
          : 'camera';

      const producerAppData = {
        ...validatedData.appData,
        source: inferredSource,
        userId: socket.data.userId,
        roomId: socket.data.roomId,
      };

      const producer = await transport.produce({
        kind: validatedData.kind,
        rtpParameters: validatedData.rtpParameters,
        appData: producerAppData,
      });

      // Ensure producer app data includes the enriched metadata
      producer.appData = producerAppData;

      // Store producer with metadata
      const { roomId, userId } = socket.data;
      if (!roomId || !userId) {
        return callback({ error: 'Room ID or User ID not found' });
      }
      
      await ProducerManager.addProducer(socket.id, producer, roomId, userId);

      // Check if it's a screen share (from appData)
      const isScreenShare = producerAppData.source === 'screen';
      const displayName = (socket.data as any).userName || (socket.data as any).name || 'Unknown';

      // Notify all peers about the new producer with metadata
      socket.to(socket.data.roomCode).emit('new-producer', {
        producerId: producer.id,
        userId: socket.data.userId,
        kind: validatedData.kind,
        appData: producerAppData,
        name: displayName,
      });

      if (isScreenShare) {
        // Additional UX notification for screen share start
        socket.to(socket.data.roomCode).emit('screen-share-started', {
          userId: socket.data.userId,
          producerId: producer.id,
          name: displayName,
          kind: 'video',
        });

        logger.info(`Screen share started: ${producer.id} by ${userId}`);
      } else {
        logger.info(`Producer created: ${producer.id} (${validatedData.kind})`);
      }

      callback({ id: producer.id });
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('Error producing:', error);
        callback({ error: error.message });
      } else {
        logger.error('Error producing:', error);
        callback({ error: 'Validation error: Invalid input data' });
      }
    }
  });

  // Consume (subscribe to audio/video)
  socket.on('consume', async (data: unknown, callback) => {
    try {
      // Validate input
      const validatedData = consumeSchema.parse(data);
      
      const { roomId } = socket.data;
      const router = RouterManager.getRouter(roomId);
      const transport = TransportManager.getTransport(validatedData.transportId);

      if (!router || !transport) {
        return callback({ error: 'Router or transport not found' });
      }

      // Check if can consume
      if (!router.canConsume({
        producerId: validatedData.producerId,
        rtpCapabilities: validatedData.rtpCapabilities,
      })) {
        return callback({ error: 'Cannot consume' });
      }

      // Create consumer
      const consumer = await transport.consume({
        producerId: validatedData.producerId,
        rtpCapabilities: validatedData.rtpCapabilities,
        paused: false,
      });

      // Store consumer with metadata
      await ConsumerManager.addConsumer(socket.id, consumer, validatedData.producerId);

      // Get producer info
      const producerInfo = ProducerManager.getProducerById(validatedData.producerId);

      callback({
        id: consumer.id,
        producerId: validatedData.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });

      logger.info(`Consumer created: ${consumer.id}`);
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('Error consuming:', error);
        callback({ error: error.message });
      } else {
        logger.error('Error consuming:', error);
        callback({ error: 'Validation error: Invalid input data' });
      }
    }
  });

  // Close producer
  socket.on('closeProducer', async (data: unknown) => {
    try {
      // Validate input
      const validatedData = closeProducerSchema.parse(data);
      
      // Check if it's a screen share before closing
      const producerInfo = ProducerManager.getProducerById(validatedData.producerId);
      const isScreenShare = producerInfo?.producer.appData?.source === 'screen';
      
      await ProducerManager.closeProducer(socket.id, validatedData.producerId);
      
      if (isScreenShare) {
        socket.to(socket.data.roomCode).emit('screen-share-stopped', {
          userId: socket.data.userId,
          producerId: validatedData.producerId,
        });
        logger.info(`Screen share stopped: ${validatedData.producerId}`);
      } else {
        socket.to(socket.data.roomCode).emit('producer-closed', {
          producerId: validatedData.producerId,
          userId: socket.data.userId,
        });
        logger.info(`Producer closed: ${validatedData.producerId}`);
      }
    } catch (error: unknown) {
      logger.error('Error closing producer:', error);
    }
  });

  // Screen share started (acknowledgment handler)
  socket.on('screen-share-started', async (data: unknown, callback) => {
    // This is mainly for acknowledgment
    // The actual producer was created via 'produce' event
    callback({ success: true });
  });

  // Screen share stopped (acknowledgment handler)
  socket.on('screen-share-stopped', async (data: unknown, callback) => {
    // Mainly for acknowledgment
    callback({ success: true });
  });

  // Pause producer
  socket.on('pauseProducer', async (data: unknown, callback) => {
    try {
      // Validate input
      const validatedData = pauseProducerSchema.parse(data);
      
      const producerInfo = ProducerManager.getProducerById(validatedData.producerId);

      if (!producerInfo || producerInfo.socketId !== socket.id) {
        return callback({ error: 'Producer not found or unauthorized' });
      }

      producerInfo.producer.pause();

      // Notify other participants
      socket.to(socket.data.roomCode).emit('producer-paused', {
        producerId: validatedData.producerId,
        userId: socket.data.userId,
        kind: producerInfo.producer.kind,
      });

      logger.info(`Producer paused: ${validatedData.producerId}`);
      callback({ success: true });
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('Error pausing producer:', error);
        callback({ error: error.message });
      } else {
        logger.error('Error pausing producer:', error);
        callback({ error: 'Validation error: Invalid input data' });
      }
    }
  });

  // Resume producer
  socket.on('resumeProducer', async (data: unknown, callback) => {
    try {
      // Validate input
      const validatedData = resumeProducerSchema.parse(data);
      
      const producerInfo = ProducerManager.getProducerById(validatedData.producerId);

      if (!producerInfo || producerInfo.socketId !== socket.id) {
        return callback({ error: 'Producer not found or unauthorized' });
      }

      producerInfo.producer.resume();

      // Notify other participants
      socket.to(socket.data.roomCode).emit('producer-resumed', {
        producerId: validatedData.producerId,
        userId: socket.data.userId,
        kind: producerInfo.producer.kind,
      });

      logger.info(`Producer resumed: ${validatedData.producerId}`);
      callback({ success: true });
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('Error resuming producer:', error);
        callback({ error: error.message });
      } else {
        logger.error('Error resuming producer:', error);
        callback({ error: 'Validation error: Invalid input data' });
      }
    }
  });

  // Notify track replaced in producer (for video re-enable)
  // Note: Actual track replacement happens client-side via producer.replaceTrack()
  // This handler is just for server-side notification
  socket.on('replaceTrack', async (data: unknown, callback) => {
    try {
      // Validate input
      const validatedData = replaceTrackSchema.parse(data);
      
      const producerInfo = ProducerManager.getProducerById(validatedData.producerId);

      if (!producerInfo || producerInfo.socketId !== socket.id) {
        return callback({ error: 'Producer not found or unauthorized' });
      }

      // Notify other participants that track was replaced
      socket.to(socket.data.roomCode).emit('producer-track-replaced', {
        producerId: validatedData.producerId,
        userId: socket.data.userId,
        kind: producerInfo.producer.kind,
      });

      logger.info(`Producer track replaced: ${validatedData.producerId}`);
      callback({ success: true });
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('Error replacing track:', error);
        callback({ error: error.message });
      } else {
        logger.error('Error replacing track:', error);
        callback({ error: 'Validation error: Invalid input data' });
      }
    }
  });
}

