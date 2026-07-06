import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole, UserStatus } from '../common/enums/user-role.enum';
import { MailService } from '../mail/mail.service';
import { type User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { authConfig } from './auth.config';
import { AuthService } from './auth.service';
import { OneTimeCodePurpose } from './entities/one-time-code.entity';
import { GoogleAuthService } from './google-auth.service';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

export const tokens = {
  accessToken: 'a',
  refreshToken: 'r',
  expiresIn: 900,
  tokenType: 'Bearer' as const,
};

export const user = {
  id: 'u1',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  passwordHash: 'hash',
  role: UserRole.LEARNER,
  status: UserStatus.ACTIVE,
  isActive: true,
  googleId: null,
  avatarUrl: null,
  emailVerifiedAt: null,
  lastLoginAt: null,
  createdAt: new Date(),
} as unknown as User;

export const mocks = {
  usersService: {
    create: jest.fn(),
    findByEmail: jest.fn(),
    markLogin: jest.fn(),
    update: jest.fn(),
  },
  passwordService: { assertStrong: jest.fn(), hash: jest.fn(), verify: jest.fn() },
  tokenService: {
    issueTokens: jest.fn(),
    rotate: jest.fn(),
    revoke: jest.fn(),
    revokeAllForUser: jest.fn(),
  },
  otpService: { issue: jest.fn(), verifyAndConsume: jest.fn() },
  googleAuthService: { verifyIdToken: jest.fn() },
  mailService: { sendWelcome: jest.fn(), sendPasswordResetCode: jest.fn() },
};

export async function buildAuthService(): Promise<AuthService> {
  jest.clearAllMocks();
  mocks.passwordService.hash.mockResolvedValue('new-hash');
  mocks.tokenService.issueTokens.mockResolvedValue(tokens);
  mocks.mailService.sendWelcome.mockResolvedValue(undefined);
  const moduleRef = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: UsersService, useValue: mocks.usersService },
      { provide: PasswordService, useValue: mocks.passwordService },
      { provide: TokenService, useValue: mocks.tokenService },
      { provide: OtpService, useValue: mocks.otpService },
      { provide: GoogleAuthService, useValue: mocks.googleAuthService },
      { provide: MailService, useValue: mocks.mailService },
      { provide: authConfig.KEY, useValue: { otpTtlMinutes: 10 } },
    ],
  }).compile();
  return moduleRef.get(AuthService);
}

describe('AuthService sessions', () => {
  let service: AuthService;

  beforeEach(async () => {
    service = await buildAuthService();
  });

  it('registers a user with a hashed password and sends a welcome email', async () => {
    mocks.usersService.create.mockResolvedValue(user);
    const dto = {
      email: 'ada@example.com',
      password: 'Passw0rd!',
      firstName: 'Ada',
      lastName: 'L',
    };

    const result = await service.register(dto, { ipAddress: '::1' });

    expect(mocks.passwordService.assertStrong).toHaveBeenCalledWith('Passw0rd!');
    expect(mocks.usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: 'new-hash' }),
    );
    expect(mocks.mailService.sendWelcome).toHaveBeenCalledWith(user);
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.tokens).toBe(tokens);
  });

  it('uses one message for unknown emails and wrong passwords', async () => {
    mocks.usersService.findByEmail.mockResolvedValueOnce(null);
    await expect(service.login({ email: 'x@y.z', password: 'p' }, {})).rejects.toThrow('incorrect');

    mocks.usersService.findByEmail.mockResolvedValueOnce(user);
    mocks.passwordService.verify.mockResolvedValueOnce(false);
    await expect(service.login({ email: 'a@b.c', password: 'p' }, {})).rejects.toThrow('incorrect');
  });

  it('blocks suspended accounts and records successful logins', async () => {
    mocks.passwordService.verify.mockResolvedValue(true);
    mocks.usersService.findByEmail.mockResolvedValueOnce({ ...user, isActive: false });
    await expect(service.login({ email: 'a@b.c', password: 'p' }, {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    mocks.usersService.findByEmail.mockResolvedValueOnce(user);
    const result = await service.login({ email: 'a@b.c', password: 'p' }, {});
    expect(mocks.usersService.markLogin).toHaveBeenCalledWith('u1');
    expect(result.user.email).toBe('ada@example.com');
  });

  it('silently ignores reset requests for unknown emails', async () => {
    mocks.usersService.findByEmail.mockResolvedValue(null);

    await expect(service.forgotPassword('nobody@example.com')).resolves.toBeUndefined();
    expect(mocks.otpService.issue).not.toHaveBeenCalled();
  });

  it('emails a reset code to known users', async () => {
    mocks.usersService.findByEmail.mockResolvedValue(user);
    mocks.otpService.issue.mockResolvedValue({ code: '123456', expiresAt: new Date() });

    await service.forgotPassword('ada@example.com');

    expect(mocks.otpService.issue).toHaveBeenCalledWith('u1', OneTimeCodePurpose.PASSWORD_RESET);
    expect(mocks.mailService.sendPasswordResetCode).toHaveBeenCalledWith(user, '123456', 10);
  });

  it('delegates refresh and logout to the token service', async () => {
    mocks.tokenService.rotate.mockResolvedValue({ user, tokens });

    const result = await service.refresh('r', {});
    expect(result.tokens).toBe(tokens);

    await service.logout('r');
    expect(mocks.tokenService.revoke).toHaveBeenCalledWith('r');

    await service.logoutEverywhere('u1');
    expect(mocks.tokenService.revokeAllForUser).toHaveBeenCalledWith('u1');
  });
});
