import { createServer } from './api/server';
import { createSignalingServer } from './signaling/signaling.server';
import { config } from './shared/config';
import { logger } from './shared/utils/logger';
import prisma from './shared/database/prisma';
import redis from './shared/database/redis';
import { WorkerManager } from './media/Worker';
import { RoomRoutingService } from './shared/services/room-routing.service';
import { metrics } from './shared/metrics/prometheus';

async function start() {
  try {
    // Test database connections
    await prisma.$connect();
    logger.info('PostgreSQL connected');

    await redis.ping();
    logger.info('Redis connected');

    // Start room routing heartbeat (for server health tracking)
    RoomRoutingService.startHeartbeat();
    logger.info(`Room routing service started for server instance: ${config.server.instanceId}`);

    // Start Prometheus metrics collection
    metrics.startCollection();
    logger.info('Prometheus metrics collection started');

    // Start Mediasoup workers
    await WorkerManager.createWorkers();

    // Start API server
    const fastify = await createServer();
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    
    logger.info(`API server listening on port ${config.port}`);
    logger.info(`API documentation: http://localhost:${config.port}/docs`);

    // Start Socket.io signaling server
    createSignalingServer(fastify.server);
    logger.info(`Signaling server initialized on /socket`);

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      
      // Stop heartbeat
      RoomRoutingService.stopHeartbeat();
      
      // Stop metrics collection
      metrics.stopCollection();
      
      // Close Mediasoup workers
      await WorkerManager.close();
      
      // Close API server
      await fastify.close();
      
      // Disconnect databases
      await prisma.$disconnect();
      await redis.quit();
      
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

