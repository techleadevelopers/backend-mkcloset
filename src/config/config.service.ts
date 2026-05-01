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
    const secret = this.nestConfigService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new InternalServerErrorException(
        'A variÃ¡vel de ambiente JWT_SECRET Ã© obrigatÃ³ria.',
      );
    }
    return secret;
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

  get frontendUrl(): string {
    return this.nestConfigService.get<string>('FRONTEND_URL') || '';
  }

  get defaultShopSlug(): string {
    return this.nestConfigService.get<string>('SHOP_SLUG') || 'mkcloset';
  }

  get facebookAppId(): string {
    const value = this.nestConfigService.get<string>('FACEBOOK_APP_ID');
    if (!value) {
      throw new InternalServerErrorException('FACEBOOK_APP_ID não está configurado.');
    }
    return value;
  }

  get facebookAppSecret(): string {
    const value = this.nestConfigService.get<string>('FACEBOOK_APP_SECRET');
    if (!value) {
      throw new InternalServerErrorException('FACEBOOK_APP_SECRET não está configurado.');
    }
    return value;
  }

  get facebookRedirectUri(): string {
    const value = this.nestConfigService.get<string>('FACEBOOK_REDIRECT_URI');
    if (!value) {
      throw new InternalServerErrorException('FACEBOOK_REDIRECT_URI não está configurado.');
    }
    return value;
  }

  // --- Configurações do PagSeguro ---
  get pagSeguroApiUrl(): string {
    return (
      this.nestConfigService.get<string>('PAGSEGURO_API_URL') ||
      'https://sandbox.api.pagseguro.com'
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
    return (
      this.nestConfigService.get<string>('SMTP_HOST') ||
      this.nestConfigService.get<string>('EMAIL_SERVICE_HOST') ||
      ''
    );
  }

  get emailServicePort(): number {
    return (
      this.nestConfigService.get<number>('SMTP_PORT') ||
      this.nestConfigService.get<number>('EMAIL_SERVICE_PORT') ||
      587
    );
  }

  get emailServiceSecure(): boolean {
    const raw =
      this.nestConfigService.get<string>('SMTP_SECURE') ??
      this.nestConfigService.get<string>('EMAIL_SERVICE_SECURE');
    if (raw === undefined) {
      return this.emailServicePort === 465;
    }
    return String(raw).toLowerCase() === 'true';
  }

  get emailServiceUser(): string {
    return (
      this.nestConfigService.get<string>('SMTP_USER') ||
      this.nestConfigService.get<string>('EMAIL_SERVICE_USER') ||
      ''
    );
  }

  get emailServicePass(): string {
    return (
      this.nestConfigService.get<string>('SMTP_PASS') ||
      this.nestConfigService.get<string>('EMAIL_SERVICE_PASS') ||
      ''
    );
  }

  get emailServiceFrom(): string {
    return (
      this.nestConfigService.get<string>('SMTP_FROM') ||
      this.nestConfigService.get<string>('EMAIL_SERVICE_FROM') ||
      this.emailServiceUser ||
      'no-reply@yourdomain.com'
    );
  }
  // -----------------------------------

  get guestSigningSecret(): string {
    const secret = this.nestConfigService.get<string>('GUEST_SIGNING_SECRET');
    if (!secret) {
      throw new InternalServerErrorException(
        'GUEST_SIGNING_SECRET não configurado para assinar guestId.',
      );
    }
    return secret;
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

  get cloudinaryApiKey(): string {
    const value = this.nestConfigService.get<string>('CLOUDINARY_API_KEY');
    if (!value) {
      throw new InternalServerErrorException('CLOUDINARY_API_KEY não está configurado.');
    }
    return value;
  }

  get cloudinaryApiSecret(): string {
    const value = this.nestConfigService.get<string>('CLOUDINARY_API_SECRET');
    if (!value) {
      throw new InternalServerErrorException('CLOUDINARY_API_SECRET não está configurado.');
    }
    return value;
  }

  get cloudinaryCloudName(): string {
    const explicit = this.nestConfigService.get<string>('CLOUDINARY_CLOUD_NAME');
    if (explicit) return explicit;

    const cloudinaryUrl = this.nestConfigService.get<string>('CLOUDINARY_URL');
    if (cloudinaryUrl) {
      const match = cloudinaryUrl.match(/@([^/?#]+)$/);
      if (match?.[1]) return match[1];
    }

    throw new InternalServerErrorException('CLOUDINARY_CLOUD_NAME não está configurado.');
  }
}


