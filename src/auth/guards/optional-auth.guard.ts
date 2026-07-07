import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { type User } from '../../users/entities/user.entity';

/**
 * Populates `request.user` when a valid bearer token is present but never
 * rejects the request. Combine with @Public() on routes that personalise
 * output for signed-in visitors while staying reachable anonymously.
 */
@Injectable()
export class OptionalAuthGuard extends AuthGuard('jwt') {
  override handleRequest<TUser = User>(_error: unknown, user: TUser | false): TUser {
    return (user || undefined) as TUser;
  }
}
