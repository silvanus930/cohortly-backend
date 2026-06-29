export enum UserRole {
  SUPERADMIN = 'SUPERADMIN',
  ADMIN = 'ADMIN',
  INSTRUCTOR = 'INSTRUCTOR',
  LEARNER = 'LEARNER',
  ORG_ADMIN = 'ORG_ADMIN',
  PARTNER = 'PARTNER',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

/** Roles that may reach the administrative surface of the API. */
export const STAFF_ROLES: readonly UserRole[] = [UserRole.SUPERADMIN, UserRole.ADMIN];
