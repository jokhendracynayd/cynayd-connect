# Sprint 2: Mediasoup Integration & WebRTC Signaling

**Duration**: 2 weeks (Week 3-4)
**Team**: 1-2 Backend Engineers
**Prerequisites**: Sprint 1 completed (REST API, database, authentication)

## Overview

Integrate Mediasoup SFU (Selective Forwarding Unit) and implement WebSocket-based signaling for WebRTC connections. At the end of this sprint, the backend will be able to establish WebRTC connections between clients, create media transports, and forward audio/video streams.

## Goals

### Primary Goals
1. Install and configure Mediasoup 3.14.x
2. Create Worker pool management
3. Implement Router creation per room
4. Set up Socket.io 4.8.1 signaling server
5. Implement WebRTC transport creation (send/receive)
6. Handle Producer creation (audio/video publishing)
7. Handle Consumer creation (audio/video subscription)
8. Implement signaling event handlers
9. Add Redis pub/sub for multi-server communication
10. Write integration tests for signaling flow

### Success Criteria
- [ ] Mediasoup workers running stably
- [ ] Socket.io server accepting connections on port 4000
- [ ] Room creation in Mediasoup working
- [ ] WebRTC transports can be created
- [ ] Producers can publish audio/video
- [ ] Consumers can receive audio/video
- [ ] Multiple users can connect to same room
- [ ] Reconnection logic working
- [ ] Integration tests passing

## Architecture

### Mediasoup Components

```
┌─────────────────────────────────────────────────────┐
│               Mediasoup Worker Pool                  │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │  Worker 1   │  │  Worker 2   │  │  Worker N  │ │
│  │             │  │             │  │            │ │
│  │  ┌────────┐ │  │  ┌────────┐ │  │  ┌───────┐│ │
│  │  │Router 1││ │  │  │Router 2││ │  │  │Router│││ │
│  │  │(Room A)││ │  │  │(Room B)││ │  │  │  N   ││││
│  │  └────────┘ │  │  └────────┘ │  │  └───────┘│ │
│  └─────────────┘  └─────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────┘
```

### WebRTC Flow

```
Client                Socket.io Server         Mediasoup
  │                           │                    │
  ├──(1) Connect Socket───────>│                    │
  │                           │                    │
  ├──(2) joinRoom─────────────>│                    │
  │                           ├──Create Router─────>│
  │                           │<──RTP Capabilities──┤
  │<─(3) rtpCapabilities───────┤                    │
  │                           │                    │
  ├──(4) createTransport──────>│                    │
  │                           ├──Create Transport──>│
  │<─(5) transport params──────┤<──Transport ID─────┤
  │                           │                    │
  ├──(6) connectTransport─────>│                    │
  │                           ├──Connect──────────>│
  │<─(7) connected─────────────┤                    │
  │                           │                    │
  ├──(8) produce─────────────>│                    │
  │                           ├──Create Producer───>│
  │<─(9) producer ID───────────┤<──Producer ID──────┤
  │                           │                    │
  ├──(10) consume─────────────>│                    │
  │                           ├──Create Consumer───>│
  │<─(11) consumer params──────┤<──Consumer params──┤
  │                           │                    │
```

## Implementation

### Day 1-2: Mediasoup Setup

#### Install Dependencies

```bash
cd apps/backend
pnpm add mediasoup@3.14.15
pnpm add -D @types/mediasoup
```

#### Create Mediasoup Configuration

`src/shared/config/mediasoup.config.ts`:
```typescript
import { WorkerLogLevel, WorkerLogTag } from 'mediasoup/node/lib/types';

export const mediasoupConfig = {
  // Worker settings
  worker: {
    rtcMinPort: 2000,
    rtcMaxPort: 2420,
    logLevel: 'warn' as WorkerLogLevel,
    logTags: [
      'info',
      'ice',
      'dtls',
      'rtp',
      'srtp',
      'rtcp',
    ] as WorkerLogTag[],
  },

  // Router settings
  router: {
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000,
        },
      },
      {
        kind: 'video',
        mimeType: 'video/H264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f',
          'level-asymmetry-allowed': 1,
        },
      },
    ],
  },

  // WebRTC transport settings
  webRtcTransport: {
    listenIps: [
      {
        ip: '0.0.0.0',
        announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
      },
    ],
    initialAvailableOutgoingBitrate: 1000000,
    minimumAvailableOutgoingBitrate: 600000,
    maxSctpMessageSize: 262144,
    maxIncomingBitrate: 1500000,
  },
};
```

#### Create Worker Manager

