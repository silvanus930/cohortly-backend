import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
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
import { CourseLevel, CoursePricing, CourseStatus } from '../enums/course.enums';

export class CreateCourseDto {
  @ApiProperty({ example: 'Full Stack TypeScript' })
  @IsString()
  @Length(3, 200)
  title!: string;

  @ApiProperty({ description: 'Short pitch shown in the catalog', maxLength: 500 })
  @IsString()
  @Length(10, 500)
  summary!: string;

  @ApiPropertyOptional({ description: 'Long form description, markdown allowed' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string;

  @ApiPropertyOptional({ enum: CourseLevel, default: CourseLevel.BEGINNER })
  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel;

  @ApiPropertyOptional({ enum: CoursePricing, default: CoursePricing.FREE })
  @IsOptional()
  @IsEnum(CoursePricing)
  pricing?: CoursePricing;

  @ApiPropertyOptional({ description: 'Price in minor units, required for paid courses' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  priceCents?: number;

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Admins may assign another instructor' })
  @IsOptional()
  @IsUUID()
  instructorId?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 10 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Length(1, 30, { each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  coverUrl?: string;
}

export class UpdateCourseDto extends PartialType(CreateCourseDto) {}

export class ListManagedCoursesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: CourseStatus })
  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Admins may filter by instructor' })
  @IsOptional()
  @IsUUID()
  instructorId?: string;
}
