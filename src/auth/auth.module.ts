import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { FacebookAuthController } from './facebook-auth.controller';
import { UsersModule } from 'src/users/users.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { ConfigModule } from 'src/config/config.module';
import { PrismaModule } from 'src/prisma/prisma.module'; // Importe do pacote oficial
import { NotificationsModule } from 'src/notifications/notifications.module';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    // Importa o ConfigModule para que o ConfigService esteja disponível
    NestConfigModule,
    ConfigModule,
    PrismaModule,
    NotificationsModule,
    JwtModule.registerAsync({
      // Importa o ConfigModule aqui para que o useFactory tenha acesso ao ConfigService
      imports: [NestConfigModule],
      useFactory: (configService: ConfigService) => ({
        // Use o método 'get' do ConfigService para acessar as variáveis
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '60m',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, FacebookAuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}

