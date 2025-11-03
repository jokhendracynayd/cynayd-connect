import { FastifyInstance } from 'fastify';
import prisma from '../../shared/database/prisma';
import redis from '../../shared/database/redis';
import { WorkerManager } from '../../media/Worker';
import { logger } from '../../shared/utils/logger';
import { RoomRoutingService } from '../../shared/services/room-routing.service';
import { config } from '../../shared/config';
import { metrics } from '../../shared/metrics/prometheus';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  server: {
    instanceId: string;
    port: number;
    signalingPort: number;
  };
  dependencies: {
    database: {
      status: 'up' | 'down';
      responseTime?: number;
      error?: string;
    };
    redis: {
      status: 'up' | 'down';
      responseTime?: number;
      error?: string;
    };
    mediasoup: {
      status: 'up' | 'down';
      workers: number;
      error?: string;
    };
  };
  metrics?: {
    memory: NodeJS.MemoryUsage;
    cpu?: NodeJS.CpuUsage;
  };
}

/**
 * Health check routes
 * - /health: Comprehensive health check with dependencies
 * - /health/live: Liveness probe (Kubernetes) - is process alive?
 * - /health/ready: Readiness probe (Kubernetes) - is service ready to serve traffic?
 */
export async function healthRoutes(fastify: FastifyInstance) {
  // Comprehensive health check
  fastify.get('/health', async (_request, reply) => {
    const result: HealthCheckResult = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      server: {
        instanceId: config.server.instanceId,
        port: config.port,
        signalingPort: config.signalingPort,
      },
      dependencies: {
        database: { status: 'down' },
        redis: { status: 'down' },
        mediasoup: { status: 'down', workers: 0 },
      },
      metrics: {
        memory: process.memoryUsage(),
      },
    };

    // Check database
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      const dbTime = Date.now() - dbStart;
      result.dependencies.database = {
        status: 'up',
        responseTime: dbTime,
      };
    } catch (error) {
      result.dependencies.database = {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      result.status = 'unhealthy';
    }

    // Check Redis
    try {
      const redisStart = Date.now();
      await redis.ping();
      const redisTime = Date.now() - redisStart;
      result.dependencies.redis = {
        status: 'up',
        responseTime: redisTime,
      };
    } catch (error) {
      result.dependencies.redis = {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      if (result.status === 'healthy') {
        result.status = 'degraded'; // Redis down but DB up
      }
    }

    // Check Mediasoup workers
    try {
      const stats = WorkerManager.getStats();
      result.dependencies.mediasoup = {
        status: stats.total > 0 ? 'up' : 'down',
        workers: stats.total,
      };
      if (stats.total === 0) {
        result.status = 'unhealthy';
      }
    } catch (error) {
      result.dependencies.mediasoup = {
        status: 'down',
        workers: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      result.status = 'unhealthy';
    }

    // Check CPU usage (if available)
    if (process.cpuUsage) {
      result.metrics!.cpu = process.cpuUsage();
    }

    const statusCode = result.status === 'healthy' ? 200 : result.status === 'degraded' ? 200 : 503;
    return reply.code(statusCode).send(result);
  });

  // Liveness probe (Kubernetes)
  // Returns 200 if process is alive, regardless of dependencies
  fastify.get('/health/live', async (_request, reply) => {
    return reply.send({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Readiness probe (Kubernetes)
  // Returns 200 only if service is ready to serve traffic (critical dependencies are up)
  fastify.get('/health/ready', async (_request, reply) => {
    const checks: Record<string, boolean> = {};
    let ready = true;

    // Check database (critical)
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch (error) {
      checks.database = false;
      ready = false;
      logger.error('Readiness check failed: Database unavailable');
    }

    // Check Redis (critical for horizontal scaling)
    try {
      await redis.ping();
      checks.redis = true;
    } catch (error) {
      checks.redis = false;
      ready = false;
      logger.error('Readiness check failed: Redis unavailable');
    }

    // Check Mediasoup workers (critical)
    try {
      const stats = WorkerManager.getStats();
      checks.mediasoup = stats.total > 0;
      if (stats.total === 0) {
        ready = false;
        logger.error('Readiness check failed: No Mediasoup workers');
      }
    } catch (error) {
      checks.mediasoup = false;
      ready = false;
      logger.error('Readiness check failed: Mediasoup workers error');
    }

    const result = {
      status: ready ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks,
    };

    return reply.code(ready ? 200 : 503).send(result);
  });

  // Server info endpoint (for debugging/monitoring)
  fastify.get('/health/info', async (_request, reply) => {
    try {
      const workerStats = WorkerManager.getStats();
      
      // Get room routing info
      const roomCount = await RoomRoutingService.getServerRoomCount(config.server.instanceId);
      const isHealthy = await RoomRoutingService.isServerHealthy(config.server.instanceId);
      
      return reply.send({
        server: {
          instanceId: config.server.instanceId,
          port: config.port,
          signalingPort: config.signalingPort,
          environment: config.env,
        },
        mediasoup: {
          workers: workerStats.total,
          currentIndex: workerStats.currentIndex,
        },
        routing: {
          roomCount,
          isHealthy,
        },
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          nodeVersion: process.version,
          platform: process.platform,
        },
      });
    } catch (error) {
      logger.error('Error getting health info:', error);
      return reply.code(500).send({
        error: 'Failed to get health info',
      });
    }
  });

  // Prometheus metrics endpoint
  fastify.get('/metrics', async (_request, reply) => {
    try {
      const metricsData = await metrics.getMetrics();
      return reply
        .header('Content-Type', 'text/plain; version=0.0.4')
        .send(metricsData);
    } catch (error) {
      logger.error('Error getting metrics:', error);
      return reply.code(500).send({
        error: 'Failed to get metrics',
      });
    }
  });
}

