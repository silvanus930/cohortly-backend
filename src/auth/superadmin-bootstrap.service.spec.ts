import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '../common/enums/user-role.enum';
import { UsersService } from '../users/users.service';
import { authConfig } from './auth.config';
import { PasswordService } from './password.service';
import { SuperadminBootstrapService } from './superadmin-bootstrap.service';

describe('SuperadminBootstrapService', () => {
  const usersService = { findByEmail: jest.fn(), create: jest.fn(), changeRole: jest.fn() };
  const passwordService = { hash: jest.fn().mockResolvedValue('hashed') };

  async function build(superadmin: Record<string, string>): Promise<SuperadminBootstrapService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SuperadminBootstrapService,
        { provide: UsersService, useValue: usersService },
        { provide: PasswordService, useValue: passwordService },
        { provide: authConfig.KEY, useValue: { superadmin } },
      ],
    }).compile();
    return moduleRef.get(SuperadminBootstrapService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('does nothing when credentials are absent', async () => {
    const service = await build({ email: '', password: '' });

    await expect(service.ensureSuperadmin()).resolves.toBe('skipped');
    expect(usersService.findByEmail).not.toHaveBeenCalled();
  });

  it('creates the superadmin when missing', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    const service = await build({
      email: 'root@cohortly.test',
      password: 'RootPassw0rd',
      firstName: 'Root',
      lastName: 'User',
    });

    await expect(service.ensureSuperadmin()).resolves.toBe('created');
    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'root@cohortly.test',
        role: UserRole.SUPERADMIN,
        passwordHash: 'hashed',
      }),
    );
  });

  it('promotes an existing account that is not yet a superadmin', async () => {
    usersService.findByEmail.mockResolvedValue({ id: 'u1', role: UserRole.LEARNER });
    const service = await build({ email: 'root@cohortly.test', password: 'x' });

    await expect(service.ensureSuperadmin()).resolves.toBe('promoted');
    expect(usersService.changeRole).toHaveBeenCalledWith('u1', UserRole.SUPERADMIN);
  });

  it('leaves an existing superadmin untouched', async () => {
    usersService.findByEmail.mockResolvedValue({ id: 'u1', role: UserRole.SUPERADMIN });
    const service = await build({ email: 'root@cohortly.test', password: 'x' });

    await expect(service.ensureSuperadmin()).resolves.toBe('present');
    expect(usersService.create).not.toHaveBeenCalled();
    expect(usersService.changeRole).not.toHaveBeenCalled();
  });
});
