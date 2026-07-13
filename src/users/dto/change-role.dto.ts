import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserRole, UserStatus } from '../../common/enums/user-role.enum';

export class ChangeRoleDto {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;
}

export class ChangeStatusDto {
  @ApiProperty({ enum: UserStatus })
  @IsEnum(UserStatus)
  status!: UserStatus;
}
