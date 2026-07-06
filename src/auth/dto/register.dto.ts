import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @Length(8, 128)
  password!: string;

  @ApiProperty({ example: 'Ada' })
  @IsString()
  @Length(1, 100)
  firstName!: string;

  @ApiProperty({ example: 'Lovelace' })
  @IsString()
  @Length(1, 100)
  lastName!: string;

  @ApiPropertyOptional({ description: 'Referral code of the user who invited you' })
  @IsOptional()
  @IsString()
  @Length(4, 32)
  referralCode?: string;
}
