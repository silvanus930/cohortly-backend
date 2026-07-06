import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { authConfig } from './auth.config';

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
}

@Injectable()
export class GoogleAuthService {
  private readonly client: OAuth2Client;

  constructor(@Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>) {
    this.client = new OAuth2Client(config.googleClientId || undefined);
  }

  get isConfigured(): boolean {
    return this.config.googleClientId.length > 0;
  }

  /** Verifies a Google ID token and extracts the profile fields we store. */
  async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }

    let payload;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.config.googleClientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Google token could not be verified');
    }

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Google token is missing required claims');
    }

    const [fallbackFirst = 'Learner', ...fallbackRest] = (payload.name ?? '').split(' ');
    return {
      googleId: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified ?? false,
      firstName: payload.given_name ?? fallbackFirst,
      lastName: payload.family_name ?? fallbackRest.join(' '),
      avatarUrl: payload.picture ?? null,
    };
  }
}
