import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
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
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { AttendanceStatus, CohortStatus } from '../enums/cohort.enums';

export class CreateCohortDto {
  @ApiProperty({ example: 'Spring 2026 evening cohort' })
  @IsString()
  @Length(2, 200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ example: '2026-03-02T18:00:00Z' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ example: '2026-05-25T20:00:00Z' })
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional({ default: 'UTC', example: 'Europe/Berlin' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiProperty({ minimum: 1, maximum: 10000 })
  @IsInt()
  @Min(1)
  @Max(10000)
  capacity!: number;

  @ApiPropertyOptional({ description: 'Admins may assign another instructor' })
  @IsOptional()
  @IsUUID()
  instructorId?: string;
}

export class UpdateCohortDto extends PartialType(CreateCohortDto) {
  @ApiPropertyOptional({ enum: CohortStatus })
  @IsOptional()
  @IsEnum(CohortStatus)
  status?: CohortStatus;
}

export class CreateSessionDto {
  @ApiProperty({ example: 'Week 1 kickoff' })
  @IsString()
  @Length(2, 200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty()
  @IsDateString()
  startsAt!: string;

  @ApiProperty()
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  meetingUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  recordingUrl?: string;
}

export class UpdateSessionDto extends PartialType(CreateSessionDto) {}

export class AttendanceEntryDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class MarkAttendanceDto {
  @ApiProperty({ type: [AttendanceEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries!: AttendanceEntryDto[];
}

export class ListCohortsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @ApiPropertyOptional({ enum: CohortStatus })
  @IsOptional()
  @IsEnum(CohortStatus)
  status?: CohortStatus;

  @ApiPropertyOptional({ default: true, description: 'Hide cohorts that already ended' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  upcomingOnly: boolean = true;
}
