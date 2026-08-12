import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { type UploadKind } from './dto/presign-upload.dto';
import { storageConfig } from './storage.config';

export interface PresignRequest {
  kind: UploadKind;
  folder: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresInSeconds: number;
}

const MB = 1024 * 1024;

/** Accepted content types and hard size caps per upload kind. */
export const UPLOAD_RULES: Record<UploadKind, { mimeTypes: readonly string[]; maxBytes: number }> =
  {
    image: {
      mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
      maxBytes: 10 * MB,
    },
    document: {
      mimeTypes: [
        'application/pdf',
        'application/zip',
        'text/plain',
        'text/markdown',
        'text/csv',
        'application/json',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      maxBytes: 50 * MB,
    },
    video: {
      mimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
      maxBytes: 2048 * MB,
    },
  };

/**
 * Talks to any S3 compatible object store. Files never pass through the API:
 * clients receive a short lived presigned PUT url and upload directly.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;

  constructor(
    @Inject(storageConfig.KEY) private readonly config: ConfigType<typeof storageConfig>,
  ) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint || undefined,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId || 'unconfigured',
        secretAccessKey: config.secretAccessKey || 'unconfigured',
      },
    });
  }

  get isConfigured(): boolean {
    return Boolean(this.config.bucket && this.config.accessKeyId && this.config.secretAccessKey);
  }

  validate(request: Pick<PresignRequest, 'kind' | 'mimeType' | 'sizeBytes'>): void {
    const rules = UPLOAD_RULES[request.kind];
    const mimeType = request.mimeType.toLowerCase();
    if (!rules.mimeTypes.includes(mimeType)) {
      throw new BadRequestException(`${request.mimeType} is not an accepted ${request.kind} type`);
    }
    const limit = Math.min(rules.maxBytes, this.config.maxUploadMb * MB);
    if (request.sizeBytes <= 0 || request.sizeBytes > limit) {
      throw new BadRequestException(
        `${request.kind} uploads must be between 1 byte and ${Math.floor(limit / MB)} MB`,
      );
    }
  }

  /** Keys are namespaced by folder and month, with a uuid to avoid collisions. */
  buildKey(folder: string, fileName: string): string {
    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const extension = extname(fileName).toLowerCase().slice(0, 10);
    const base = fileName
      .slice(0, fileName.length - extname(fileName).length)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    const cleanFolder = folder.replace(/^\/+|\/+$/g, '');
    return `${cleanFolder}/${now.getUTCFullYear()}/${month}/${randomUUID()}-${base || 'file'}${extension}`;
  }

  publicUrl(key: string): string {
    if (this.config.publicUrl) {
      return `${this.config.publicUrl.replace(/\/+$/, '')}/${key}`;
    }
    if (this.config.endpoint) {
      return `${this.config.endpoint.replace(/\/+$/, '')}/${this.config.bucket}/${key}`;
    }
    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${key}`;
  }

  async createPresignedUpload(request: PresignRequest): Promise<PresignedUpload> {
    this.validate(request);
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('File storage is not configured');
    }
    const key = this.buildKey(request.folder, request.fileName);
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: request.mimeType,
      ContentLength: request.sizeBytes,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.config.presignTtlSeconds,
    });
    return {
      key,
      uploadUrl,
      publicUrl: this.publicUrl(key),
      method: 'PUT',
      headers: { 'Content-Type': request.mimeType },
      expiresInSeconds: this.config.presignTtlSeconds,
    };
  }

  /** Uploads a small server generated object such as a rendered certificate. */
  async putObject(key: string, body: string | Buffer, contentType: string): Promise<string | null> {
    if (!this.isConfigured) {
      return null;
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return this.publicUrl(key);
  }

  /** Best effort removal; a missing object or outage must not fail the caller. */
  async deleteObject(key: string): Promise<boolean> {
    if (!this.isConfigured) {
      return false;
    }
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return true;
    } catch (error) {
      this.logger.warn(`Could not delete ${key}: ${String(error)}`);
      return false;
    }
  }
}
