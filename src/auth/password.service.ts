import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { compare, hash } from 'bcryptjs';
import { authConfig } from './auth.config';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

@Injectable()
export class PasswordService {
  constructor(@Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>) {}

  /**
   * Rejects passwords that are too short, too long or lack a mix of letters
   * and digits. Kept intentionally simple so it is easy to reason about.
   */
  assertStrong(password: string): void {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
      );
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      throw new BadRequestException(`Password must be at most ${MAX_PASSWORD_LENGTH} characters`);
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      throw new BadRequestException('Password must contain both letters and digits');
    }
  }

  hash(password: string): Promise<string> {
    return hash(password, this.config.bcryptRounds);
  }

  async verify(password: string, passwordHash: string | null): Promise<boolean> {
    if (!passwordHash) {
      return false;
    }
    return compare(password, passwordHash);
  }
}
