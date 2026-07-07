import { Test } from '@nestjs/testing';
import { type Request } from 'express';
import { UserRole, UserStatus } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import { AuthController, requestContext } from './auth.controller';
import { AuthService } from './auth.service';

const request = { headers: { 'user-agent': 'jest' }, ip: '10.0.0.1' } as unknown as Request;
const user = {
  id: 'u1',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  passwordHash: 'secret',
  role: UserRole.LEARNER,
  status: UserStatus.ACTIVE,
  avatarUrl: null,
  emailVerifiedAt: null,
  lastLoginAt: null,
  createdAt: new Date(),
} as unknown as User;

describe('AuthController', () => {
  let controller: AuthController;
  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    googleLogin: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    logoutEverywhere: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    changePassword: jest.fn(),
    updateProfile: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    controller = moduleRef.get(AuthController);
  });

  it('extracts the request context from headers and ip', () => {
    expect(requestContext(request)).toEqual({ userAgent: 'jest', ipAddress: '10.0.0.1' });
  });

  it('passes the request context to register and login', async () => {
    const dto = { email: 'a@b.c', password: 'Passw0rd!', firstName: 'A', lastName: 'B' };
    await controller.register(dto, request);
    expect(authService.register).toHaveBeenCalledWith(dto, {
      userAgent: 'jest',
      ipAddress: '10.0.0.1',
    });

    await controller.login({ email: 'a@b.c', password: 'x' }, request);
    expect(authService.login).toHaveBeenCalledWith(
      { email: 'a@b.c', password: 'x' },
      expect.any(Object),
    );
  });

  it('forwards refresh, logout and google sign in', async () => {
    await controller.refresh({ refreshToken: 'r' }, request);
    expect(authService.refresh).toHaveBeenCalledWith('r', expect.any(Object));

    await controller.logout({ refreshToken: 'r' });
    expect(authService.logout).toHaveBeenCalledWith('r');

    await controller.logoutAll('u1');
    expect(authService.logoutEverywhere).toHaveBeenCalledWith('u1');

    await controller.google({ idToken: 't' }, request);
    expect(authService.googleLogin).toHaveBeenCalledWith({ idToken: 't' }, expect.any(Object));
  });

  it('answers forgot password with a neutral message', async () => {
    const result = await controller.forgotPassword({ email: 'a@b.c' });

    expect(authService.forgotPassword).toHaveBeenCalledWith('a@b.c');
    expect(result.message).toMatch(/if the email is registered/i);
  });

  it('forwards reset and change password', async () => {
    const reset = { email: 'a@b.c', code: '123456', newPassword: 'Newpass99' };
    await controller.resetPassword(reset);
    expect(authService.resetPassword).toHaveBeenCalledWith(reset);

    const change = { currentPassword: 'a', newPassword: 'Newpass99' };
    await controller.changePassword(user, change);
    expect(authService.changePassword).toHaveBeenCalledWith(user, change);
  });

  it('serialises the current user without credentials', () => {
    const me = controller.me(user);

    expect(me).toMatchObject({ id: 'u1', email: 'ada@example.com', fullName: 'Ada Lovelace' });
    expect(me).not.toHaveProperty('passwordHash');
  });

  it('updates the profile through the service', async () => {
    authService.updateProfile.mockResolvedValue({ id: 'u1', firstName: 'Grace' });

    const result = await controller.updateMe(user, { firstName: 'Grace' });

    expect(authService.updateProfile).toHaveBeenCalledWith(user, { firstName: 'Grace' });
    expect(result).toMatchObject({ firstName: 'Grace' });
  });
});
