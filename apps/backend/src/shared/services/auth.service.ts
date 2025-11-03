import bcrypt from 'bcrypt';
import prisma from '../database/prisma';
import { config } from '../config';
import { ConflictError, UnauthorizedError, ValidationError } from '../utils/errors';
import { TokenService } from './token.service';

export class AuthService {
  static async register(data: { email: string; name: string; password: string }) {
    // Validate input
    if (!data.email || !data.name || !data.password) {
      throw new ValidationError('Email, name, and password are required');
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, config.bcrypt.saltRounds);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        name: true,
        picture: true,
        createdAt: true,
      },
    });

    // Generate tokens
    const tokens = await TokenService.generateAuthTokens(user.id);

    return { user, tokens };
  }

  static async login(email: string, password: string) {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Generate tokens
    const tokens = await TokenService.generateAuthTokens(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
      },
      tokens,
    };
  }

  static async refreshToken(refreshToken: string) {
    const decoded = await TokenService.verifyRefreshToken(refreshToken);
    const tokens = await TokenService.generateAuthTokens(decoded.userId);
    return tokens;
  }
}

