import { SetMetadata } from '@nestjs/common';
import { type UserRole } from '../../common/enums/user-role.enum';

export const ROLES_KEY = 'roles';

/** Restricts a handler or controller to the listed roles. Superadmins always pass. */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
