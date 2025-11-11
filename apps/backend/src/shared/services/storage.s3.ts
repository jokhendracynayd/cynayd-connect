import {
  S3Client,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';

interface UploadRecordingParams {
  localPath: string;
  sessionId: string;
  bucket?: string;
  objectKey?: string;
  contentType?: string;
  metadata?: Record<string, string>;
  tags?: Record<string, string>;
}

interface GenerateUrlParams {
  bucket?: string;
  objectKey: string;
  expiresInSeconds?: number;
}

interface RecordingUploadResult {
  bucket: string;
  key: string;
  eTag?: string;
  sizeBytes?: number;
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (s3Client) {
    return s3Client;
  }

  const {
    s3: { region, credentials },
  } = config.recording;

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

export class RecordingStorageService {
  static async uploadCompositeRecording(params: UploadRecordingParams): Promise<RecordingUploadResult> {
    const bucket = params.bucket ?? config.recording.s3.bucket;
    if (!bucket) {
      throw new Error('Recording S3 bucket is not configured (RECORDING_S3_BUCKET).');
    }

    const objectKey =
      params.objectKey ??
      `${config.recording.s3.prefix}${params.sessionId}/${path.basename(params.localPath)}`;

    const fileStats = await fs.stat(params.localPath);

    const uploadInput: PutObjectCommandInput = {
      Bucket: bucket,
      Key: objectKey,
      Body: createReadStream(params.localPath),
      ContentType: params.contentType ?? 'video/mp4',
      Metadata: params.metadata,
    };

    if (config.recording.s3.serverSideEncryption) {
      uploadInput.ServerSideEncryption = config.recording.s3.serverSideEncryption;
    }

    const tagging = buildTaggingString(params.tags);
    if (tagging) {
      uploadInput.Tagging = tagging;
    }

    const client = getS3Client();
    const upload = new Upload({
      client,
      params: uploadInput,
      queueSize: 4,
      partSize: 10 * 1024 * 1024, // 10 MB
      leavePartsOnError: false,
    });

    const result = await upload.done();

    try {
      await fs.unlink(params.localPath);
    } catch (error) {
      logger.warn('Failed to remove local recording artifact after upload', {
        path: params.localPath,
        error,
      });
    }

    logger.info('Uploaded recording artifact to S3', {
      bucket,
      key: objectKey,
      eTag: result.ETag,
      sizeBytes: fileStats.size,
    });

    return {
      bucket,
      key: objectKey,
      eTag: result.ETag,
      sizeBytes: fileStats.size,
    };
  }

  static async generatePlaybackUrl(params: GenerateUrlParams): Promise<string> {
    const bucket = params.bucket ?? config.recording.s3.bucket;
    if (!bucket) {
      throw new Error('Recording S3 bucket is not configured (RECORDING_S3_BUCKET).');
    }

    const client = getS3Client();
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: params.objectKey,
    });

    await client.send(command);

    const signedUrl = await getSignedUrl(client, new GetObjectCommand({
      Bucket: bucket,
      Key: params.objectKey,
    }), {
      expiresIn: params.expiresInSeconds ?? 3600,
    });

    return signedUrl;
  }

  static async deleteRecordingAsset(bucket: string, key: string): Promise<void> {
    const client = getS3Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
  }
}

export default RecordingStorageService;

