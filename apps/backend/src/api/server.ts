import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { config } from '../shared/config';
import { logger } from '../shared/utils/logger';
import { authRoutes } from './routes/auth.routes';
import { roomsRoutes } from './routes/rooms.routes';
import { healthRoutes } from './routes/health.routes';
import { AppError } from '../shared/utils/errors';

export async function createServer() {
  const fastify = Fastify({
    logger: false, // Use Winston instead
  });

  // Security plugins
  await fastify.register(helmet);
  await fastify.register(cors, config.cors);
  await fastify.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
  });

  // Swagger documentation
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Connect SDK API',
        description: 'WebRTC Video Calling API Documentation',
        version: '1.0.0',
      },
      servers: [
        { url: 'http://localhost:3000', description: 'Development' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await fastify.register(swaggerUI, {
    routePrefix: '/docs',
  });

  // Health check routes (before API routes for quick checks)
  await fastify.register(healthRoutes);

  // API routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(roomsRoutes, { prefix: '/api/rooms' });

  // Global error handler
  fastify.setErrorHandler((error, _request, reply) => {
    logger.error('Error:', error);

    const fastifyError = error as FastifyError & { validation?: unknown };

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        success: false,
        message: error.message,
        statusCode: error.statusCode,
      });
    }

    // Validation errors
    if (fastifyError.validation) {
      return reply.code(400).send({
        success: false,
        message: 'Validation error',
        errors: fastifyError.validation,
      });
    }

    // Unknown errors
    return reply.code(500).send({
      success: false,
      message:
        config.env === 'production'
          ? 'Internal server error'
          : fastifyError.message ?? 'Internal server error',
    });
  });

  return fastify;
}

