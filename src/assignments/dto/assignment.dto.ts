import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
import { SubmissionStatus, SubmissionType } from '../enums/assignment.enums';

export class RubricCriterionDto {
  @ApiProperty({ example: 'clarity' })
  @IsString()
  @Length(1, 64)
  id!: string;

  @ApiProperty({ example: 'Code is readable and well structured' })
  @IsString()
  @Length(1, 200)
  criterion!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  maxPoints!: number;
}

export class UpsertAssignmentDto {
  @ApiProperty()
  @IsString()
  @Length(1, 200)
  title!: string;

  @ApiProperty({ description: 'Markdown instructions' })
  @IsString()
  @Length(1, 20000)
  instructions!: string;

  @ApiPropertyOptional({ enum: SubmissionType, default: SubmissionType.TEXT_OR_FILE })
  @IsOptional()
  @IsEnum(SubmissionType)
  submissionType?: SubmissionType;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxPoints?: number;

  @ApiPropertyOptional({ default: 60 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  passingPoints?: number;

  @ApiPropertyOptional({ type: [RubricCriterionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RubricCriterionDto)
  rubric?: RubricCriterionDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  allowResubmission?: boolean;

  @ApiPropertyOptional({ default: 3, description: 'Zero means unlimited' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  maxSubmissions?: number;
}

export class SubmitAssignmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50000)
  text?: string;

  @ApiPropertyOptional({ description: 'Key returned by the upload presign endpoint' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  fileKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  fileUrl?: string;
}

export class RubricScoreDto {
  @ApiProperty()
  @IsString()
  @Length(1, 64)
  criterionId!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(1000)
  points!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class GradeSubmissionDto {
  @ApiPropertyOptional({
    type: [RubricScoreDto],
    description: 'Required when the assignment has a rubric',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RubricScoreDto)
  rubricScores?: RubricScoreDto[];

  @ApiPropertyOptional({ description: 'Total score, used when there is no rubric' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  score?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  feedback?: string;
}

export class ListSubmissionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SubmissionStatus })
  @IsOptional()
  @IsEnum(SubmissionStatus)
  status?: SubmissionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;
}
