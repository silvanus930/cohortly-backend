import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { authConfig } from './auth.config';
import { OneTimeCode, OneTimeCodePurpose } from './entities/one-time-code.entity';
import { OtpService } from './otp.service';

describe('OtpService', () => {
  let service: OtpService;
  const repository = {
    update: jest.fn(),
    save: jest.fn(),
    create: jest.fn((value: Partial<OneTimeCode>) => value),
    findOne: jest.fn(),
    increment: jest.fn(),
  };
  const purpose = OneTimeCodePurpose.PASSWORD_RESET;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: getRepositoryToken(OneTimeCode), useValue: repository },
        { provide: authConfig.KEY, useValue: { otpTtlMinutes: 10, otpMaxAttempts: 3 } },
      ],
    }).compile();
    service = moduleRef.get(OtpService);
  });

  it('generates six digit codes', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(service.generateCode()).toMatch(/^[0-9]{6}$/);
    }
  });

  it('issues a hashed code and invalidates older ones', async () => {
    const issued = await service.issue('u1', purpose);

    expect(issued.code).toMatch(/^[0-9]{6}$/);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', purpose }),
      expect.objectContaining({ consumedAt: expect.any(Date) as Date }),
    );
    const saved = repository.save.mock.calls[0][0] as OneTimeCode;
    expect(saved.codeHash).toBe(service.hashCode(issued.code));
    expect(saved.codeHash).not.toBe(issued.code);
  });

  it('consumes a matching code', async () => {
    repository.findOne.mockResolvedValue({
      id: 'c1',
      codeHash: service.hashCode('123456'),
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await service.verifyAndConsume('u1', purpose, '123456');

    expect(repository.update).toHaveBeenCalledWith(
      { id: 'c1' },
      { consumedAt: expect.any(Date) as Date },
    );
  });

  it('counts a wrong code as a failed attempt', async () => {
    repository.findOne.mockResolvedValue({
      id: 'c1',
      codeHash: service.hashCode('123456'),
      attempts: 1,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.verifyAndConsume('u1', purpose, '000000')).rejects.toThrow(
      'The code is not valid',
    );
    expect(repository.increment).toHaveBeenCalledWith({ id: 'c1' }, 'attempts', 1);
  });

  it('rejects codes that exceeded the attempt budget', async () => {
    repository.findOne.mockResolvedValue({
      id: 'c1',
      codeHash: service.hashCode('123456'),
      attempts: 3,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.verifyAndConsume('u1', purpose, '123456')).rejects.toThrow(
      'Too many attempts',
    );
  });

  it('rejects expired or missing codes', async () => {
    repository.findOne.mockResolvedValue({
      id: 'c1',
      codeHash: service.hashCode('123456'),
      attempts: 0,
      expiresAt: new Date(Date.now() - 1),
    });
    await expect(service.verifyAndConsume('u1', purpose, '123456')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    repository.findOne.mockResolvedValue(null);
    await expect(service.verifyAndConsume('u1', purpose, '123456')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
