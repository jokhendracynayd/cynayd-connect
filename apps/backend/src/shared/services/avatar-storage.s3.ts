import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  type PutObjectCommandInput,
  type ServerSideEncryption,
} from '@aws-sdk/client-s3';
import { config } from '../config';
import { logger } from '../utils/logger';

interface UploadAvatarParams {
  buffer: Buffer;
  userId: string;
  bucket?: string;
  objectKey?: string;
  metadata?: Record<string, string>;
  tags?: Record<string, string>;
}

interface AvatarUploadResult {
  bucket: string;
  key: string;
  url: string;
  eTag?: string;
  sizeBytes: number;
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (s3Client) {
    return s3Client;
  }

  const {
    avatar: {
      storage: { region, credentials },
    },
  } = config;

  const resolvedCredentials =
    credentials?.accessKeyId && credentials?.secretAccessKey
      ? {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
        }
      : undefined;

  s3Client = new S3Client({
    region,
    credentials: resolvedCredentials,
    // AWS SDK v3 uses Signature Version 4 by default
    // Additional configuration for KMS if needed
    forcePathStyle: false,
  });

  return s3Client;
}

function buildTaggingString(tags?: Record<string, string>): string | undefined {
  if (!tags || Object.keys(tags).length === 0) {
    return undefined;
  }

  return Object.entries(tags)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function buildS3Url(bucket: string, key: string, region: string): string {
  // Construct S3 URL: https://bucket-name.s3.region.amazonaws.com/key
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export class AvatarStorageService {
  /**
   * Upload avatar buffer to S3
   * @param params Upload parameters
   * @returns Upload result with S3 URL
   */
  static async uploadAvatar(params: UploadAvatarParams): Promise<AvatarUploadResult> {
    const bucket = params.bucket ?? config.avatar.storage.bucket;
    if (!bucket) {
      throw new Error('Avatar S3 bucket is not configured (AVATAR_S3_BUCKET).');
    }

    const region = config.avatar.storage.region;
    const prefix = config.avatar.storage.prefix;
    
    // Generate object key: avatars/{userId}.webp
    const objectKey = params.objectKey ?? `${prefix}${params.userId}.webp`;

    const uploadInput: PutObjectCommandInput = {
      Bucket: bucket,
      Key: objectKey,
      Body: params.buffer,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable', // Cache for 1 year
      Metadata: {
        ...params.metadata,
        'generated-at': new Date().toISOString(),
        'user-id': params.userId,
      },
    };

    // For avatars (public files), use AES256 instead of KMS if encryption is needed
    // KMS requires authenticated requests even for public objects, which breaks direct browser access
    if (config.avatar.storage.serverSideEncryption) {
      // If KMS is specified, use AES256 instead for public access
      const encryptionType = config.avatar.storage.serverSideEncryption === 'aws:kms' 
        ? 'AES256' 
        : config.avatar.storage.serverSideEncryption;
      
      uploadInput.ServerSideEncryption = encryptionType as ServerSideEncryption;
      
      // If using KMS, log a warning
      if (config.avatar.storage.serverSideEncryption === 'aws:kms') {
        logger.warn('KMS encryption specified for avatars, using AES256 instead for public access compatibility');
      }
    }

    const tagging = buildTaggingString(params.tags);
    if (tagging) {
      uploadInput.Tagging = tagging;
    }

    const client = getS3Client();
    
    try {
      const command = new PutObjectCommand(uploadInput);
      const result = await client.send(command);

      const url = buildS3Url(bucket, objectKey, region);

      logger.info('Avatar uploaded to S3 successfully', {
        bucket,
        key: objectKey,
        userId: params.userId,
        eTag: result.ETag,
        sizeBytes: params.buffer.length,
        url,
      });

      return {
        bucket,
        key: objectKey,
        url,
        eTag: result.ETag,
        sizeBytes: params.buffer.length,
      };
    } catch (error) {
      logger.error('Failed to upload avatar to S3', {
        bucket,
        key: objectKey,
        userId: params.userId,
        error,
      });
      throw new Error(`Avatar upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete avatar from S3
   * @param bucket S3 bucket name
   * @param key Object key
   */
  static async deleteAvatar(bucket: string, key: string): Promise<void> {
    const client = getS3Client();
    
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );
      
      logger.info('Avatar deleted from S3', {
        bucket,
        key,
      });
    } catch (error) {
      logger.error('Failed to delete avatar from S3', {
        bucket,
        key,
        error,
      });
      throw new Error(`Avatar deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if avatar exists in S3
   * @param bucket S3 bucket name
   * @param key Object key
   * @returns true if avatar exists, false otherwise
   */
  static async avatarExists(bucket: string, key: string): Promise<boolean> {
    const client = getS3Client();
    
    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }
}

export default AvatarStorageService;

