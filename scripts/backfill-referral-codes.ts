import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ReferralsService } from '../src/referrals/referrals.service';

/** Assigns referral codes to every account that does not have one yet. */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const assigned = await app.get(ReferralsService).backfillCodes();
    console.log(`Assigned referral codes to ${assigned} user(s)`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
