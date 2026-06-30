import { type INestApplication } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
  configureApp(app);
  await app.init();

  const dataSource = app.get(DataSource);
  await dataSource.runMigrations();
  return app;
}

/**
 * Empties every application table while keeping the migrations ledger so a
 * suite can start from a known state without re-running the schema.
 */
export async function resetDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  const tables = dataSource.entityMetadatas
    .map((metadata) => `"${metadata.tableName}"`)
    .filter((name) => name !== '"migrations"');
  if (tables.length === 0) {
    return;
  }
  await dataSource.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
}
