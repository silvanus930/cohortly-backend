import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

export class RevokeCertificateDto {
  @ApiProperty({ example: 'Issued to the wrong learner' })
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class ListCertificatesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;
}
