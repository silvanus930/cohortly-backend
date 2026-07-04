import { registerAs } from '@nestjs/config';
import { parseInteger } from '../config/parsers';

export const authConfig = registerAs('auth', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
  accessTtlSeconds: parseInteger(process.env.JWT_ACCESS_TTL_SECONDS, 900),
  refreshTtlDays: parseInteger(process.env.JWT_REFRESH_TTL_DAYS, 30),
  bcryptRounds: parseInteger(process.env.BCRYPT_ROUNDS, 12),
  otpTtlMinutes: parseInteger(process.env.OTP_TTL_MINUTES, 10),
  otpMaxAttempts: parseInteger(process.env.OTP_MAX_ATTEMPTS, 5),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  superadmin: {
    email: process.env.SUPERADMIN_EMAIL ?? '',
    password: process.env.SUPERADMIN_PASSWORD ?? '',
    firstName: process.env.SUPERADMIN_FIRST_NAME ?? 'Platform',
    lastName: process.env.SUPERADMIN_LAST_NAME ?? 'Owner',
  },
}));

export type AuthConfig = ReturnType<typeof authConfig>;
