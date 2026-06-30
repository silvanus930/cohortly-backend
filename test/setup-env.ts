process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/cohortly_test';
process.env.DATABASE_LOGGING = 'false';
