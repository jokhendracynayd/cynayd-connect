import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError } from '../utils/errors';

interface TokenPayload {
  userId: string;
  type: 'access' | 'refresh';
}

export class TokenService {
  static async generateAuthTokens(userId: string) {
    const accessToken = jwt.sign(
      { userId, type: 'access' } as TokenPayload,
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as any
    );

    const refreshToken = jwt.sign(
      { userId, type: 'refresh' } as TokenPayload,
      config.jwt.secret,
      { expiresIn: config.jwt.refreshExpiresIn } as any
    );

    return { accessToken, refreshToken };
  }

  static async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as TokenPayload;
      
      if (decoded.type !== 'access') {
        throw new UnauthorizedError('Invalid token type');
      }

      return decoded;
    } catch (error) {
      throw new UnauthorizedError('Invalid or expired token');
    }
  }

  static async verifyRefreshToken(token: string): Promise<TokenPayload> {
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as TokenPayload;
      
      if (decoded.type !== 'refresh') {
        throw new UnauthorizedError('Invalid token type');
      }

      return decoded;
    } catch (error) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }
}

