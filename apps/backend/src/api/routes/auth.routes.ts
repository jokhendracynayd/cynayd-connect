import { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { registerSchema, loginSchema, refreshTokenSchema } from '../schemas/auth.schema';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/register', {
    schema: registerSchema,
    handler: AuthController.register,
  });

  fastify.post('/login', {
    schema: loginSchema,
    handler: AuthController.login,
  });

  fastify.post('/refresh', {
    schema: refreshTokenSchema,
    handler: AuthController.refreshToken,
  });

  fastify.get('/me', {
    preHandler: [authMiddleware],
    handler: AuthController.me,
  });
}

