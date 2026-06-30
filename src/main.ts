import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp, GLOBAL_PREFIX } from './app.setup';
import { appConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const logger = new Logger('Bootstrap');
  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

  configureApp(app, { corsOrigins: config.corsOrigins });

  const swaggerConfig = new DocumentBuilder()
    .setTitle(`${config.name} API`)
    .setDescription('Cohort-based bootcamp platform')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  app.enableShutdownHooks();
  await app.listen(config.port);
  logger.log(`Listening on http://localhost:${config.port}/${GLOBAL_PREFIX}`);
}

void bootstrap();
