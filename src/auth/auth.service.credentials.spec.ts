import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { type AuthService } from './auth.service';
import { buildAuthService, mocks, user } from './auth.service.spec';
import { OneTimeCodePurpose } from './entities/one-time-code.entity';

describe('AuthService credentials', () => {
  let service: AuthService;

  beforeEach(async () => {
    service = await buildAuthService();
  });

  it('rejects resets for unknown emails without revealing why', async () => {
    mocks.usersService.findByEmail.mockResolvedValue(null);

    await expect(
      service.resetPassword({ email: 'x@y.z', code: '123456', newPassword: 'Newpass99' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.otpService.verifyAndConsume).not.toHaveBeenCalled();
  });

  it('resets the password after consuming the code and revokes sessions', async () => {
    mocks.usersService.findByEmail.mockResolvedValue(user);

    await service.resetPassword({ email: user.email, code: '123456', newPassword: 'Newpass99' });

    expect(mocks.otpService.verifyAndConsume).toHaveBeenCalledWith(
      'u1',
      OneTimeCodePurpose.PASSWORD_RESET,
      '123456',
    );
    expect(mocks.passwordService.assertStrong).toHaveBeenCalledWith('Newpass99');
    expect(mocks.usersService.update).toHaveBeenCalledWith('u1', { passwordHash: 'new-hash' });
    expect(mocks.tokenService.revokeAllForUser).toHaveBeenCalledWith('u1');
  });

  it('requires the current password when changing passwords', async () => {
    mocks.passwordService.verify.mockResolvedValueOnce(false);

    await expect(
      service.changePassword(user, { currentPassword: 'old', newPassword: 'Newpass99' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires the new password to differ', async () => {
    mocks.passwordService.verify.mockResolvedValueOnce(true);

    await expect(
      service.changePassword(user, { currentPassword: 'same1234', newPassword: 'same1234' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('changes the password and revokes every session', async () => {
    mocks.passwordService.verify.mockResolvedValueOnce(true);

    await service.changePassword(user, { currentPassword: 'old', newPassword: 'Newpass99' });

    expect(mocks.usersService.update).toHaveBeenCalledWith('u1', { passwordHash: 'new-hash' });
    expect(mocks.tokenService.revokeAllForUser).toHaveBeenCalledWith('u1');
  });

  describe('google sign in', () => {
    const profile = {
      googleId: 'g1',
      email: 'ada@example.com',
      emailVerified: true,
      firstName: 'Ada',
      lastName: 'L',
      avatarUrl: 'https://img/ada.png',
    };

    beforeEach(() => {
      mocks.googleAuthService.verifyIdToken.mockResolvedValue(profile);
    });

    it('links the google id to an existing account', async () => {
      mocks.usersService.findByEmail.mockResolvedValue(user);
      mocks.usersService.update.mockResolvedValue({ ...user, googleId: 'g1' });

      const result = await service.googleLogin({ idToken: 't' }, {});

      expect(mocks.usersService.update).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ googleId: 'g1', avatarUrl: 'https://img/ada.png' }),
      );
      expect(mocks.usersService.markLogin).toHaveBeenCalledWith('u1');
      expect(result.user.id).toBe('u1');
    });

    it('creates a verified account for new google users', async () => {
      mocks.usersService.findByEmail.mockResolvedValue(null);
      mocks.usersService.create.mockResolvedValue({ ...user, id: 'u2' });

      const result = await service.googleLogin({ idToken: 't' }, {});

      expect(mocks.usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ googleId: 'g1', emailVerifiedAt: expect.any(Date) as Date }),
      );
      expect(result.user.id).toBe('u2');
    });

    it('refuses suspended accounts', async () => {
      mocks.usersService.findByEmail.mockResolvedValue({ ...user, isActive: false });

      await expect(service.googleLogin({ idToken: 't' }, {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  it('updates the profile and returns the public shape', async () => {
    mocks.usersService.update.mockResolvedValue({ ...user, firstName: 'Grace' });

    const result = await service.updateProfile(user, { firstName: 'Grace' });

    expect(result.firstName).toBe('Grace');
    expect(result).not.toHaveProperty('passwordHash');
  });
});
