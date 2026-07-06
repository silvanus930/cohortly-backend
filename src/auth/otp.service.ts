import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomInt } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { authConfig } from './auth.config';
import { OneTimeCode, type OneTimeCodePurpose } from './entities/one-time-code.entity';

export interface IssuedCode {
  code: string;
  expiresAt: Date;
}

@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(OneTimeCode) private readonly codes: Repository<OneTimeCode>,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  /** Issues a fresh code and invalidates any outstanding codes for the same purpose. */
  async issue(userId: string, purpose: OneTimeCodePurpose): Promise<IssuedCode> {
    await this.codes.update({ userId, purpose, consumedAt: IsNull() }, { consumedAt: new Date() });

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + this.config.otpTtlMinutes * 60_000);
    await this.codes.save(
      this.codes.create({
        userId,
        purpose,
        codeHash: this.hashCode(code),
        attempts: 0,
        expiresAt,
        consumedAt: null,
      }),
    );
    return { code, expiresAt };
  }

  /**
   * Validates a submitted code against the latest outstanding one. Failed
   * attempts are counted so a code cannot be brute forced.
   */
  async verifyAndConsume(userId: string, purpose: OneTimeCodePurpose, code: string): Promise<void> {
    const record = await this.codes.findOne({
      where: { userId, purpose, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (!record || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('The code has expired or was never issued');
    }
    if (record.attempts >= this.config.otpMaxAttempts) {
      throw new BadRequestException('Too many attempts, request a new code');
    }
    if (record.codeHash !== this.hashCode(code)) {
      await this.codes.increment({ id: record.id }, 'attempts', 1);
      throw new BadRequestException('The code is not valid');
    }
    await this.codes.update({ id: record.id }, { consumedAt: new Date() });
  }
}
