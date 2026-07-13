import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { UserRole, UserStatus } from '../../common/enums/user-role.enum';

export const USER_SORT_FIELDS = ['createdAt', 'lastLoginAt', 'email', 'lastName'] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];

export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches name or email, case insensitive' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ enum: USER_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(USER_SORT_FIELDS)
  sortBy: UserSortField = 'createdAt';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortDir: 'ASC' | 'DESC' = 'DESC';
}
