import bcrypt from 'bcryptjs';
import prisma from '../database/prisma';
import { config } from '../config';
import { ConflictError, UnauthorizedError, ValidationError } from '../utils/errors';
import { TokenService } from './token.service';
import { AvatarService } from './avatar.service';
import { AvatarStorageService } from './avatar-storage.s3';
import { logger } from '../utils/logger';

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

    // Generate and upload avatar (graceful degradation if it fails)
    let avatarUrl: string | null = null;
    try {
      // Generate avatar image
      const avatarBuffer = await AvatarService.generateAvatar({
        name: data.name,
        email: data.email,
        size: 200,
      });

      // Upload to S3
      const uploadResult = await AvatarStorageService.uploadAvatar({
        buffer: avatarBuffer,
        userId: user.id,
        metadata: {
          'user-name': data.name,
          'user-email': data.email,
        },
        tags: {
          type: 'avatar',
          'generated-at': new Date().toISOString(),
        },
      });

      avatarUrl = uploadResult.url;

      // Update user record with avatar URL
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { picture: avatarUrl },
        select: {
          id: true,
          email: true,
          name: true,
          picture: true,
          createdAt: true,
        },
      });

      logger.info('Avatar generated and uploaded successfully', {
        userId: user.id,
        email: data.email,
        avatarUrl,
      });

      // Generate tokens with updated user data
      const tokens = await TokenService.generateAuthTokens(updatedUser.id);

      return { user: updatedUser, tokens };
    } catch (error) {
      // Log error but continue with registration (graceful degradation)
      logger.warn('Failed to generate or upload avatar, continuing without avatar', {
        userId: user.id,
        email: data.email,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Generate tokens with user data (picture will be null)
      const tokens = await TokenService.generateAuthTokens(user.id);

      return { user, tokens };
    }
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