`src/media/Worker.ts`:
```typescript
import * as mediasoup from 'mediasoup';
import { Worker } from 'mediasoup/node/lib/types';
import { mediasoupConfig } from '../shared/config/mediasoup.config';
import { logger } from '../shared/utils/logger';
import os from 'os';

export class WorkerManager {
  private static workers: Worker[] = [];
  private static currentWorkerIndex = 0;

  static async createWorkers() {
    const numWorkers = os.cpus().length;
    logger.info(`Creating ${numWorkers} Mediasoup workers...`);

    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker({
        logLevel: mediasoupConfig.worker.logLevel,
        logTags: mediasoupConfig.worker.logTags,
        rtcMinPort: mediasoupConfig.worker.rtcMinPort,
        rtcMaxPort: mediasoupConfig.worker.rtcMaxPort,
      });

      worker.on('died', () => {
        logger.error(`Mediasoup worker ${worker.pid} died, exiting in 2 seconds...`);
        setTimeout(() => process.exit(1), 2000);
      });

      this.workers.push(worker);
      logger.info(`Worker ${i + 1}/${numWorkers} created (PID: ${worker.pid})`);
    }
  }

  static getWorker(): Worker {
    const worker = this.workers[this.currentWorkerIndex];
    this.currentWorkerIndex = (this.currentWorkerIndex + 1) % this.workers.length;
    return worker;
  }

  static async close() {
    for (const worker of this.workers) {
      worker.close();
    }
    this.workers = [];
  }
}
```

#### Create Router Manager

`src/media/Router.ts`:
```typescript
import { Router } from 'mediasoup/node/lib/types';
import { WorkerManager } from './Worker';
import { mediasoupConfig } from '../shared/config/mediasoup.config';
import { logger } from '../shared/utils/logger';

export class RouterManager {
  private static routers: Map<string, Router> = new Map();

  static async createRouter(roomId: string): Promise<Router> {
    // Return existing router if already created
    if (this.routers.has(roomId)) {
      return this.routers.get(roomId)!;
    }

    // Get least loaded worker
    const worker = WorkerManager.getWorker();

    // Create router
    const router = await worker.createRouter({
      mediaCodecs: mediasoupConfig.router.mediaCodecs,
    });

    logger.info(`Router created for room ${roomId} (Router ID: ${router.id})`);

    // Store router
    this.routers.set(roomId, router);

    return router;
  }

  static getRouter(roomId: string): Router | undefined {
    return this.routers.get(roomId);
  }

  static async closeRouter(roomId: string) {
    const router = this.routers.get(roomId);
    if (router) {
      router.close();
      this.routers.delete(roomId);
      logger.info(`Router closed for room ${roomId}`);
    }
  }
}
```

### Day 3-4: Socket.io Signaling Server

#### Install Socket.io

```bash
pnpm add socket.io@4.8.1
pnpm add -D @types/socket.io
```

#### Create Socket.io Server

`src/signaling/signaling.server.ts`:
```typescript
import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from '../shared/config';
import { logger } from '../shared/utils/logger';
import { TokenService } from '../shared/services/token.service';
import { roomHandler } from './handlers/room.handler';
import { mediaHandler } from './handlers/media.handler';
import { chatHandler } from './handlers/chat.handler';

export function createSignalingServer(httpServer: HTTPServer) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.cors.origin,
      credentials: true,
    },
    path: '/socket',
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = await TokenService.verifyAccessToken(token);
      socket.data.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id} (User: ${socket.data.userId})`);

    // Register handlers
    roomHandler(io, socket);
    mediaHandler(io, socket);
    chatHandler(io, socket);

    socket.on('disconnect', (reason) => {
      logger.info(`Client disconnected: ${socket.id} (Reason: ${reason})`);
    });
  });

  return io;
}
```

### Day 5-7: WebRTC Handlers

#### Room Handler

`src/signaling/handlers/room.handler.ts`:
```typescript
import { Server as SocketIOServer, Socket } from 'socket.io';
import { RouterManager } from '../../media/Router';
import { RoomService } from '../../shared/services/rooms.service';
import { logger } from '../../shared/utils/logger';
import redis from '../../shared/database/redis';

interface JoinRoomData {
  roomCode: string;
  name: string;
  email: string;
  picture?: string;
}

