import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { UserRole, type UserStatus } from '../../src/common/enums/user-role.enum';
import { type User } from '../../src/users/entities/user.entity';
import { UsersService } from '../../src/users/users.service';
import { PasswordService } from '../../src/auth/password.service';
import { TokenService } from '../../src/auth/token.service';

export interface TestSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface CreateUserOptions {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  status?: UserStatus;
}

let counter = 0;

export function uniqueEmail(prefix = 'user'): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@cohortly.test`;
}

/** Creates a user straight through the services and returns a signed-in session. */
export async function createUserSession(
  app: INestApplication,
  options: CreateUserOptions = {},
): Promise<TestSession> {
  const usersService = app.get(UsersService);
  const passwordService = app.get(PasswordService);
  const tokenService = app.get(TokenService);

  let user = await usersService.create({
    email: options.email ?? uniqueEmail(options.role?.toLowerCase() ?? 'user'),
    firstName: options.firstName ?? 'Test',
    lastName: options.lastName ?? 'User',
    role: options.role ?? UserRole.LEARNER,
    passwordHash: await passwordService.hash(options.password ?? 'Passw0rd!'),
    emailVerifiedAt: new Date(),
  });
  if (options.status) {
    user = await usersService.setStatus(user.id, options.status);
  }
  const tokens = await tokenService.issueTokens(user);
  return { user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export function api(app: INestApplication): ReturnType<typeof request> {
  return request(app.getHttpServer() as App);
}
