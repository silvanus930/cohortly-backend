import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { appConfig } from '../config/configuration';
import { type User } from '../users/entities/user.entity';
import { mailConfig } from './mail.config';
import { passwordResetEmail, welcomeEmail } from './templates/account.templates';
import { type RenderedEmail } from './templates/layout';

export interface SentMail extends RenderedEmail {
  to: string;
  sentAt: Date;
}

/**
 * Thin wrapper over Nodemailer. The transport is chosen from configuration:
 * `smtp` for real delivery, `log` to print subjects during development and
 * `memory` to capture messages in `outbox` for tests.
 */
@Injectable()
export class MailService implements OnModuleDestroy {
  readonly outbox: SentMail[] = [];
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  constructor(
    @Inject(mailConfig.KEY) private readonly config: ConfigType<typeof mailConfig>,
    @Inject(appConfig.KEY) private readonly app: ConfigType<typeof appConfig>,
  ) {
    this.transporter =
      config.transport === 'smtp'
        ? createTransport({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: config.smtp.secure,
            auth: config.smtp.user
              ? { user: config.smtp.user, pass: config.smtp.password }
              : undefined,
          })
        : null;
  }

  onModuleDestroy(): void {
    this.transporter?.close();
  }

  async send(to: string, email: RenderedEmail): Promise<void> {
    switch (this.config.transport) {
      case 'memory':
        this.outbox.push({ ...email, to, sentAt: new Date() });
        return;
      case 'log':
        this.logger.log(`Email to ${to}: ${email.subject}`);
        return;
      case 'smtp':
        await this.transporter?.sendMail({
          from: this.config.from,
          to,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
        return;
    }
  }

  sendWelcome(user: User): Promise<void> {
    return this.send(user.email, welcomeEmail(this.app.name, user.firstName, this.app.url));
  }

  sendPasswordResetCode(user: User, code: string, ttlMinutes: number): Promise<void> {
    return this.send(
      user.email,
      passwordResetEmail(this.app.name, user.firstName, code, ttlMinutes),
    );
  }
}
