import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const GRANULARITIES = ['day', 'week', 'month'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export class AnalyticsRangeQueryDto {
  @ApiPropertyOptional({ description: 'Inclusive ISO start, defaults to 30 days ago' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Exclusive ISO end, defaults to now' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: GRANULARITIES, default: 'day' })
  @IsOptional()
  @IsIn(GRANULARITIES)
  granularity: Granularity = 'day';
}

export class TopCoursesQueryDto extends AnalyticsRangeQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;
}

export class ResetPerformanceDto {
  @ApiPropertyOptional({ example: 'New contract period' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
