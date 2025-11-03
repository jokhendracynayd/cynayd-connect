import dotenv from 'dotenv';
import developmentConfig from './development';
import productionConfig from './production';
import defaultConfig from './default';

dotenv.config();

const env = process.env.NODE_ENV || 'development';

const baseConfig = {
  env,
  port: parseInt(process.env.PORT || '3000', 10),
  signalingPort: parseInt(process.env.SIGNALING_PORT || '4000', 10),
  
  database: {
    url: process.env.DATABASE_URL!,
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },
  
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    timeWindow: process.env.RATE_LIMIT_TIME_WINDOW || '15 minutes',
  },
  
  bcrypt: {
    saltRounds: 10,
  },
  
  mediasoup: {
    rtcMinPort: parseInt(process.env.MEDIASOUP_RTC_MIN_PORT || '2000', 10),
    rtcMaxPort: parseInt(process.env.MEDIASOUP_RTC_MAX_PORT || '2420', 10),
    logLevel: 'warn' as const,
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'] as const,
  },
};

// Environment-specific overrides
const envConfig = env === 'production' 
  ? productionConfig
  : env === 'development'
  ? developmentConfig
  : defaultConfig;

export const config = { ...baseConfig, ...envConfig };

