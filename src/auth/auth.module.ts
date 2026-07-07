import { Module } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { authConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OneTimeCode } from './entities/one-time-code.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { GoogleAuthService } from './google-auth.service';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SuperadminBootstrapService } from './superadmin-bootstrap.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forFeature([RefreshToken, OneTimeCode]),
    JwtModule.registerAsync({
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>) => ({
        secret: config.accessSecret,
        signOptions: { expiresIn: config.accessTtlSeconds },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    PasswordService,
    OtpService,
    GoogleAuthService,
    JwtStrategy,
    SuperadminBootstrapService,
  ],
  exports: [AuthService, TokenService, PasswordService],
})
export class AuthModule {}
