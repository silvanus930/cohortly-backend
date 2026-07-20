import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Length, Matches, Min } from 'class-validator';

export const UPLOAD_KINDS = ['image', 'document', 'video'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export class UploadFileDto {
  @ApiProperty({ example: 'syllabus.pdf' })
  @IsString()
  @Length(1, 200)
  fileName!: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @Matches(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i, { message: 'mimeType must look like type/subtype' })
  mimeType!: string;

  @ApiProperty({ description: 'Exact size of the file in bytes' })
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}

export class PresignUploadDto extends UploadFileDto {
  @ApiProperty({ enum: UPLOAD_KINDS })
  @IsIn(UPLOAD_KINDS)
  kind!: UploadKind;
}
