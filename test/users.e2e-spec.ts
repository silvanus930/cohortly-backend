import { type NestExpressApplication } from '@nestjs/platform-express';
import { UserRole, UserStatus } from '../src/common/enums/user-role.enum';
import { api, bearer, createUserSession, type TestSession } from './utils/auth';
import { createTestApp, resetDatabase } from './utils/test-app';

describe('Users admin (e2e)', () => {
  let app: NestExpressApplication;
  let admin: TestSession;
  let superadmin: TestSession;
  let learner: TestSession;
  let instructor: TestSession;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    admin = await createUserSession(app, {
      role: UserRole.ADMIN,
      firstName: 'Ann',
      lastName: 'Admin',
    });
    superadmin = await createUserSession(app, { role: UserRole.SUPERADMIN });
    learner = await createUserSession(app, { firstName: 'Lena', lastName: 'Learner' });
    instructor = await createUserSession(app, { role: UserRole.INSTRUCTOR, firstName: 'Ivo' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('hides the admin surface from learners', async () => {
    await api(app).get('/api/v1/users').set(bearer(learner.accessToken)).expect(403);
    await api(app).get('/api/v1/users').expect(401);
  });

  it('lists users with pagination metadata', async () => {
    const response = await api(app)
      .get('/api/v1/users?limit=2&page=1')
      .set(bearer(admin.accessToken))
      .expect(200);

    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta).toMatchObject({ page: 1, limit: 2, total: 4, totalPages: 2 });
    expect(response.body.data[0]).not.toHaveProperty('passwordHash');
  });

  it('filters by role and searches by name', async () => {
    const byRole = await api(app)
      .get(`/api/v1/users?role=${UserRole.INSTRUCTOR}`)
      .set(bearer(admin.accessToken))
      .expect(200);
    expect((byRole.body.data as { id: string }[]).map((u) => u.id)).toEqual([instructor.user.id]);

    const bySearch = await api(app)
      .get('/api/v1/users?search=lena')
      .set(bearer(admin.accessToken))
      .expect(200);
    expect((bySearch.body.data as { id: string }[]).map((u) => u.id)).toEqual([learner.user.id]);
  });

  it('changes roles within the admin rules', async () => {
    const promoted = await api(app)
      .patch(`/api/v1/users/${learner.user.id}/role`)
      .set(bearer(admin.accessToken))
      .send({ role: UserRole.INSTRUCTOR })
      .expect(200);
    expect(promoted.body.data.role).toBe(UserRole.INSTRUCTOR);

    await api(app)
      .patch(`/api/v1/users/${learner.user.id}/role`)
      .set(bearer(admin.accessToken))
      .send({ role: UserRole.SUPERADMIN })
      .expect(403);

    await api(app)
      .patch(`/api/v1/users/${learner.user.id}/role`)
      .set(bearer(superadmin.accessToken))
      .send({ role: UserRole.LEARNER })
      .expect(200);
  });

  it('suspends a user so they can no longer authenticate', async () => {
    await api(app).get('/api/v1/auth/me').set(bearer(instructor.accessToken)).expect(200);

    await api(app)
      .patch(`/api/v1/users/${instructor.user.id}/status`)
      .set(bearer(admin.accessToken))
      .send({ status: UserStatus.SUSPENDED })
      .expect(200);

    await api(app).get('/api/v1/auth/me').set(bearer(instructor.accessToken)).expect(401);
    await api(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: instructor.refreshToken })
      .expect(401);
  });

  it('reports headline analytics', async () => {
    const response = await api(app)
      .get('/api/v1/users/analytics/summary')
      .set(bearer(admin.accessToken))
      .expect(200);

    expect(response.body.data).toMatchObject({
      total: 4,
      byRole: expect.objectContaining({ ADMIN: 1, SUPERADMIN: 1 }) as unknown,
      byStatus: expect.objectContaining({ SUSPENDED: 1 }) as unknown,
    });
    expect(response.body.data.newLast7Days).toBeGreaterThanOrEqual(4);
  });
});
