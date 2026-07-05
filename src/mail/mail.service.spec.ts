import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { appConfig } from '../config/configuration';
import { type User } from '../users/entities/user.entity';
import { mailConfig } from './mail.config';
import { MailService } from './mail.service';
import { passwordResetEmail, welcomeEmail } from './templates/account.templates';
import { escapeHtml } from './templates/layout';

const sendMail = jest.fn();
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail, close: jest.fn() })),
}));

async function build(transport: 'memory' | 'log' | 'smtp'): Promise<MailService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      MailService,
      {
        provide: mailConfig.KEY,
        useValue: {
          transport,
          from: 'Cohortly <no-reply@test.local>',
          smtp: { host: 'smtp.test', port: 587, secure: false, user: 'u', password: 'p' },
        },
      },
      { provide: appConfig.KEY, useValue: { name: 'Cohortly', url: 'http://app.test' } },
    ],
  }).compile();
  return moduleRef.get(MailService);
}

const user = { email: 'ada@example.com', firstName: 'Ada' } as User;

describe('MailService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('captures messages in the outbox with the memory transport', async () => {
    const service = await build('memory');

    await service.sendWelcome(user);

    expect(service.outbox).toHaveLength(1);
    expect(service.outbox[0]).toMatchObject({
      to: 'ada@example.com',
      subject: 'Welcome to Cohortly',
    });
    expect(service.outbox[0].text).toContain('http://app.test');
  });

  it('only logs with the log transport', async () => {
    const service = await build('log');
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await service.sendPasswordResetCode(user, '123456', 10);

    expect(log).toHaveBeenCalledWith(expect.stringContaining('password reset code'));
    expect(service.outbox).toHaveLength(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('delivers through nodemailer with the smtp transport', async () => {
    const service = await build('smtp');

    await service.sendPasswordResetCode(user, '654321', 5);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Cohortly <no-reply@test.local>',
        to: 'ada@example.com',
        subject: 'Cohortly password reset code',
      }),
    );
  });
});

describe('email templates', () => {
  it('renders the reset code in both html and text', () => {
    const email = passwordResetEmail('Cohortly', 'Ada', '482913', 10);

    expect(email.html).toContain('482913');
    expect(email.text).toContain('482913');
    expect(email.text).toContain('10 minutes');
  });

  it('escapes user supplied content in the welcome email', () => {
    const email = welcomeEmail('Cohortly', '<script>', 'http://app.test');

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('escapes the five html metacharacters', () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;',
    );
  });
});
