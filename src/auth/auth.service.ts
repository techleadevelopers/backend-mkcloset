import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ConfigService } from 'src/config/config.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { UsersService } from 'src/users/users.service';
import { RegisterUserDto } from './dto/register-user.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private notificationsService: NotificationsService,
    private configService: ConfigService,
  ) {}

  async register(registerUserDto: RegisterUserDto) {
    const hashedPassword = await bcrypt.hash(registerUserDto.password, 10);
    const user = await this.usersService.create({
      ...registerUserDto,
      password: hashedPassword,
    });
    const { password, ...result } = user;
    return result;
  }

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && (await bcrypt.compare(pass, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: User) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  private buildPasswordResetFingerprint(passwordHash: string) {
    return passwordHash.slice(-12);
  }

  private normalizeFrontendUrl(url: string) {
    const trimmed = url.trim().replace(/\/+$/, '');
    if (!trimmed) {
      return 'https://www.bymkcloset.com.br';
    }
    const normalizedForCheck = trimmed.toLowerCase();
    if (
      normalizedForCheck.includes('localhost') ||
      normalizedForCheck.includes('127.0.0.1') ||
      normalizedForCheck.includes('0.0.0.0')
    ) {
      return 'https://www.bymkcloset.com.br';
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return `https://${trimmed}`;
  }

  private buildResetUrl(token: string) {
    const frontendUrl = this.normalizeFrontendUrl(
      this.configService.frontendUrl || 'https://www.bymkcloset.com.br',
    );
    const resetUrl = `${frontendUrl}/login?mode=reset-password&token=${encodeURIComponent(token)}`;
    this.logger.log(`[forgot-password] reset url generated: ${resetUrl}`);
    return resetUrl;
  }

  async requestPasswordReset(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    this.logger.log(
      `[forgot-password] request received for ${normalizedEmail}`,
    );
    const user = await this.usersService.findByEmail(normalizedEmail);

    if (!user) {
      this.logger.warn(
        `[forgot-password] no user found for ${normalizedEmail}`,
      );
      return {
        ok: true,
        message:
          'Se existir uma conta com este e-mail, enviaremos as instrucoes de recuperacao.',
      };
    }

    const token = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        purpose: 'password-reset',
        fp: this.buildPasswordResetFingerprint(user.password),
      },
      {
        secret: this.configService.jwtSecret,
        expiresIn: '30m',
      },
    );

    const resetUrl = this.buildResetUrl(token);
    this.logger.log(
      `[forgot-password] user found ${user.id} (${user.email}), sending reset email`,
    );

    await this.notificationsService.sendPasswordResetEmail(
      user.email,
      resetUrl,
      user.name,
    );

    this.logger.log(
      `[forgot-password] reset email successfully requested for ${user.email}`,
    );

    return {
      ok: true,
      message:
        'Se existir uma conta com este e-mail, enviaremos as instrucoes de recuperacao.',
    };
  }

  async resetPassword(token: string, password: string) {
    try {
      this.logger.log('[reset-password] token validation started');
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        email: string;
        purpose: string;
        fp: string;
      }>(token, {
        secret: this.configService.jwtSecret,
      });

      if (payload.purpose !== 'password-reset') {
        throw new BadRequestException(
          'Token invalido para redefinicao de senha.',
        );
      }

      const user = await this.usersService.findByEmail(payload.email);
      if (!user || user.id !== payload.sub) {
        throw new BadRequestException('Token invalido ou expirado.');
      }

      if (
        this.buildPasswordResetFingerprint(user.password) !== payload.fp
      ) {
        throw new BadRequestException('Token invalido ou expirado.');
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await this.usersService.update(user.id, { password: hashedPassword });
      this.logger.log(
        `[reset-password] password updated for ${user.id} (${user.email})`,
      );

      return {
        ok: true,
        message: 'Senha redefinida com sucesso.',
      };
    } catch (error) {
      this.logger.error(
        `[reset-password] failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Token invalido ou expirado.');
    }
  }
}
