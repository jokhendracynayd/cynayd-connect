import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../../shared/services/auth.service';
import prisma from '../../shared/database/prisma';

export class AuthController {
  static async register(request: FastifyRequest, reply: FastifyReply) {
    const { email, name, password } = request.body as any;
    
    const result = await AuthService.register({ email, name, password });
    
    return reply.code(201).send({
      success: true,
      user: result.user,
      token: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      message: 'User registered successfully',
    });
  }

  static async login(request: FastifyRequest, reply: FastifyReply) {
    const { email, password } = request.body as any;
    
    const result = await AuthService.login(email, password);
    
    return reply.code(200).send({
      success: true,
      user: result.user,
      token: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      message: 'Login successful',
    });
  }

  static async refreshToken(request: FastifyRequest, reply: FastifyReply) {
    const { refreshToken } = request.body as any;
    
    const tokens = await AuthService.refreshToken(refreshToken);
    
    return reply.code(200).send({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      message: 'Token refreshed successfully',
    });
  }

  static async me(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.userId;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        picture: true,
        createdAt: true,
      },
    });
    
    return reply.code(200).send({
      success: true,
      user: user,
    });
  }
}

