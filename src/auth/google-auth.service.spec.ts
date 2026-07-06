import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { authConfig } from './auth.config';
import { GoogleAuthService } from './google-auth.service';

const verifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken })),
}));

async function build(googleClientId: string): Promise<GoogleAuthService> {
  const moduleRef = await Test.createTestingModule({
    providers: [GoogleAuthService, { provide: authConfig.KEY, useValue: { googleClientId } }],
  }).compile();
  return moduleRef.get(GoogleAuthService);
}

describe('GoogleAuthService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refuses to verify when no client id is configured', async () => {
    const service = await build('');

    await expect(service.verifyIdToken('token')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('maps the verified payload to a profile', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'g-1',
        email: 'ada@example.com',
        email_verified: true,
        given_name: 'Ada',
        family_name: 'Lovelace',
        picture: 'https://img.test/ada.png',
      }),
    });
    const service = await build('client-id');

    await expect(service.verifyIdToken('token')).resolves.toEqual({
      googleId: 'g-1',
      email: 'ada@example.com',
      emailVerified: true,
      firstName: 'Ada',
      lastName: 'Lovelace',
      avatarUrl: 'https://img.test/ada.png',
    });
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'token', audience: 'client-id' });
  });

  it('falls back to splitting the display name', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: 'g-2', email: 'grace@example.com', name: 'Grace Brewster Hopper' }),
    });
    const service = await build('client-id');

    const profile = await service.verifyIdToken('token');

    expect(profile.firstName).toBe('Grace');
    expect(profile.lastName).toBe('Brewster Hopper');
    expect(profile.emailVerified).toBe(false);
  });

  it('translates verification failures into 401s', async () => {
    verifyIdToken.mockRejectedValue(new Error('bad signature'));
    const service = await build('client-id');

    await expect(service.verifyIdToken('token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects payloads without a subject or email', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ sub: 'g-3' }) });
    const service = await build('client-id');

    await expect(service.verifyIdToken('token')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
