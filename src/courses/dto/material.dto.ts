import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { UploadFileDto } from '../../storage/dto/presign-upload.dto';

export class CreateMaterialDto extends UploadFileDto {
  @ApiProperty({ example: 'Lecture slides' })
  @IsString()
  @Length(1, 200)
  title!: string;
}
