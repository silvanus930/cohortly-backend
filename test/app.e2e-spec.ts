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

  it('GET /api/v1/health reports the database as up', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body).toMatchObject({ status: 'ok', checks: { database: 'up' } });
  });

  it('rejects unknown routes with a 404', async () => {
    await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
  });
});
