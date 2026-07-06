import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { UserRole } from '../common/enums/user-role.enum';
import { UsersService } from '../users/users.service';
import { authConfig } from './auth.config';
import { PasswordService } from './password.service';

/**
 * Guarantees a superadmin exists so a fresh deployment can be administered
 * without touching the database by hand. Runs once per boot and is a no-op
 * when the credentials are not configured.
 */
@Injectable()
export class SuperadminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SuperadminBootstrapService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureSuperadmin();
  }

  async ensureSuperadmin(): Promise<'skipped' | 'created' | 'promoted' | 'present'> {
    const { email, password, firstName, lastName } = this.config.superadmin;
    if (!email || !password) {
      return 'skipped';
    }

    const existing = await this.usersService.findByEmail(email);
    if (!existing) {
      await this.usersService.create({
        email,
        firstName,
        lastName,
        role: UserRole.SUPERADMIN,
        passwordHash: await this.passwordService.hash(password),
        emailVerifiedAt: new Date(),
      });
      this.logger.log(`Created superadmin account for ${email}`);
      return 'created';
    }
    if (existing.role !== UserRole.SUPERADMIN) {
      await this.usersService.changeRole(existing.id, UserRole.SUPERADMIN);
      this.logger.warn(`Promoted ${email} to superadmin`);
      return 'promoted';
    }
    return 'present';
  }
}
