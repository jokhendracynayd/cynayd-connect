import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import path from 'path';
import developmentConfig from './development';
import productionConfig from './production';
import defaultConfig from './default';

dotenv.config();

const env = process.env.NODE_ENV || 'development';

// Generate unique server instance ID (useful for horizontal scaling)
// In production, this could be set via env var or Kubernetes pod name
const serverInstanceId = process.env.SERVER_INSTANCE_ID || 
  `server-${randomUUID().substring(0, 8)}`;

const baseConfig = {
  env,
  server: {
    instanceId: serverInstanceId,
  },
  port: parseInt(process.env.PORT || '3000', 10),
  signalingPort: parseInt(process.env.SIGNALING_PORT || '4000', 10),
  
  database: {
    url: process.env.DATABASE_URL!,
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    // Redis Cluster configuration (comma-separated list of host:port)
    cluster: process.env.REDIS_CLUSTER_ENABLED === 'true',
    clusterNodes: process.env.REDIS_CLUSTER_NODES
      ? process.env.REDIS_CLUSTER_NODES.split(',').map((node) => {
          const [host, port] = node.trim().split(':');
          return { host, port: parseInt(port, 10) };
        })
      : undefined,
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },
  
  cors: {
    // Support multiple origins for development (comma-separated)
    // Example: CORS_ORIGIN=http://localhost:5173,http://192.168.1.100:5173
    origin: process.env.CORS_ORIGIN
      ? (process.env.CORS_ORIGIN.includes(',')
          ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
          : [process.env.CORS_ORIGIN.trim()])
      : ['http://localhost:5173', 'http://172.29.208.1:5173'],
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
    // Expanded port range for scale: 420 ports per worker
    // Default: 2000-2420 (421 ports) for single server
    // For scale: Consider expanding to 2000-2999 (1000 ports) or more
    // Each WebRTC connection needs 2 ports (RTP + RTCP), so 421 ports = ~210 concurrent connections per worker
    rtcMinPort: parseInt(process.env.MEDIASOUP_RTC_MIN_PORT || '2000', 10),
    rtcMaxPort: parseInt(process.env.MEDIASOUP_RTC_MAX_PORT || '2420', 10),
    logLevel: (process.env.MEDIASOUP_LOG_LEVEL || 'warn') as 'debug' | 'warn' | 'error' | 'none',
    logTags: (process.env.MEDIASOUP_LOG_TAGS
      ? process.env.MEDIASOUP_LOG_TAGS.split(',')
      : ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp']) as any[],
  },

  recording: {
    enabled: process.env.RECORDING_ENABLED === 'true',
    tmpDir: process.env.RECORDING_TMP_DIR
      ? path.resolve(process.cwd(), process.env.RECORDING_TMP_DIR)
      : path.resolve(process.cwd(), 'tmp/recordings'),
    ffmpegPath: process.env.RECORDING_FFMPEG_PATH || 'ffmpeg',
    layout: process.env.RECORDING_LAYOUT || 'pip',
    network: {
      ip: process.env.RECORDING_BIND_IP || '127.0.0.1',
      portRange: {
        min: parseInt(process.env.RECORDING_PORT_MIN || '60000', 10),
        max: parseInt(process.env.RECORDING_PORT_MAX || '60200', 10),
      },
    },
    s3: {
      region: process.env.AWS_REGION || 'us-east-1',
      bucket: process.env.RECORDING_S3_BUCKET || '',
      prefix: (() => {
        const raw = process.env.RECORDING_S3_PREFIX || 'recordings/';
        return raw.endsWith('/') ? raw : `${raw}/`;
      })(),
      serverSideEncryption: process.env.RECORDING_S3_SSE || 'aws:kms',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    },
  },
};

// Environment-specific overrides
const envConfig = env === 'production' 
  ? productionConfig
  : env === 'development'
  ? developmentConfig
  : defaultConfig;

export const config = { ...baseConfig, ...envConfig };

