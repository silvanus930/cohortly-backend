import { type INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

export const GLOBAL_PREFIX = 'api/v1';

export interface AppSetupOptions {
  corsOrigins?: string[];
}

/**
 * Applies the middleware, pipes and prefix shared by the production
 * bootstrap and the e2e test harness so both exercise the same pipeline.
 */
export function configureApp(app: INestApplication, options: AppSetupOptions = {}): void {
  const origins = options.corsOrigins ?? ['*'];

  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.use(helmet());
  app.enableCors({
    origin: origins.includes('*') ? true : origins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
}