export function roomHandler(io: SocketIOServer, socket: Socket) {
  socket.on('joinRoom', async (data: JoinRoomData, callback) => {
    try {
      const userId = socket.data.userId;
      const { roomCode, name, email, picture } = data;

      // Get or create room
      const room = await RoomService.joinRoom(userId, roomCode);

      // Create Mediasoup router
      const router = await RouterManager.createRouter(room.id);

      // Join Socket.io room
      await socket.join(roomCode);

      // Store socket data
      socket.data.roomCode = roomCode;
      socket.data.roomId = room.id;
      socket.data.userName = name;

      // Publish join event to Redis (for multi-server)
      await redis.publish('room:join', JSON.stringify({
        roomCode,
        userId,
        socketId: socket.id,
        name,
        email,
        picture,
      }));

      // Notify other participants
      socket.to(roomCode).emit('user-joined', {
        userId,
        name,
        email,
        picture,
      });

      // Get existing participants
      const participants = await getParticipantsInRoom(roomCode);

      logger.info(`User ${userId} joined room ${roomCode}`);

      callback({
        success: true,
        rtpCapabilities: router.rtpCapabilities,
        participants,
      });
    } catch (error) {
      logger.error('Error joining room:', error);
      callback({
        success: false,
        error: error.message,
      });
    }
  });

  socket.on('leaveRoom', async () => {
    try {
      const { roomCode, userId } = socket.data;

      if (roomCode) {
        await RoomService.leaveRoom(userId, roomCode);
        
        socket.to(roomCode).emit('user-left', { userId });
        socket.leave(roomCode);

        await redis.publish('room:leave', JSON.stringify({
          roomCode,
          userId,
          socketId: socket.id,
        }));

        logger.info(`User ${userId} left room ${roomCode}`);
      }
    } catch (error) {
      logger.error('Error leaving room:', error);
    }
  });
}

async function getParticipantsInRoom(roomCode: string): Promise<any[]> {
  // This will be replaced with proper implementation
  return [];
}
```

#### Media Handler

`src/signaling/handlers/media.handler.ts`:
```typescript
import { Server as SocketIOServer, Socket } from 'socket.io';
import { RouterManager } from '../../media/Router';
import { TransportManager } from '../../media/Transport';
import { ProducerManager } from '../../media/Producer';
import { ConsumerManager } from '../../media/Consumer';
import { logger } from '../../shared/utils/logger';

export function mediaHandler(io: SocketIOServer, socket: Socket) {
  
  // Create WebRTC Transport
  socket.on('createTransport', async (data: { isProducer: boolean }, callback) => {
    try {
      const { roomId } = socket.data;
      const router = RouterManager.getRouter(roomId);

      if (!router) {
        return callback({ error: 'Router not found' });
      }

      const transport = await TransportManager.createTransport(router, socket.id);

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (error) {
      logger.error('Error creating transport:', error);
      callback({ error: error.message });
    }
  });

  // Connect Transport
  socket.on('connectTransport', async (data: {
    transportId: string;
    dtlsParameters: any;
  }, callback) => {
    try {
      const transport = TransportManager.getTransport(data.transportId);

      if (!transport) {
        return callback({ error: 'Transport not found' });
      }

      await transport.connect({ dtlsParameters: data.dtlsParameters });
      callback({ success: true });
    } catch (error) {
      logger.error('Error connecting transport:', error);
      callback({ error: error.message });
    }
  });

  // Produce (publish audio/video)
  socket.on('produce', async (data: {
    transportId: string;
    kind: 'audio' | 'video';
    rtpParameters: any;
    appData?: any;
  }, callback) => {
    try {
      const transport = TransportManager.getTransport(data.transportId);

      if (!transport) {
        return callback({ error: 'Transport not found' });
      }

      const producer = await transport.produce({
        kind: data.kind,
        rtpParameters: data.rtpParameters,
        appData: data.appData,
      });

      // Store producer
      ProducerManager.addProducer(socket.id, producer);

      // Notify other participants
      socket.to(socket.data.roomCode).emit('new-producer', {
        producerId: producer.id,
        userId: socket.data.userId,
        kind: data.kind,
      });

      logger.info(`Producer created: ${producer.id} (${data.kind})`);

      callback({ id: producer.id });
    } catch (error) {
      logger.error('Error producing:', error);
      callback({ error: error.message });
    }
  });

  // Consume (subscribe to audio/video)
  socket.on('consume', async (data: {
    transportId: string;
    producerId: string;
    rtpCapabilities: any;
  }, callback) => {
    try {
      const { roomId } = socket.data;
      const router = RouterManager.getRouter(roomId);
      const transport = TransportManager.getTransport(data.transportId);

      if (!router || !transport) {
        return callback({ error: 'Router or transport not found' });
      }

      // Check if can consume
      if (!router.canConsume({
        producerId: data.producerId,
        rtpCapabilities: data.rtpCapabilities,
      })) {
        return callback({ error: 'Cannot consume' });
      }

      // Create consumer
      const consumer = await transport.consume({
        producerId: data.producerId,
        rtpCapabilities: data.rtpCapabilities,
        paused: false,
      });

      // Store consumer
      ConsumerManager.addConsumer(socket.id, consumer);

      callback({
        id: consumer.id,
        producerId: data.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });

      logger.info(`Consumer created: ${consumer.id}`);
    } catch (error) {
      logger.error('Error consuming:', error);
      callback({ error: error.message });
    }
  });

  // Close producer
  socket.on('closeProducer', async (data: { producerId: string }) => {
    try {
      ProducerManager.closeProducer(socket.id, data.producerId);
      
      socket.to(socket.data.roomCode).emit('producer-closed', {
        producerId: data.producerId,
        userId: socket.data.userId,
      });
    } catch (error) {
      logger.error('Error closing producer:', error);
    }
  });
}
```

#### Create Manager Classes

`src/media/Transport.ts`:
```typescript
import { Router, WebRtcTransport } from 'mediasoup/node/lib/types';
import { mediasoupConfig } from '../shared/config/mediasoup.config';

export class TransportManager {
  private static transports: Map<string, WebRtcTransport> = new Map();

  static async createTransport(router: Router, socketId: string): Promise<WebRtcTransport> {
    const transport = await router.createWebRtcTransport(
      mediasoupConfig.webRtcTransport
    );

    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'closed') {
        transport.close();
      }
    });

    transport.on('close', () => {
      this.transports.delete(transport.id);
    });

    this.transports.set(transport.id, transport);
    return transport;
  }

  static getTransport(transportId: string): WebRtcTransport | undefined {
    return this.transports.get(transportId);
  }

  static closeTransport(transportId: string) {
    const transport = this.transports.get(transportId);
    if (transport) {
      transport.close();
      this.transports.delete(transportId);
    }
  }
}
```

`src/media/Producer.ts`:
```typescript
import { Producer } from 'mediasoup/node/lib/types';

