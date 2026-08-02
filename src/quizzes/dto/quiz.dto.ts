import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const QUESTION_TYPES = ['SINGLE', 'MULTIPLE', 'TRUE_FALSE'] as const;

export class QuizOptionDto {
  @ApiProperty({ example: 'a' })
  @IsString()
  @Length(1, 64)
  id!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 500)
  text!: string;
}

export class QuizQuestionDto {
  @ApiProperty({ example: 'q1' })
  @IsString()
  @Length(1, 64)
  id!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 2000)
  prompt!: string;

  @ApiProperty({ enum: QUESTION_TYPES })
  @IsIn(QUESTION_TYPES)
  type!: (typeof QUESTION_TYPES)[number];

  @ApiProperty({ type: [QuizOptionDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => QuizOptionDto)
  options!: QuizOptionDto[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  correctOptionIds!: string[];

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  points?: number;

  @ApiPropertyOptional({ description: 'Shown to learners after they answer' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  explanation?: string;
}

export class UpsertQuizDto {
  @ApiProperty()
  @IsString()
  @Length(1, 200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ type: [QuizQuestionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionDto)
  questions!: QuizQuestionDto[];

  @ApiPropertyOptional({ default: 70, description: 'Percent needed to pass' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passingScore?: number;

  @ApiPropertyOptional({ default: 3, description: 'Zero means unlimited' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  maxAttempts?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  timeLimitMinutes?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  shuffleQuestions?: boolean;
}

export class QuizAnswerDto {
  @ApiProperty()
  @IsString()
  @Length(1, 64)
  questionId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  selectedOptionIds!: string[];
}

export class SubmitQuizAttemptDto {
  @ApiProperty({ type: [QuizAnswerDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerDto)
  answers!: QuizAnswerDto[];
}
