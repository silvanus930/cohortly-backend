import 'reflect-metadata';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { parseBoolean } from '../config/parsers';

loadEnv();

/**
 * Data source used by the TypeORM CLI for generating and running migrations.
 * The runtime connection is configured separately in DatabaseModule so that
 * it can be driven by the validated application config.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  return {
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl: parseBoolean(process.env.DATABASE_SSL) ? { rejectUnauthorized: false } : false,
    logging: parseBoolean(process.env.DATABASE_LOGGING),
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'migrations',
    synchronize: false,
    installExtensions: false,
  };
}

export const AppDataSource = new DataSource(buildDataSourceOptions());

export default AppDataSource;
