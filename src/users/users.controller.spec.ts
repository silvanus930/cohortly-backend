import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole, UserStatus } from '../common/enums/user-role.enum';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { type User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

function fakeUser(overrides: Partial<User>): User {
  return {
    id: 'u1',
    email: 'a@b.c',
    firstName: 'A',
    lastName: 'B',
    passwordHash: 'x',
    role: UserRole.LEARNER,
    status: UserStatus.ACTIVE,
    avatarUrl: null,
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    ...overrides,
  } as User;
}

describe('UsersController', () => {
  let controller: UsersController;
  const usersService = {
    list: jest.fn(),
    analyticsSummary: jest.fn(),
    findByIdOrFail: jest.fn(),
    changeRole: jest.fn(),
    setStatus: jest.fn(),
  };
  const admin = fakeUser({ id: 'admin', role: UserRole.ADMIN });
  const superadmin = fakeUser({ id: 'root', role: UserRole.SUPERADMIN });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();
    controller = moduleRef.get(UsersController);
  });

  it('maps listed users to their public shape', async () => {
    usersService.list.mockResolvedValue({
      items: [fakeUser({ id: 'u9' })],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    const result = await controller.list(new ListUsersQueryDto());

    expect(result.items[0]).toMatchObject({ id: 'u9', fullName: 'A B' });
    expect(result.items[0]).not.toHaveProperty('passwordHash');
    expect(result.meta.total).toBe(1);
  });

  it('exposes the analytics summary', async () => {
    usersService.analyticsSummary.mockResolvedValue({ total: 3 });

    await expect(controller.analytics()).resolves.toEqual({ total: 3 });
  });

  it('lets admins change ordinary roles', async () => {
    const target = fakeUser({ id: 'u2' });
    usersService.findByIdOrFail.mockResolvedValue(target);
    usersService.changeRole.mockResolvedValue({ ...target, role: UserRole.INSTRUCTOR });

    const result = await controller.changeRole(admin, 'u2', { role: UserRole.INSTRUCTOR });

    expect(result.role).toBe(UserRole.INSTRUCTOR);
    expect(usersService.changeRole).toHaveBeenCalledWith('u2', UserRole.INSTRUCTOR);
  });

  it('reserves superadmin membership changes for superadmins', async () => {
    usersService.findByIdOrFail.mockResolvedValue(fakeUser({ id: 'u2' }));
    await expect(
      controller.changeRole(admin, 'u2', { role: UserRole.SUPERADMIN }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    usersService.findByIdOrFail.mockResolvedValue(
      fakeUser({ id: 'u3', role: UserRole.SUPERADMIN }),
    );
    await expect(
      controller.changeRole(admin, 'u3', { role: UserRole.ADMIN }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    usersService.changeRole.mockResolvedValue(fakeUser({ id: 'u3', role: UserRole.ADMIN }));
    await expect(
      controller.changeRole(superadmin, 'u3', { role: UserRole.ADMIN }),
    ).resolves.toMatchObject({
      role: UserRole.ADMIN,
    });
  });

  it('prevents changing your own role or status', async () => {
    usersService.findByIdOrFail.mockResolvedValue(admin);

    await expect(controller.changeRole(admin, 'admin', { role: UserRole.LEARNER })).rejects.toThrow(
      'own role',
    );
    await expect(
      controller.changeStatus(admin, 'admin', { status: UserStatus.SUSPENDED }),
    ).rejects.toThrow('own status');
  });

  it('suspends and reactivates other users', async () => {
    const target = fakeUser({ id: 'u2' });
    usersService.findByIdOrFail.mockResolvedValue(target);
    usersService.setStatus.mockResolvedValue({ ...target, status: UserStatus.SUSPENDED });

    const result = await controller.changeStatus(admin, 'u2', { status: UserStatus.SUSPENDED });

    expect(result.status).toBe(UserStatus.SUSPENDED);
  });

  it('protects superadmins from being suspended by admins', async () => {
    usersService.findByIdOrFail.mockResolvedValue(
      fakeUser({ id: 'root2', role: UserRole.SUPERADMIN }),
    );

    await expect(
      controller.changeStatus(admin, 'root2', { status: UserStatus.SUSPENDED }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
