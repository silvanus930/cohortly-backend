import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CertificatesService } from '../src/certificates/certificates.service';

/**
 * Re-renders certificates with the current SVG template.
 *
 *   npm run certificates:reissue            # every certificate
 *   npm run certificates:reissue -- <courseId>
 */
async function main(): Promise<void> {
  const courseId = process.argv[2];
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const service = app.get(CertificatesService);
    const result = await service.reissueAll(courseId);
    console.log(
      `Reissued ${result.reissued} certificate(s)${courseId ? ` for course ${courseId}` : ''}` +
        (result.failed > 0 ? `, ${result.failed} failed` : ''),
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
