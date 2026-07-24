import { ApiPropertyOptional } from '@nestjs/swagger';
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
import { CourseLevel, CoursePricing } from '../enums/course.enums';

export const CATALOG_SORTS = ['newest', 'popular', 'title', 'price'] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export class ListCatalogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches title, summary or tags' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Category slug, an alternative to categoryId' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ enum: CourseLevel })
  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel;

  @ApiPropertyOptional({ enum: CoursePricing })
  @IsOptional()
  @IsEnum(CoursePricing)
  pricing?: CoursePricing;

  @ApiPropertyOptional({ description: 'Exact tag match' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  tag?: string;

  @ApiPropertyOptional({ enum: CATALOG_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(CATALOG_SORTS)
  sort: CatalogSort = 'newest';
}

export class RecommendationsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 24, default: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  limit: number = 6;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
