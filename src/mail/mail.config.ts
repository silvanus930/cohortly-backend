import { registerAs } from '@nestjs/config';
import { parseBoolean, parseInteger } from '../config/parsers';

export const MAIL_TRANSPORTS = ['smtp', 'memory', 'log'] as const;
export type MailTransport = (typeof MAIL_TRANSPORTS)[number];

export const mailConfig = registerAs('mail', () => ({
  transport: (process.env.MAIL_TRANSPORT ?? 'log') as MailTransport,
  from: process.env.MAIL_FROM ?? 'Cohortly <no-reply@cohortly.local>',
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInteger(process.env.SMTP_PORT, 587),
    secure: parseBoolean(process.env.SMTP_SECURE),
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
  },
}));
