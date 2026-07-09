import { type NestExpressApplication } from '@nestjs/platform-express';
import { MailService } from '../src/mail/mail.service';
import { api, bearer, uniqueEmail } from './utils/auth';
import { createTestApp, resetDatabase } from './utils/test-app';

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('seeds the superadmin from the environment on boot', async () => {
    const response = await api(app)
      .post('/api/v1/auth/login')
      .send({ email: 'root@cohortly.test', password: 'RootPassw0rd' })
      .expect(200);

    expect(response.body.data.user.role).toBe('SUPERADMIN');
  });

  describe('registration and login', () => {
    const email = uniqueEmail('ada');
    const password = 'Correct-horse-9';

    beforeAll(() => resetDatabase(app));

    it('registers a learner and returns tokens', async () => {
      const response = await api(app)
        .post('/api/v1/auth/register')
        .send({ email, password, firstName: 'Ada', lastName: 'Lovelace' })
        .expect(201);

      expect(response.body.data.user).toMatchObject({
        email,
        role: 'LEARNER',
        fullName: 'Ada Lovelace',
      });
      expect(response.body.data.user).not.toHaveProperty('passwordHash');
      expect(response.body.data.tokens.accessToken).toEqual(expect.any(String));
      expect(app.get(MailService).outbox.some((mail) => mail.to === email)).toBe(true);
    });

    it('rejects duplicate emails and weak passwords', async () => {
      await api(app)
        .post('/api/v1/auth/register')
        .send({ email, password, firstName: 'Ada', lastName: 'Lovelace' })
        .expect(409);
      await api(app)
        .post('/api/v1/auth/register')
        .send({ email: uniqueEmail(), password: 'lettersonly', firstName: 'A', lastName: 'B' })
        .expect(400);
    });

    it('rejects unknown fields through the validation pipe', async () => {
      await api(app)
        .post('/api/v1/auth/login')
        .send({ email, password, role: 'SUPERADMIN' })
        .expect(400);
    });

    it('logs in, reads and updates the profile', async () => {
      const login = await api(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
      const { accessToken } = login.body.data.tokens as { accessToken: string };

      await api(app).get('/api/v1/auth/me').expect(401);
      const me = await api(app).get('/api/v1/auth/me').set(bearer(accessToken)).expect(200);
      expect(me.body.data.email).toBe(email);

      const updated = await api(app)
        .patch('/api/v1/auth/me')
        .set(bearer(accessToken))
        .send({ firstName: 'Augusta' })
        .expect(200);
      expect(updated.body.data.fullName).toBe('Augusta Lovelace');
    });

    it('rejects a wrong password with a 401', async () => {
      await api(app).post('/api/v1/auth/login').send({ email, password: 'nope-1234' }).expect(401);
    });
  });

  describe('refresh token rotation', () => {
    const email = uniqueEmail('rotate');
    const password = 'Rotate-me-42';
    let refreshToken: string;

    beforeAll(async () => {
      const response = await api(app)
        .post('/api/v1/auth/register')
        .send({ email, password, firstName: 'Ro', lastName: 'Tate' })
        .expect(201);
      refreshToken = response.body.data.tokens.refreshToken as string;
    });

    it('issues a new pair and revokes the presented token', async () => {
      const first = await api(app).post('/api/v1/auth/refresh').send({ refreshToken }).expect(200);
      const rotated = first.body.data.tokens.refreshToken as string;
      expect(rotated).not.toBe(refreshToken);

      await api(app).post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
      await api(app).post('/api/v1/auth/refresh').send({ refreshToken: rotated }).expect(401);
    });

    it('logout revokes the token so it cannot be refreshed', async () => {
      const login = await api(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
      const token = login.body.data.tokens.refreshToken as string;

      await api(app).post('/api/v1/auth/logout').send({ refreshToken: token }).expect(204);
      await api(app).post('/api/v1/auth/refresh').send({ refreshToken: token }).expect(401);
    });
  });

  describe('password recovery', () => {
    const email = uniqueEmail('reset');
    const password = 'Forgot-me-77';

    beforeAll(async () => {
      await api(app)
        .post('/api/v1/auth/register')
        .send({ email, password, firstName: 'Re', lastName: 'Set' })
        .expect(201);
    });

    it('emails a code that resets the password once', async () => {
      await api(app).post('/api/v1/auth/forgot-password').send({ email }).expect(202);
      const mail = [...app.get(MailService).outbox].reverse().find((m) => m.to === email);
      const code = /([0-9]{6})/.exec(mail?.text ?? '')?.[1];
      expect(code).toBeDefined();

      await api(app)
        .post('/api/v1/auth/reset-password')
        .send({ email, code, newPassword: 'Brand-new-88' })
        .expect(204);
      await api(app)
        .post('/api/v1/auth/reset-password')
        .send({ email, code, newPassword: 'Another-one-9' })
        .expect(400);

      await api(app).post('/api/v1/auth/login').send({ email, password }).expect(401);
      await api(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'Brand-new-88' })
        .expect(200);
    });

    it('accepts unknown emails without leaking their absence', async () => {
      await api(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: uniqueEmail('ghost') })
        .expect(202);
    });

    it('changes the password for a signed in user', async () => {
      const login = await api(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'Brand-new-88' });
      const { accessToken } = login.body.data.tokens as { accessToken: string };

      await api(app)
        .post('/api/v1/auth/change-password')
        .set(bearer(accessToken))
        .send({ currentPassword: 'wrong-pass-1', newPassword: 'Changed-99' })
        .expect(401);
      await api(app)
        .post('/api/v1/auth/change-password')
        .set(bearer(accessToken))
        .send({ currentPassword: 'Brand-new-88', newPassword: 'Changed-99' })
        .expect(204);
      await api(app).post('/api/v1/auth/login').send({ email, password: 'Changed-99' }).expect(200);
    });
  });
});
