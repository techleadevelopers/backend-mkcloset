import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Param,
  BadRequestException,
  Logger,
  Req,
  Headers,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { OptionalJwtAuthGuard } from 'src/auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CreatePixChargeDto } from './dto/create-pix-charge.dto';
import { ProcessPaymentDto } from './dto/process-payment.dto';
import type { Request } from 'express'; // CORREÇÃO AQUI: Adicionado 'type' à importação de Request
import { ConfigService } from 'src/config/config.service';
import { createHmac } from 'crypto';

// Interface para o payload do usuário injetado no req.user pelo JwtStrategy
interface RequestUserPayload {
  userId: string; // O ID do usuário (sub do JWT)
}

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
  ) {}

  private extractWebhookSignature(
    headers: Record<string, string | string[] | undefined>,
  ): string {
    const candidates = [
      headers['x-pagseguro-signature'],
      headers['x-pagbank-signature'],
      headers['x-signature'],
    ];

    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (Array.isArray(value) && value[0]?.trim()) {
        return value[0].trim();
      }
    }

    return '';
  }

  private extractWebhookIdentifier(payload: any): string | null {
    const candidates = [
      payload?.id,
      payload?.checkout_id,
      payload?.order_id,
      payload?.payment_id,
      payload?.charge_id,
      payload?.payment?.id,
      payload?.payment?.checkout_id,
      payload?.payment?.order_id,
      payload?.data?.id,
      payload?.data?.checkout_id,
    ];

    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private verifyGuest(guestId?: string, signature?: string) {
    if (!guestId) {
      throw new BadRequestException('guestId é obrigatório para convidados.');
    }
    const expected = createHmac('sha256', this.configService.guestSigningSecret)
      .update(guestId)
      .digest('hex');
    if (expected !== signature) {
      throw new BadRequestException('Assinatura de guestId inválida.');
    }
  }

  @Post('initiate-checkout/:orderId')
  @UseGuards(OptionalJwtAuthGuard)
  async initiatePagSeguroCheckout(
    @CurrentUser() user: User | undefined,
    @Param('orderId') orderId: string,
    @Body() body: { guestId?: string; signature?: string },
  ) {
    const requesterId = user?.id ?? body?.guestId;
    if (!requesterId) {
      throw new BadRequestException(
        'Usuário ou ID de convidado não fornecido.',
      );
    }
    if (!user?.id) {
      this.verifyGuest(
        body?.guestId,
        body?.signature || (body as any)?.['x-guest-signature'],
      );
    }
    return this.paymentsService.initiatePagSeguroRedirectCheckout(
      requesterId,
      orderId,
    );
  }

  // NOVO ENDPOINT: para criar cobrança PIX
  @Post('pix-charge/:orderId')
  @UseGuards(OptionalJwtAuthGuard) // ALTERADO: Usa o guarda opcional para permitir convidados
  async createPixCharge(
    @CurrentUser() user: User | undefined, // ALTERADO: Usa o decorador CurrentUser para obter o usuário (ou undefined)
    @Param('orderId') orderId: string,
    @Body() body: CreatePixChargeDto, // NOVO: Adicionado para receber o corpo da requisição, que pode conter o guestId
  ) {
    const userId = user?.id || body.guestId; // NOVO: Obtém o ID do usuário autenticado, ou o guestId do corpo da requisição
    if (!userId) {
      throw new BadRequestException(
        'Usuário ou ID de convidado não fornecido.',
      );
    }
    if (!user?.id) {
      this.verifyGuest(
        body.guestId,
        (body as any)?.signature || (body as any)?.['x-guest-signature'],
      );
    }
    return this.paymentsService.createPixCharge(orderId, userId);
  }

  // NOVO ENDPOINT: para processar pagamentos diretos com cartão
  @Post('process-card/:orderId')
  @UseGuards(OptionalJwtAuthGuard)
  async processCardPayment(
    @CurrentUser() user: User | undefined,
    @Param('orderId') orderId: string,
    @Body() processPaymentDto: ProcessPaymentDto,
  ) {
    const userId = user?.id; // Para pagamentos com cartão, geralmente é um usuário logado ou o guestId é parte do DTO
    // Se o guestId for necessário e não vier do token, ele deve ser incluído no processPaymentDto
    return this.paymentsService.processCreditCardPayment(
      orderId,
      userId,
      processPaymentDto,
    );
  }

  @Get('card/session')
  async createCardSession() {
    return this.paymentsService.createCardSession();
  }

  @Get('card/public-key')
  async getCardPublicKey() {
    return this.paymentsService.getCardPublicKey();
  }

  @Post('webhook/pagseguro')
  async handlePagSeguroWebhook(
    @Body() payload: any,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: Request,
  ) {
    this.logger.debug('Webhook do PagSeguro recebido.');
    const signature = this.extractWebhookSignature(headers);
    const pagSeguroCheckoutId = this.extractWebhookIdentifier(payload);

    if (!pagSeguroCheckoutId) {
      this.logger.error(
        'Payload do webhook PagSeguro inválido: ID do checkout ausente.',
      );
      throw new BadRequestException(
        'Payload do webhook PagSeguro inválido: ID do checkout ausente.',
      );
    }

    // Fazendo um casting de 'req' para 'any' para acessar 'rawBody'.
    // Idealmente, você estenderia a interface 'Request' do Express em um arquivo de declaração global (.d.ts)
    // para incluir 'rawBody' de forma type-safe.
    const rawBody = (req as any).rawBody
      ? (req as any).rawBody.toString('utf8')
      : JSON.stringify(payload);

    return this.paymentsService.handlePagSeguroNotification(
      pagSeguroCheckoutId,
      signature,
      rawBody,
      payload,
    );
  }

  // 🔥 NOVO ENDPOINT: Cancelar pedidos expirados (pode ser chamado manualmente ou por cron job)
  @Post('cancel-expired')
  @UseGuards(JwtAuthGuard)
  async cancelExpiredOrders() {
    this.logger.debug('Requisição para cancelar pedidos expirados recebida.');
    const result = await this.paymentsService.cancelExpiredPaymentIntents();
    return {
      message: 'Verificação de pedidos expirados concluída',
      cancelledCount: result.cancelledCount,
      expiredIntentsFound: result.expiredCount,
    };
  }
}

