import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { EnrollmentStatus, LessonProgressStatus } from '../enums/enrollment.enums';

export class EnrollDto {
  @ApiProperty()
  @IsUUID()
  courseId!: string;

  @ApiPropertyOptional({ description: 'Join this cohort of the course at the same time' })
  @IsOptional()
  @IsUUID()
  cohortId?: string;
}

export const PROGRESS_UPDATE_STATUSES = [
  LessonProgressStatus.IN_PROGRESS,
  LessonProgressStatus.COMPLETED,
] as const;

export class UpdateLessonProgressDto {
  @ApiProperty({ enum: PROGRESS_UPDATE_STATUSES })
  @IsIn(PROGRESS_UPDATE_STATUSES)
  status!: (typeof PROGRESS_UPDATE_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Playback position for video lessons, in seconds' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  positionSeconds?: number;
}

export class ListMyEnrollmentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EnrollmentStatus })
  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;
}

export class ListCourseEnrollmentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EnrollmentStatus })
  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;

  @ApiPropertyOptional({ description: 'Matches learner name or email' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
