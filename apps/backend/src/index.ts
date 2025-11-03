import { createServer } from './api/server';
import { createSignalingServer } from './signaling/signaling.server';
import { config } from './shared/config';
import { logger } from './shared/utils/logger';
import prisma from './shared/database/prisma';
import redis from './shared/database/redis';
import { WorkerManager } from './media/Worker';

async function start() {
  try {
    // Test database connections
    await prisma.$connect();
    logger.info('PostgreSQL connected');

    await redis.ping();
    logger.info('Redis connected');

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
      await WorkerManager.close();
      await fastify.close();
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

