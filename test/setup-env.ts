process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/cohortly_test';
process.env.DATABASE_LOGGING = 'false';
process.env.THROTTLE_LIMIT = '100000';
process.env.JWT_ACCESS_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.BCRYPT_ROUNDS = '4';
process.env.MAIL_TRANSPORT = 'memory';
process.env.SUPERADMIN_EMAIL = 'root@cohortly.test';
process.env.SUPERADMIN_PASSWORD = 'RootPassw0rd';
process.env.GOOGLE_CLIENT_ID = '';