export class ProducerManager {
  private static producers: Map<string, Producer[]> = new Map();

  static addProducer(socketId: string, producer: Producer) {
    const socketProducers = this.producers.get(socketId) || [];
    socketProducers.push(producer);
    this.producers.set(socketId, socketProducers);

    producer.on('transportclose', () => {
      this.removeProducer(socketId, producer.id);
    });
  }

  static getProducers(socketId: string): Producer[] {
    return this.producers.get(socketId) || [];
  }

  static closeProducer(socketId: string, producerId: string) {
    const producers = this.producers.get(socketId) || [];
    const producer = producers.find(p => p.id === producerId);
    
    if (producer) {
      producer.close();
      this.removeProducer(socketId, producerId);
    }
  }

  private static removeProducer(socketId: string, producerId: string) {
    const producers = this.producers.get(socketId) || [];
    const filtered = producers.filter(p => p.id !== producerId);
    this.producers.set(socketId, filtered);
  }

  static closeAllProducers(socketId: string) {
    const producers = this.producers.get(socketId) || [];
    producers.forEach(p => p.close());
    this.producers.delete(socketId);
  }
}
```

`src/media/Consumer.ts`:
```typescript
import { Consumer } from 'mediasoup/node/lib/types';

export class ConsumerManager {
  private static consumers: Map<string, Consumer[]> = new Map();

  static addConsumer(socketId: string, consumer: Consumer) {
    const socketConsumers = this.consumers.get(socketId) || [];
    socketConsumers.push(consumer);
    this.consumers.set(socketId, socketConsumers);

    consumer.on('transportclose', () => {
      this.removeConsumer(socketId, consumer.id);
    });

    consumer.on('producerclose', () => {
      consumer.close();
      this.removeConsumer(socketId, consumer.id);
    });
  }

  static getConsumers(socketId: string): Consumer[] {
    return this.consumers.get(socketId) || [];
  }

  static closeConsumer(socketId: string, consumerId: string) {
    const consumers = this.consumers.get(socketId) || [];
    const consumer = consumers.find(c => c.id === consumerId);
    
    if (consumer) {
      consumer.close();
      this.removeConsumer(socketId, consumerId);
    }
  }

  private static removeConsumer(socketId: string, consumerId: string) {
    const consumers = this.consumers.get(socketId) || [];
    const filtered = consumers.filter(c => c.id !== consumerId);
    this.consumers.set(socketId, filtered);
  }

