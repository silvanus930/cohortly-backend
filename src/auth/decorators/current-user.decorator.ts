import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type Request } from 'express';
import { type User } from '../../users/entities/user.entity';

export type AuthenticatedRequest = Request & { user?: User };

/**
 * Resolves the authenticated user attached by the JWT strategy. Pass a
 * property name to pick a single field, for example `@CurrentUser('id')`.
 */
export const CurrentUser = createParamDecorator(
  (property: keyof User | undefined, context: ExecutionContext): unknown => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      return undefined;
    }
    return property ? user[property] : user;
  },
);
