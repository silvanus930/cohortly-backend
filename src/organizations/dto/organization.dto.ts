import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { OrganizationMemberRole, OrganizationStatus } from '../enums/organization.enums';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @Length(2, 200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  logoUrl?: string;

  @ApiPropertyOptional({
    description: 'User who will own the organization. Defaults to the caller.',
  })
  @IsOptional()
  @IsUUID()
  ownerId?: string;
}

export class UpdateOrganizationDto extends PartialType(
  PickType(CreateOrganizationDto, ['name', 'description', 'website', 'logoUrl'] as const),
) {}

export class ListOrganizationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: OrganizationStatus })
  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;
}

export class GrantSeatPackDto {
  @ApiProperty({ minimum: 1, maximum: 10000 })
  @IsInt()
  @Min(1)
  @Max(10000)
  seats!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ description: 'ISO date after which the seats no longer count' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class InviteMemberDto {
  @ApiProperty({ example: 'learner@acme.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiPropertyOptional({ enum: OrganizationMemberRole, default: OrganizationMemberRole.MEMBER })
  @IsOptional()
  @IsEnum(OrganizationMemberRole)
  role?: OrganizationMemberRole;
}

export class AcceptInvitationDto {
  @ApiProperty({ description: 'Token from the invitation email' })
  @IsString()
  @Length(32, 256)
  token!: string;
}

export class AssignSeatDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty()
  @IsUUID()
  courseId!: string;
}

export class ListMembersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrganizationMemberRole })
  @IsOptional()
  @IsEnum(OrganizationMemberRole)
  role?: OrganizationMemberRole;
}
