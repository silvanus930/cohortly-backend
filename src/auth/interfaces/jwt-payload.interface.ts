import { type UserRole } from '../../common/enums/user-role.enum';

export interface JwtPayload {
  /** Subject: the user id. */
  sub: string;
  email: string;
  role: UserRole;
  /** Issued at, seconds since epoch. Added by the JWT library. */
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface RequestContext {
  userAgent?: string;
  ipAddress?: string;
}
