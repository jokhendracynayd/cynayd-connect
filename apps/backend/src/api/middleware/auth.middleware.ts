import { FastifyRequest, FastifyReply } from 'fastify';
import { TokenService } from '../../shared/services/token.service';
import { UnauthorizedError } from '../../shared/utils/errors';

// Extend FastifyRequest type
declare module 'fastify' {
  interface FastifyRequest {
    user?: { userId: string };
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.split(' ')[1];
    const decoded = await TokenService.verifyAccessToken(token);

    request.user = { userId: decoded.userId };
  } catch (error) {
    throw error;
  }
}

