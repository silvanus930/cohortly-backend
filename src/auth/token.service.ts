import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { type User } from '../users/entities/user.entity';
import { authConfig } from './auth.config';
import { RefreshToken } from './entities/refresh-token.entity';
import {
  type AuthTokens,
  type JwtPayload,
  type RequestContext,
} from './interfaces/jwt-payload.interface';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(RefreshToken) private readonly tokens: Repository<RefreshToken>,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  signAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return this.jwt.signAsync(payload, { expiresIn: this.config.accessTtlSeconds });
  }

  hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** Issues a fresh access and refresh token pair, starting a new token family. */
  async issueTokens(
    user: User,
    context: RequestContext = {},
    family?: string,
  ): Promise<AuthTokens> {
    const raw = randomBytes(48).toString('base64url');
    await this.tokens.save(
      this.tokens.create({
        userId: user.id,
        tokenHash: this.hashToken(raw),
        family: family ?? randomUUID(),
        expiresAt: new Date(Date.now() + this.config.refreshTtlDays * DAY_MS),
        revokedAt: null,
        replacedById: null,
        userAgent: context.userAgent?.slice(0, 512) ?? null,
        ipAddress: context.ipAddress?.slice(0, 64) ?? null,
      }),
    );
    return {
      accessToken: await this.signAccessToken(user),
      refreshToken: raw,
      expiresIn: this.config.accessTtlSeconds,
      tokenType: 'Bearer',
    };
  }

  /**
   * Exchanges a refresh token for a new pair. The presented token is revoked
   * and linked to its successor. Presenting an already revoked token is
   * treated as theft and invalidates every token in the family.
   */
  async rotate(
    raw: string,
    context: RequestContext = {},
  ): Promise<{ user: User; tokens: AuthTokens }> {
    const stored = await this.tokens.findOne({
      where: { tokenHash: this.hashToken(raw) },
      relations: { user: true },
    });
    if (!stored?.user) {
      throw new UnauthorizedException('Refresh token is not recognised');
    }
    if (stored.revokedAt) {
      this.logger.warn(`Refresh token reuse detected for user ${stored.userId}`);
      await this.revokeFamily(stored.family);
      throw new UnauthorizedException('Refresh token has been revoked');
    }
    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired');
    }
    if (!stored.user.isActive) {
      throw new UnauthorizedException('Account is not active');
    }

    const tokens = await this.issueTokens(stored.user, context, stored.family);
    const successor = await this.tokens.findOne({
      where: { tokenHash: this.hashToken(tokens.refreshToken) },
    });
    await this.tokens.update(
      { id: stored.id },
      { revokedAt: new Date(), replacedById: successor?.id ?? null },
    );
    return { user: stored.user, tokens };
  }

  async revoke(raw: string): Promise<void> {
    await this.tokens.update(
      { tokenHash: this.hashToken(raw), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async revokeFamily(family: string): Promise<void> {
    await this.tokens.update({ family, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.tokens.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async purgeExpired(): Promise<number> {
    const result = await this.tokens
      .createQueryBuilder()
      .delete()
      .where('expires_at < :now', { now: new Date() })
      .execute();
    return result.affected ?? 0;
  }
}
