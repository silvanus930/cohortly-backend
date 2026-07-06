import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserRole, UserStatus } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import { authConfig } from './auth.config';
import { RefreshToken } from './entities/refresh-token.entity';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let service: TokenService;
  const jwt = { signAsync: jest.fn().mockResolvedValue('access.jwt') };
  const repository = {
    create: jest.fn((value: Partial<RefreshToken>) => value),
    save: jest.fn((value: Partial<RefreshToken>) => Promise.resolve({ id: 'new-id', ...value })),
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const user = {
    id: 'u1',
    email: 'ada@example.com',
    role: UserRole.LEARNER,
    status: UserStatus.ACTIVE,
    isActive: true,
  } as unknown as User;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService, useValue: jwt },
        { provide: getRepositoryToken(RefreshToken), useValue: repository },
        { provide: authConfig.KEY, useValue: { accessTtlSeconds: 900, refreshTtlDays: 30 } },
      ],
    }).compile();
    service = moduleRef.get(TokenService);
  });

  it('issues a pair and stores only the refresh token hash', async () => {
    const tokens = await service.issueTokens(user, { userAgent: 'jest', ipAddress: '127.0.0.1' });

    expect(tokens).toMatchObject({
      accessToken: 'access.jwt',
      expiresIn: 900,
      tokenType: 'Bearer',
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: 'u1', email: 'ada@example.com', role: UserRole.LEARNER },
      { expiresIn: 900 },
    );
    const stored = repository.save.mock.calls[0][0] as RefreshToken;
    expect(stored.tokenHash).toBe(service.hashToken(tokens.refreshToken));
    expect(stored.tokenHash).not.toBe(tokens.refreshToken);
    expect(stored.userAgent).toBe('jest');
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);
  });

  it('rotates a valid token, revoking the old one and linking its successor', async () => {
    const stored = {
      id: 'old',
      userId: 'u1',
      family: 'fam',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user,
    };
    repository.findOne.mockResolvedValueOnce(stored).mockResolvedValueOnce({ id: 'new-id' });

    const result = await service.rotate('raw-token');

    expect(result.user).toBe(user);
    expect(result.tokens.refreshToken).toEqual(expect.any(String));
    const created = repository.save.mock.calls[0][0] as RefreshToken;
    expect(created.family).toBe('fam');
    expect(repository.update).toHaveBeenCalledWith(
      { id: 'old' },
      { revokedAt: expect.any(Date) as Date, replacedById: 'new-id' },
    );
  });

  it('rejects unknown tokens', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.rotate('nope')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes the whole family when a revoked token is replayed', async () => {
    repository.findOne.mockResolvedValue({
      id: 'old',
      userId: 'u1',
      family: 'fam',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user,
    });

    await expect(service.rotate('replayed')).rejects.toThrow('has been revoked');
    expect(repository.update).toHaveBeenCalledWith(expect.objectContaining({ family: 'fam' }), {
      revokedAt: expect.any(Date) as Date,
    });
  });

  it('rejects expired tokens and suspended users', async () => {
    repository.findOne.mockResolvedValueOnce({
      id: 'old',
      family: 'fam',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1),
      user,
    });
    await expect(service.rotate('expired')).rejects.toThrow('expired');

    repository.findOne.mockResolvedValueOnce({
      id: 'old',
      family: 'fam',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { ...user, isActive: false },
    });
    await expect(service.rotate('suspended')).rejects.toThrow('not active');
  });

  it('revokes single tokens and every token of a user', async () => {
    await service.revoke('raw');
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: service.hashToken('raw') }),
      { revokedAt: expect.any(Date) as Date },
    );

    await service.revokeAllForUser('u1');
    expect(repository.update).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }), {
      revokedAt: expect.any(Date) as Date,
    });
  });

  it('purges expired rows through a delete query', async () => {
    const execute = jest.fn().mockResolvedValue({ affected: 3 });
    const where = jest.fn().mockReturnValue({ execute });
    repository.createQueryBuilder.mockReturnValue({ delete: () => ({ where }) });

    await expect(service.purgeExpired()).resolves.toBe(3);
    expect(where).toHaveBeenCalledWith('expires_at < :now', { now: expect.any(Date) as Date });
  });
});
