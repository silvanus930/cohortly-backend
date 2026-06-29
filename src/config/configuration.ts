import { registerAs } from '@nestjs/config';
import { type NodeEnv } from './env.validation';
import { parseBoolean, parseInteger, parseList } from './parsers';

export const appConfig = registerAs('app', () => ({
  env: (process.env.NODE_ENV ?? 'development') as NodeEnv,
  port: parseInteger(process.env.PORT, 3000),
  name: process.env.APP_NAME ?? 'Cohortly',
  url: process.env.APP_URL ?? 'http://localhost:3000',
  corsOrigins: parseList(process.env.CORS_ORIGINS, ['*']),
}));

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL ?? '',
  ssl: parseBoolean(process.env.DATABASE_SSL),
  logging: parseBoolean(process.env.DATABASE_LOGGING),
}));

export const configurationFactories = [appConfig, databaseConfig];
