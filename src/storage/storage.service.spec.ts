import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StorageController } from './storage.controller';
import { storageConfig } from './storage.config';
import { StorageService } from './storage.service';

const send = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send })),
  PutObjectCommand: jest.fn().mockImplementation((input: object) => ({ input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input: object) => ({ input })),
}));
const getSignedUrl = jest.fn();
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]): unknown => getSignedUrl(...args),
}));

async function build(overrides: Record<string, unknown> = {}): Promise<StorageService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StorageService,
      {
        provide: storageConfig.KEY,
        useValue: {
          endpoint: 'https://minio.local:9000',
          region: 'us-east-1',
          bucket: 'cohortly',
          accessKeyId: 'key',
          secretAccessKey: 'secret',
          publicUrl: '',
          forcePathStyle: true,
          presignTtlSeconds: 600,
          maxUploadMb: 20,
          ...overrides,
        },
      },
    ],
  }).compile();
  return moduleRef.get(StorageService);
}

describe('StorageService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('accepts allowed types within the size limit', async () => {
    const service = await build();

    expect(() =>
      service.validate({ kind: 'image', mimeType: 'image/PNG', sizeBytes: 1024 }),
    ).not.toThrow();
  });

  it('rejects unknown mime types and oversized files', async () => {
    const service = await build();

    expect(() =>
      service.validate({ kind: 'image', mimeType: 'application/x-msdownload', sizeBytes: 10 }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.validate({
        kind: 'document',
        mimeType: 'application/pdf',
        sizeBytes: 21 * 1024 * 1024,
      }),
    ).toThrow(/20 MB/);
  });

  it('builds namespaced keys with a safe file name', async () => {
    const service = await build();

    const key = service.buildKey('/courses/abc/', 'My Syllabus (final).PDF');

    expect(key).toMatch(/^courses\/abc\/[0-9]{4}\/[0-9]{2}\/[0-9a-f-]{36}-my-syllabus-final\.pdf$/);
  });

  it('derives public urls from the public base, endpoint or aws host', async () => {
    const withPublic = await build({ publicUrl: 'https://cdn.cohortly.dev/' });
    expect(withPublic.publicUrl('a/b.png')).toBe('https://cdn.cohortly.dev/a/b.png');

    const withEndpoint = await build();
    expect(withEndpoint.publicUrl('a/b.png')).toBe('https://minio.local:9000/cohortly/a/b.png');

    const aws = await build({ endpoint: '' });
    expect(aws.publicUrl('a/b.png')).toBe('https://cohortly.s3.us-east-1.amazonaws.com/a/b.png');
  });

  it('creates a presigned PUT with content headers', async () => {
    getSignedUrl.mockResolvedValue('https://signed.example/put');
    const service = await build();

    const upload = await service.createPresignedUpload({
      kind: 'document',
      folder: 'materials/l1',
      fileName: 'notes.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
    });

    expect(upload).toMatchObject({
      uploadUrl: 'https://signed.example/put',
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      expiresInSeconds: 600,
    });
    expect(upload.publicUrl).toContain(upload.key);
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        input: expect.objectContaining({ Bucket: 'cohortly', ContentType: 'application/pdf' }),
      }),
      { expiresIn: 600 },
    );
  });

  it('refuses to presign when credentials are missing', async () => {
    const service = await build({ accessKeyId: '' });

    await expect(
      service.createPresignedUpload({
        kind: 'image',
        folder: 'x',
        fileName: 'a.png',
        mimeType: 'image/png',
        sizeBytes: 10,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('deletes objects best effort', async () => {
    const service = await build();
    send.mockResolvedValueOnce({});
    await expect(service.deleteObject('a/b.png')).resolves.toBe(true);

    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    send.mockRejectedValueOnce(new Error('offline'));
    await expect(service.deleteObject('a/b.png')).resolves.toBe(false);
  });
});

describe('StorageController', () => {
  it('scopes personal uploads under the user folder', async () => {
    const storageService = { createPresignedUpload: jest.fn().mockResolvedValue({ key: 'k' }) };
    const moduleRef = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [{ provide: StorageService, useValue: storageService }],
    }).compile();
    const controller = moduleRef.get(StorageController);

    await controller.presign('u1', {
      kind: 'image',
      fileName: 'me.png',
      mimeType: 'image/png',
      sizeBytes: 5,
    });

    expect(storageService.createPresignedUpload).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'uploads/u1', fileName: 'me.png' }),
    );
  });
});

describe('StorageService.putObject', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uploads server generated objects and returns the public url', async () => {
    const service = await build();
    send.mockResolvedValueOnce({});

    const url = await service.putObject('certificates/x.svg', '<svg/>', 'image/svg+xml');

    expect(url).toBe('https://minio.local:9000/cohortly/certificates/x.svg');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ Key: 'certificates/x.svg', ContentType: 'image/svg+xml' }),
      }),
    );
  });

  it('returns null without calling the store when unconfigured', async () => {
    const service = await build({ bucket: '' });

    await expect(service.putObject('k', 'body', 'text/plain')).resolves.toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});