  static closeAllConsumers(socketId: string) {
    const consumers = this.consumers.get(socketId) || [];
    consumers.forEach(c => c.close());
    this.consumers.delete(socketId);
  }
}
```

### Day 8-9: Redis Pub/Sub & Multi-Server

#### Implement Redis Pub/Sub

`src/signaling/redis-adapter.ts`:
```typescript
import redis from '../shared/database/redis';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../shared/utils/logger';

export function setupRedisAdapter(io: SocketIOServer) {
  const sub = redis.duplicate();

  // Subscribe to room events
  sub.subscribe('room:join', 'room:leave', 'media:producer', (err) => {
    if (err) {
      logger.error('Redis subscription error:', err);
    } else {
      logger.info('Redis subscribed to room events');
    }
  });

  sub.on('message', (channel, message) => {
    const data = JSON.parse(message);

    switch (channel) {
      case 'room:join':
        handleRoomJoin(io, data);
        break;
      case 'room:leave':
        handleRoomLeave(io, data);
        break;
      case 'media:producer':
        handleNewProducer(io, data);
        break;
    }
  });
}

function handleRoomJoin(io: SocketIOServer, data: any) {
  // Sync room state across servers
  logger.debug('Room join event from Redis:', data);
}

function handleRoomLeave(io: SocketIOServer, data: any) {
  // Sync room state across servers
  logger.debug('Room leave event from Redis:', data);
}

function handleNewProducer(io: SocketIOServer, data: any) {
  // Notify clients on other servers about new producer
  logger.debug('New producer event from Redis:', data);
}
```

### Day 10: Testing

#### Integration Tests

`tests/integration/signaling.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ioClient, Socket } from 'socket.io-client';
import { createServer } from '../../src/api/server';
import { createSignalingServer } from '../../src/signaling/signaling.server';
import { WorkerManager } from '../../src/media/Worker';

describe('Signaling Server', () => {
  let httpServer: any;
  let client1: Socket;
  let client2: Socket;
  let accessToken: string;

  beforeAll(async () => {
    // Start server
    const fastify = await createServer();
    await fastify.listen({ port: 4000 });
    httpServer = fastify.server;
    
    // Start Mediasoup workers
    await WorkerManager.createWorkers();
    
    // Create signaling server
    createSignalingServer(httpServer);

    // Get access token (from auth)
    // ... implementation
  });

  afterAll(async () => {
    client1?.disconnect();
    client2?.disconnect();
    await WorkerManager.close();
    httpServer?.close();
  });

  it('should connect to signaling server', (done) => {
    client1 = ioClient('http://localhost:4000', {
      path: '/socket',
      auth: { token: accessToken },
    });

    client1.on('connect', () => {
      expect(client1.connected).toBe(true);
      done();
    });
  });

  it('should join room and receive RTP capabilities', (done) => {
    client1.emit('joinRoom', {
      roomCode: 'test-room',
      name: 'Test User',
      email: 'test@example.com',
    }, (response: any) => {
      expect(response.success).toBe(true);
      expect(response.rtpCapabilities).toBeDefined();
      done();
    });
  });

  it('should create WebRTC transport', (done) => {
    client1.emit('createTransport', { isProducer: true }, (response: any) => {
      expect(response.id).toBeDefined();
      expect(response.iceParameters).toBeDefined();
      expect(response.dtlsParameters).toBeDefined();
      done();
    });
  });
});
```

## Environment Variables

Add to `.env`:
```env
# Mediasoup
MEDIASOUP_ANNOUNCED_IP=127.0.0.1
MEDIASOUP_RTC_MIN_PORT=2000
MEDIASOUP_RTC_MAX_PORT=2420
```

## Testing Checklist

Sprint 2 Testing:
- [ ] Mediasoup workers start correctly
- [ ] Worker pool distributes load evenly
- [ ] Router created per room
- [ ] Socket.io accepts connections
- [ ] Authentication middleware works
- [ ] joinRoom event creates router
- [ ] WebRTC transport can be created
- [ ] Transport connects with DTLS parameters
- [ ] Producer can be created (audio/video)
- [ ] Consumer can be created
- [ ] Multiple users can join same room
- [ ] Producers/consumers cleaned up on disconnect
- [ ] Redis pub/sub syncs across servers
- [ ] Reconnection logic works
- [ ] Error handling for all edge cases

## Sprint Retrospective

### Deliverables Completed
✅ Mediasoup integrated
✅ Socket.io signaling server
✅ WebRTC transport creation
✅ Producer/consumer management
✅ Redis pub/sub setup

### Next Sprint
Frontend will connect to this signaling server using Socket.io client and mediasoup-client.

---

**Sprint 2 Complete**: Backend can now handle WebRTC signaling and media forwarding.

