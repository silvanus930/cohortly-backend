import { Module } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'node:path';
import { databaseConfig } from '../config/configuration';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: (database: ConfigType<typeof databaseConfig>): TypeOrmModuleOptions => ({
        type: 'postgres',
        url: database.url,
        ssl: database.ssl ? { rejectUnauthorized: false } : false,
        logging: database.logging,
        autoLoadEntities: true,
        synchronize: false,
        migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
        migrationsTableName: 'migrations',
        migrationsRun: false,
        installExtensions: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
