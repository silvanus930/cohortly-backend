import { ApiProperty } from '@nestjs/swagger';
import { UserRole, UserStatus } from '../common/enums/user-role.enum';
import { type User } from './entities/user.entity';

export class UserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ enum: UserRole }) role!: UserRole;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiProperty({ nullable: true }) avatarUrl!: string | null;
  @ApiProperty({ nullable: true }) emailVerifiedAt!: Date | null;
  @ApiProperty({ nullable: true }) lastLoginAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}

/** Strips credentials and internal columns before a user leaves the API. */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarUrl ?? null,
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
  };
}
