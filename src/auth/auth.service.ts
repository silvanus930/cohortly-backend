import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { type User } from '../users/entities/user.entity';
import { toUserDto, type UserDto } from '../users/users.mapper';
import { UsersService } from '../users/users.service';
import { authConfig } from './auth.config';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { OneTimeCodePurpose } from './entities/one-time-code.entity';
import { GoogleAuthService } from './google-auth.service';
import { type AuthTokens, type RequestContext } from './interfaces/jwt-payload.interface';
import { ReferralsService } from '../referrals/referrals.service';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

export interface AuthResponse {
  user: UserDto;
  tokens: AuthTokens;
}

const INVALID_CREDENTIALS = 'Email or password is incorrect';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly otpService: OtpService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly mailService: MailService,
    private readonly referralsService: ReferralsService,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  async register(dto: RegisterDto, context: RequestContext): Promise<AuthResponse> {
    this.passwordService.assertStrong(dto.password);
    const referrer = await this.referralsService.resolveReferrer(dto.referralCode);
    const user = await this.usersService.create({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      passwordHash: await this.passwordService.hash(dto.password),
    });
    await this.referralsService.attach(user, referrer);
    this.mailService.sendWelcome(user).catch((error: unknown) => {
      this.logger.warn(`Welcome email failed for ${user.email}: ${String(error)}`);
    });
    return this.buildResponse(user, context);
  }

  async login(dto: LoginDto, context: RequestContext): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !(await this.passwordService.verify(dto.password, user.passwordHash))) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is suspended');
    }
    await this.usersService.markLogin(user.id);
    return this.buildResponse(user, context);
  }

  async refresh(refreshToken: string, context: RequestContext): Promise<AuthResponse> {
    const { user, tokens } = await this.tokenService.rotate(refreshToken, context);
    return { user: toUserDto(user), tokens };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokenService.revoke(refreshToken);
  }

  async logoutEverywhere(userId: string): Promise<void> {
    await this.tokenService.revokeAllForUser(userId);
  }

  /** Always resolves so the endpoint does not reveal whether an email exists. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.isActive) {
      return;
    }
    const issued = await this.otpService.issue(user.id, OneTimeCodePurpose.PASSWORD_RESET);
    await this.mailService.sendPasswordResetCode(user, issued.code, this.config.otpTtlMinutes);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new BadRequestException('The code is not valid');
    }
    await this.otpService.verifyAndConsume(user.id, OneTimeCodePurpose.PASSWORD_RESET, dto.code);
    this.passwordService.assertStrong(dto.newPassword);
    await this.usersService.update(user.id, {
      passwordHash: await this.passwordService.hash(dto.newPassword),
    });
    await this.tokenService.revokeAllForUser(user.id);
  }

  async changePassword(user: User, dto: ChangePasswordDto): Promise<void> {
    if (!(await this.passwordService.verify(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must differ from the current one');
    }
    this.passwordService.assertStrong(dto.newPassword);
    await this.usersService.update(user.id, {
      passwordHash: await this.passwordService.hash(dto.newPassword),
    });
    await this.tokenService.revokeAllForUser(user.id);
  }

  async googleLogin(dto: GoogleLoginDto, context: RequestContext): Promise<AuthResponse> {
    const profile = await this.googleAuthService.verifyIdToken(dto.idToken);
    let user = await this.usersService.findByEmail(profile.email);
    if (user) {
      if (!user.isActive) {
        throw new UnauthorizedException('Account is suspended');
      }
      if (!user.googleId || !user.emailVerifiedAt) {
        user = await this.usersService.update(user.id, {
          googleId: user.googleId ?? profile.googleId,
          emailVerifiedAt: user.emailVerifiedAt ?? (profile.emailVerified ? new Date() : null),
          avatarUrl: user.avatarUrl ?? profile.avatarUrl,
        });
      }
    } else {
      user = await this.usersService.create({
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        googleId: profile.googleId,
        avatarUrl: profile.avatarUrl,
        emailVerifiedAt: profile.emailVerified ? new Date() : null,
      });
      await this.referralsService.attach(
        user,
        await this.referralsService.resolveReferrer(dto.referralCode),
      );
    }
    await this.usersService.markLogin(user.id);
    return this.buildResponse(user, context);
  }

  async updateProfile(user: User, dto: UpdateProfileDto): Promise<UserDto> {
    const updated = await this.usersService.update(user.id, dto);
    return toUserDto(updated);
  }

  private async buildResponse(user: User, context: RequestContext): Promise<AuthResponse> {
    const tokens = await this.tokenService.issueTokens(user, context);
    return { user: toUserDto(user), tokens };
  }
}
