// src/config/config.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
  constructor(private nestConfigService: NestConfigService) {}

  get databaseUrl(): string {
    return this.nestConfigService.get<string>('DATABASE_URL') || '';
  }

  get jwtSecret(): string {
    return this.nestConfigService.get<string>('JWT_SECRET') || 'supersecretkey';
  }

  get jwtExpiresIn(): string {
    return this.nestConfigService.get<string>('JWT_EXPIRES_IN') || '1h';
  }

  get stripeSecretKey(): string {
    return this.nestConfigService.get<string>('STRIPE_SECRET_KEY') || '';
  }

  get correiosApiUrl(): string {
    return this.nestConfigService.get<string>('CORREIOS_API_URL') || '';
  }

  get backendUrl(): string {
    return this.nestConfigService.get<string>('BACKEND_URL') || '';
  }

  // --- Configurações do PagSeguro ---
  get pagSeguroApiUrl(): string {
    return (
      this.nestConfigService.get<string>('PAGSEGURO_API_URL') ||
      'https://api.pagseguro.com'
    );
  }

  get pagSeguroApiToken(): string {
    const token = this.nestConfigService.get<string>('PAGSEGURO_API_TOKEN');
    if (!token) {
      throw new InternalServerErrorException(
        'A variável de ambiente PAGSEGURO_API_TOKEN não está definida.',
      );
    }
    return token;
  }

  // NOVO: Segredo para verificação de assinatura de webhook do PagSeguro
  get pagSeguroWebhookSecret(): string {
    const secret = this.nestConfigService.get<string>(
      'PAGSEGURO_WEBHOOK_SECRET',
    );
    if (!secret) {
      console.warn(
        'A variável PAGSEGURO_WEBHOOK_SECRET não está definida. Webhooks ficam expostos a falsificações.',
      );
      throw new InternalServerErrorException(
        'A variável de ambiente PAGSEGURO_WEBHOOK_SECRET é obrigatória para garantir a validade das notificações.',
      );
    }
    return secret;
  }
  // -----------------------------------

  // --- Configurações do Provedor de E-mail ---
  get emailServiceHost(): string {
    return this.nestConfigService.get<string>('EMAIL_SERVICE_HOST') || '';
  }

  get emailServicePort(): number {
    return this.nestConfigService.get<number>('EMAIL_SERVICE_PORT') || 587;
  }

  get emailServiceUser(): string {
    return this.nestConfigService.get<string>('EMAIL_SERVICE_USER') || '';
  }

  get emailServicePass(): string {
    return this.nestConfigService.get<string>('EMAIL_SERVICE_PASS') || '';
  }

  get emailServiceFrom(): string {
    return (
      this.nestConfigService.get<string>('EMAIL_SERVICE_FROM') ||
      'no-reply@yourdomain.com'
    );
  }
  // -----------------------------------

  // --- Configurações da Ferramenta Antifraude ---
  get antifraudApiUrl(): string {
    return this.nestConfigService.get<string>('ANTIFRAUD_API_URL') || '';
  }

  get antifraudApiKey(): string {
    return this.nestConfigService.get<string>('ANTIFRAUD_API_KEY') || '';
  }
  // -----------------------------------
}
