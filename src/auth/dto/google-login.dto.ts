import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({ description: 'ID token obtained from Google Identity Services' })
  @IsString()
  @MaxLength(4096)
  idToken!: string;

  @ApiPropertyOptional({ description: 'Referral code applied when a new account is created' })
  @IsOptional()
  @IsString()
  @Length(4, 32)
  referralCode?: string;
}
