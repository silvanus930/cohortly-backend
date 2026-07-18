import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LessonType } from '../enums/course.enums';

export class CreateLessonDto {
  @ApiProperty({ example: 'Setting up the toolchain' })
  @IsString()
  @Length(2, 200)
  title!: string;

  @ApiProperty({ enum: LessonType })
  @IsEnum(LessonType)
  type!: LessonType;

  @ApiPropertyOptional({ default: 0, maximum: 600 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  durationMinutes?: number;

  @ApiPropertyOptional({ description: 'Video or external resource url' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  contentUrl?: string;

  @ApiPropertyOptional({ description: 'Markdown body for reading lessons' })
  @IsOptional()
  @IsString()
  @MaxLength(50000)
  body?: string;

  @ApiPropertyOptional({ default: false, description: 'Free preview visible without enrolling' })
  @IsOptional()
  @IsBoolean()
  isPreview?: boolean;
}

export class UpdateLessonDto extends PartialType(CreateLessonDto) {}
