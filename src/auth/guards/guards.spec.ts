import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { type Reflector } from '@nestjs/core';
import { UserRole, UserStatus } from '../../common/enums/user-role.enum';
import { type User } from '../../users/entities/user.entity';
import { type UsersService } from '../../users/users.service';
import { type authConfig } from '../auth.config';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OptionalAuthGuard } from './optional-auth.guard';
import { RolesGuard } from './roles.guard';

function contextWithUser(user?: Partial<User>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  it('lets public routes through without touching passport', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    const parent = jest.spyOn(
      Object.getPrototypeOf(JwtAuthGuard.prototype) as { canActivate: () => boolean },
      'canActivate',
    );

    expect(guard.canActivate(contextWithUser())).toBe(true);
    expect(parent).not.toHaveBeenCalled();
    parent.mockRestore();
  });

  it('delegates protected routes to passport', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    const parent = jest
      .spyOn(
        Object.getPrototypeOf(JwtAuthGuard.prototype) as { canActivate: () => boolean },
        'canActivate',
      )
      .mockReturnValue(true);

    expect(guard.canActivate(contextWithUser())).toBe(true);
    expect(parent).toHaveBeenCalledTimes(1);
    parent.mockRestore();
  });
});

describe('OptionalAuthGuard', () => {
  const guard = new OptionalAuthGuard();

  it('returns the user when present and undefined otherwise, never throwing', () => {
    const user = { id: 'u1' } as User;
    expect(guard.handleRequest(null, user)).toBe(user);
    expect(guard.handleRequest(new UnauthorizedException(), false)).toBeUndefined();
  });
});

describe('RolesGuard', () => {
  function build(required: UserRole[] | undefined): RolesGuard {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(required),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  it('allows routes without role metadata', () => {
    expect(build(undefined).canActivate(contextWithUser())).toBe(true);
    expect(build([]).canActivate(contextWithUser())).toBe(true);
  });

  it('rejects anonymous requests on restricted routes', () => {
    expect(() => build([UserRole.ADMIN]).canActivate(contextWithUser())).toThrow(
      ForbiddenException,
    );
  });

  it('accepts matching roles and superadmins', () => {
    expect(build([UserRole.ADMIN]).canActivate(contextWithUser({ role: UserRole.ADMIN }))).toBe(
      true,
    );
    expect(
      build([UserRole.ADMIN]).canActivate(contextWithUser({ role: UserRole.SUPERADMIN })),
    ).toBe(true);
  });

  it('rejects users whose role is not listed', () => {
    expect(() =>
      build([UserRole.ADMIN, UserRole.INSTRUCTOR]).canActivate(
        contextWithUser({ role: UserRole.LEARNER }),
      ),
    ).toThrow('permission');
  });
});

describe('JwtStrategy', () => {
  const usersService = { findById: jest.fn() } as unknown as UsersService;
  const strategy = new JwtStrategy(
    { accessSecret: 'x'.repeat(32) } as unknown as ConfigType<typeof authConfig>,
    usersService,
  );
  const payload = { sub: 'u1', email: 'ada@example.com', role: UserRole.LEARNER };

  beforeEach(() => jest.clearAllMocks());

  it('returns the active user for a valid payload', async () => {
    const user = { id: 'u1', isActive: true, status: UserStatus.ACTIVE } as User;
    (usersService.findById as jest.Mock).mockResolvedValue(user);

    await expect(strategy.validate(payload)).resolves.toBe(user);
    expect(usersService.findById).toHaveBeenCalledWith('u1');
  });

  it('rejects deleted and suspended accounts', async () => {
    (usersService.findById as jest.Mock).mockResolvedValueOnce(null);
    await expect(strategy.validate(payload)).rejects.toThrow('no longer exists');

    (usersService.findById as jest.Mock).mockResolvedValueOnce({ id: 'u1', isActive: false });
    await expect(strategy.validate(payload)).rejects.toThrow('suspended');
  });
});
