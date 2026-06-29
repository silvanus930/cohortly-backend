import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configurationFactories } from './configuration';
import { envValidationSchema } from './env.validation';

function envFilePaths(): string[] {
  const env = process.env.NODE_ENV ?? 'development';
  return [`.env.${env}`, '.env'];
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: envFilePaths(),
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false, allowUnknown: true },
      load: configurationFactories,
    }),
  ],
})
export class AppConfigModule {}
