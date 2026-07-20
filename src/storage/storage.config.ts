import { registerAs } from '@nestjs/config';
import { parseBoolean, parseInteger } from '../config/parsers';

export const storageConfig = registerAs('storage', () => ({
  endpoint: process.env.STORAGE_ENDPOINT ?? '',
  region: process.env.STORAGE_REGION ?? 'us-east-1',
  bucket: process.env.STORAGE_BUCKET ?? '',
  accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? '',
  secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? '',
  publicUrl: process.env.STORAGE_PUBLIC_URL ?? '',
  forcePathStyle: parseBoolean(process.env.STORAGE_FORCE_PATH_STYLE, true),
  presignTtlSeconds: parseInteger(process.env.STORAGE_PRESIGN_TTL_SECONDS, 900),
  maxUploadMb: parseInteger(process.env.STORAGE_MAX_UPLOAD_MB, 500),
}));
