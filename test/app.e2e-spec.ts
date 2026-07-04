import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './utils/test-app';

describe('Application (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health reports the database as up inside the envelope', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: { status: 'ok', checks: { database: 'up' } },
    });
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('echoes a supplied request id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'trace-42')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('trace-42');
  });

  it('serialises unknown routes through the error filter', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      path: '/api/v1/does-not-exist',
    });
    expect(typeof response.body.timestamp).toBe('string');
  });
});
