import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Opaque refresh token returned at login' })
  @IsString()
  @Length(32, 256)
  refreshToken!: string;
}
