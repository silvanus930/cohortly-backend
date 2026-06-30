import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserRole, UserStatus } from '../common/enums/user-role.enum';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  const repository = {
    findOne: jest.fn(),
    exists: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: getRepositoryToken(User), useValue: repository }],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  describe('create', () => {
    it('normalises the email, trims names and defaults to the learner role', async () => {
      repository.exists.mockResolvedValue(false);
      repository.create.mockImplementation((value: Partial<User>) => value);
      repository.save.mockImplementation((value: Partial<User>) =>
        Promise.resolve({ id: 'u1', ...value }),
      );

      const user = await service.create({
        email: '  Ada@Example.COM ',
        firstName: ' Ada ',
        lastName: 'Lovelace ',
      });

      expect(user.email).toBe('ada@example.com');
      expect(user.firstName).toBe('Ada');
      expect(user.lastName).toBe('Lovelace');
      expect(user.role).toBe(UserRole.LEARNER);
      expect(user.status).toBe(UserStatus.ACTIVE);
      expect(user.passwordHash).toBeNull();
    });

    it('rejects duplicate emails with a conflict', async () => {
      repository.exists.mockResolvedValue(true);

      await expect(
        service.create({ email: 'dup@example.com', firstName: 'A', lastName: 'B' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('findByIdOrFail', () => {
    it('throws a not found error when the user is missing', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findByIdOrFail('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the user when present', async () => {
      const user = { id: 'u1' } as User;
      repository.findOne.mockResolvedValue(user);

      await expect(service.findByIdOrFail('u1')).resolves.toBe(user);
    });
  });

  describe('findByEmail', () => {
    it('looks the user up by the normalised email', async () => {
      repository.findOne.mockResolvedValue(null);

      await service.findByEmail('  Someone@Example.com');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { email: 'someone@example.com' },
      });
    });
  });

  describe('update', () => {
    it('merges the patch into the stored user and saves it', async () => {
      const user = { id: 'u1', firstName: 'Old' } as User;
      repository.findOne.mockResolvedValue(user);
      repository.save.mockImplementation((value: User) => Promise.resolve(value));

      const updated = await service.update('u1', { firstName: 'New' });

      expect(updated.firstName).toBe('New');
      expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }));
    });
  });

  describe('markLogin', () => {
    it('stamps the last login time', async () => {
      repository.update.mockResolvedValue(undefined);

      await service.markLogin('u1');

      expect(repository.update).toHaveBeenCalledWith(
        { id: 'u1' },
        { lastLoginAt: expect.any(Date) as Date },
      );
    });
  });
});
