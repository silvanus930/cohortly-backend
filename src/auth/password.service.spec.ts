import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { authConfig } from './auth.config';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PasswordService, { provide: authConfig.KEY, useValue: { bcryptRounds: 4 } }],
    }).compile();
    service = moduleRef.get(PasswordService);
  });

  it('accepts a password with letters and digits of adequate length', () => {
    expect(() => service.assertStrong('correct-horse-9')).not.toThrow();
  });

  it.each([
    ['short1', 'too short'],
    ['a'.repeat(129) + '1', 'too long'],
    ['onlyletters', 'no digits'],
    ['12345678', 'no letters'],
  ])('rejects %p because it is %s', (password) => {
    expect(() => service.assertStrong(password)).toThrow(BadRequestException);
  });

  it('hashes and verifies passwords', async () => {
    const digest = await service.hash('secret-pass-1');

    expect(digest).not.toBe('secret-pass-1');
    await expect(service.verify('secret-pass-1', digest)).resolves.toBe(true);
    await expect(service.verify('wrong-pass-1', digest)).resolves.toBe(false);
  });

  it('never verifies against a missing hash', async () => {
    await expect(service.verify('anything1', null)).resolves.toBe(false);
  });
});
