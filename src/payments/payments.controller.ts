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
import { CreateCardOrderDto } from './dto/create-card-order.dto';
import type { Request } from 'express';
import { ConfigService } from 'src/config/config.service';
import { createHmac } from 'crypto';

// Interface para o payload do usuário injetado no req.user pelo JwtStrategy
interface RequestUserPayload {
  userId: string;
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

  @Post('pix-charge/:orderId')
  @UseGuards(OptionalJwtAuthGuard)
  async createPixCharge(
    @CurrentUser() user: User | undefined,
    @Param('orderId') orderId: string,
    @Body() body: CreatePixChargeDto,
  ) {
    const userId = user?.id || body.guestId;
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

  @Post('process-card/:orderId')
  @UseGuards(OptionalJwtAuthGuard)
  async processCardPayment(
    @CurrentUser() user: User | undefined,
    @Param('orderId') orderId: string,
    @Body() processPaymentDto: ProcessPaymentDto,
  ) {
    const userId = user?.id;
    return this.paymentsService.processCreditCardPayment(
      orderId,
      userId,
      processPaymentDto,
    );
  }

 //  ENDPOINT: API Order com cartão (transparente)
@Post('card-order/:orderId')
@UseGuards(OptionalJwtAuthGuard)
async processCardOrder(
  @CurrentUser() user: User | undefined,
  @Param('orderId') orderId: string,
  @Body() dto: CreateCardOrderDto,
) {
  const userId = user?.id || dto.guestId;
  if (!userId) {
    throw new BadRequestException('Usuário ou guestId necessário');
  }
  if (!user?.id) {
    this.verifyGuest(dto.guestId, dto.signature);
  }
  // 🔥 CHAMA O MÉTODO QUE JÁ EXISTE NO SERVICE
  return this.paymentsService.processCreditCardPayment(orderId, userId, dto as any);
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