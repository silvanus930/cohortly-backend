import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateFaqDto {
  @ApiProperty({ example: 'Do I need prior experience?' })
  @IsString()
  @Length(5, 300)
  question!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 5000)
  answer!: string;
}

export class UpdateFaqDto extends PartialType(CreateFaqDto) {}
