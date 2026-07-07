import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type Request } from 'express';
import { type User } from '../users/entities/user.entity';
import { toUserDto, UserDto } from '../users/users.mapper';
import { type AuthResponse, AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { type RequestContext } from './interfaces/jwt-payload.interface';

const SENSITIVE_LIMIT = { default: { limit: 10, ttl: 60_000 } };

export function requestContext(request: Request): RequestContext {
  return { userAgent: request.headers['user-agent'], ipAddress: request.ip };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(SENSITIVE_LIMIT)
  @Post('register')
  @ApiOperation({ summary: 'Create a learner account' })
  register(@Body() dto: RegisterDto, @Req() request: Request): Promise<AuthResponse> {
    return this.authService.register(dto, requestContext(request));
  }

  @Public()
  @Throttle(SENSITIVE_LIMIT)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() request: Request): Promise<AuthResponse> {
    return this.authService.login(dto, requestContext(request));
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in or sign up with a Google ID token' })
  google(@Body() dto: GoogleLoginDto, @Req() request: Request): Promise<AuthResponse> {
    return this.authService.googleLogin(dto, requestContext(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token for a new token pair' })
  refresh(@Body() dto: RefreshTokenDto, @Req() request: Request): Promise<AuthResponse> {
    return this.authService.refresh(dto.refreshToken, requestContext(request));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.authService.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke every refresh token of the current user' })
  logoutAll(@CurrentUser('id') userId: string): Promise<void> {
    return this.authService.logoutEverywhere(userId);
  }

  @Public()
  @Throttle(SENSITIVE_LIMIT)
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Email a six digit reset code if the account exists' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If the email is registered, a reset code has been sent' };
  }

  @Public()
  @Throttle(SENSITIVE_LIMIT)
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.authService.resetPassword(dto);
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(@CurrentUser() user: User, @Body() dto: ChangePasswordDto): Promise<void> {
    return this.authService.changePassword(user, dto);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOkResponse({ type: UserDto })
  me(@CurrentUser() user: User): UserDto {
    return toUserDto(user);
  }

  @ApiBearerAuth()
  @Patch('me')
  @ApiOkResponse({ type: UserDto })
  updateMe(@CurrentUser() user: User, @Body() dto: UpdateProfileDto): Promise<UserDto> {
    return this.authService.updateProfile(user, dto);
  }
}
