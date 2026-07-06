import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '482913', description: 'Six digit code sent by email' })
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'code must be six digits' })
  code!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @Length(8, 128)
  newPassword!: string;
}
