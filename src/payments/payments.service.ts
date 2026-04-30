import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { OrdersService } from 'src/orders/orders.service';
import {
  OrderStatus,
  TransactionType,
  Order,
  User,
  Prisma,
  Transaction,
} from '@prisma/client';
import { PagSeguroService } from './providers/pagseguro.service';
import { PixChargeResponseDto } from './dto/create-pix-charge.dto';
import { ProcessPaymentDto } from './dto/process-payment.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { ConfigService } from 'src/config/config.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { AntifraudService } from 'src/antifraud/antifraud.service';
import * as crypto from 'crypto';

type OrderWithDetails = Order & {
  user?: User | null;
  items: {
    product: {
      id: string;
      name: string;
      price: Prisma.Decimal;
    };
    quantity: number;
    price: Prisma.Decimal;
  }[];
};

type PaymentIntentGateway =
  | 'PAGSEGURO_PIX'
  | 'PAGSEGURO_CARD'
  | 'PAGSEGURO_REDIRECT';
type PaymentIntentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

type PaymentIntentRecord = {
  id: string;
  userId?: string | null;
  orderId: string;
  gateway: PaymentIntentGateway;
  status: PaymentIntentStatus;
  amount: Prisma.Decimal | Decimal;
  currency: string;
  referenceId: string;
  idempotencyKey?: string | null;
  externalOrderId?: string | null;
  externalChargeId?: string | null;
  transactionRef?: string | null;
  qrCodeText?: string | null;
  qrCodeUrl?: string | null;
  expiresAt?: Date | null;
  lastWebhookPayload?: Prisma.JsonValue | null;
  description?: string | null;
  metadata?: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
};

const PAYMENT_TRANSITIONS: Record<
  PaymentIntentStatus,
  PaymentIntentStatus[]
> = {
  CREATED: ['PENDING'],
  PENDING: ['CONFIRMED', 'FAILED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: [],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly pagSeguroService: PagSeguroService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly antifraudService: AntifraudService,
  ) {}

  async createPixCharge(
    orderId: string,
    userId: string,
  ): Promise<PixChargeResponseDto> {
    const order = await this.getPayableOrder(orderId, userId);
    const existingIntent = await this.findPaymentIntent(
      order.id,
      'PAGSEGURO_PIX',
    );

    if (existingIntent) {
      this.logger.log(
        `Intent PIX jÃ¡ existe para o pedido ${order.id}. Reutilizando recurso existente.`,
      );
      if (
        existingIntent.externalOrderId &&
        (!existingIntent.qrCodeUrl || !existingIntent.qrCodeText)
      ) {
        try {
          const providerDetails = await this.pagSeguroService.getOrderDetails(
            existingIntent.externalOrderId,
          );
          const refreshedIntent = await this.updatePaymentIntent(
            existingIntent.id,
            {
              externalChargeId:
                providerDetails.qr_codes?.[0]?.id ??
                existingIntent.externalChargeId,
              transactionRef:
                providerDetails.qr_codes?.[0]?.text ??
                existingIntent.transactionRef,
              qrCodeText:
                providerDetails.qr_codes?.[0]?.text ??
                existingIntent.qrCodeText,
              qrCodeUrl:
                providerDetails.qr_codes?.[0]?.links?.find(
                  (link: any) =>
                    link.rel === 'QR_CODE_IMAGE' || link.rel === 'QRCODE.PNG',
                )?.href ?? existingIntent.qrCodeUrl,
              expiresAt: providerDetails.qr_codes?.[0]?.expiration_date
                ? new Date(providerDetails.qr_codes[0].expiration_date)
                : existingIntent.expiresAt,
            },
          );
          return this.buildPixResponseFromIntent(refreshedIntent);
        } catch (error) {
          this.logger.warn(
            `Falha ao atualizar dados PIX do intent ${existingIntent.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      return this.buildPixResponseFromIntent(existingIntent);
    }

    const { customer, shippingAddress, items } =
      this.buildPagSeguroPayload(order);
    const antifraudResult = await this.runAntifraud(order, customer, 'PIX');
    const backendUrl = this.requireBackendUrl();

    const intent = await this.claimPaymentIntent({
      order,
      userId,
      gateway: 'PAGSEGURO_PIX',
      description: `Cobrança PIX para Pedido #${order.id}`,
      metadata: { paymentMethod: 'PIX' },
    });

    try {
      const pagSeguroResponse =
        await this.pagSeguroService.createPagSeguroPixCharge(
          {
            orderId: order.id,
            amount: order.totalAmount,
            description: `Pagamento do Pedido #${order.id} na MKCloset`,
            customer,
            shippingAddress,
            shippingService: order.shippingService,
            shippingPrice: order.shippingPrice,
            items,
          },
          backendUrl,
        );

      const updatedIntent = await this.updatePaymentIntent(intent.id, {
        status: 'PENDING',
        externalOrderId: pagSeguroResponse.transactionId,
        externalChargeId: pagSeguroResponse.chargeId ?? null,
        transactionRef: pagSeguroResponse.brCode,
        qrCodeText: pagSeguroResponse.brCode,
        qrCodeUrl: pagSeguroResponse.qrCodeImage,
        expiresAt: pagSeguroResponse.expiresAt
          ? new Date(pagSeguroResponse.expiresAt)
          : null,
        metadata: {
          ...(intent.metadata as object | null),
          providerStatus: pagSeguroResponse.status,
        },
      });

      await this.syncTransactionFromIntent(
        order,
        updatedIntent,
        antifraudResult.status,
      );

      return this.buildPixResponseFromIntent(updatedIntent);
    } catch (error) {
      await this.updatePaymentIntent(intent.id, {
        status: 'FAILED',
        metadata: {
          ...(intent.metadata as object | null),
          error: (error as Error).message,  // <-- CORRIGIDO
        },
      });
      throw this.rethrowProviderError(
        error,
        'Falha ao iniciar o processo de pagamento PIX com PagSeguro.',
      );
    }
  }

  async processCreditCardPayment(
    orderId: string,
    userId: string | undefined,
    processPaymentDto: ProcessPaymentDto,
  ): Promise<any> {
    const { cardToken, cardHolderName, cardCpf, cardInstallments, cardBrand } =
      processPaymentDto;

    if (!cardToken || !cardHolderName || !cardCpf) {
      throw new BadRequestException(
        'Dados do carão incompletos para processamento direto.',
      );
    }

    const order = await this.getPayableOrder(orderId, userId);
    const existingIntent = await this.findPaymentIntent(
      order.id,
      'PAGSEGURO_CARD',
    );

    if (existingIntent) {
      this.logger.log(
        `Intent de cartão já¡ existe para o pedido ${order.id}. Reutilizando recurso existente.`,
      );
      return this.buildCardResponseFromIntent(existingIntent);
    }

    const { customer, shippingAddress, items } =
      this.buildPagSeguroPayload(order);
    const antifraudResult = await this.runAntifraud(
      order,
      customer,
      'CREDIT_CARD',
      {
        brand: cardBrand,
        installments: cardInstallments,
      },
    );
    const backendUrl = this.requireBackendUrl();

    const intent = await this.claimPaymentIntent({
      order,
      userId,
      gateway: 'PAGSEGURO_CARD',
      description: `Pagamento com Cartão de Crédito para Pedido #${order.id}`,
      metadata: {
        paymentMethod: 'CREDIT_CARD',
        cardBrand: cardBrand ?? null,
        installments: cardInstallments ?? 1,
      },
    });

    try {
      const pagSeguroResponse =
        await this.pagSeguroService.processDirectCreditCardPayment(
          {
            orderId: order.id,
            amount: order.totalAmount,
            description: `Pagamento do Pedido #${order.id} na MKCloset`,
            customer,
            shippingAddress,
            shippingService: order.shippingService,
            shippingPrice: order.shippingPrice,
            items,
            cardDetails: {
              token: cardToken,
              holderName: cardHolderName,
              cpf: cardCpf,
              installments: cardInstallments,
            },
          },
          backendUrl,
        );

      const normalizedStatus = this.mapExternalStatusToIntentStatus(
        pagSeguroResponse.status,
      );
      const updatedIntent = await this.updatePaymentIntent(intent.id, {
        status: normalizedStatus,
        externalOrderId: pagSeguroResponse.transactionId,
        externalChargeId: pagSeguroResponse.transactionRef ?? null,
        transactionRef: pagSeguroResponse.transactionRef ?? null,
        metadata: {
          ...(intent.metadata as object | null),
          providerStatus: pagSeguroResponse.status,
        },
      });

      await this.syncTransactionFromIntent(
        order,
        updatedIntent,
        antifraudResult.status,
      );

      if (updatedIntent.status === 'CONFIRMED') {
        await this.markOrderPaid(order);
      }

      return this.buildCardResponseFromIntent(updatedIntent);
    } catch (error) {
      await this.updatePaymentIntent(intent.id, {
        status: 'FAILED',
        metadata: {
          ...(intent.metadata as object | null),
          error: (error as Error).message,  // <-- CORRIGIDO
        },
      });
      throw this.rethrowProviderError(
        error,
        'Falha ao processar pagamento com cartão de crédito.',
      );
    }
  }

  async initiatePagSeguroRedirectCheckout(
    userId: string | undefined,
    orderId: string,
  ): Promise<{ redirectUrl: string; paymentIntentId: string }> {
    const order = await this.getPayableOrder(orderId, userId);
    const existingIntent = await this.findPaymentIntent(
      order.id,
      'PAGSEGURO_REDIRECT',
    );

    if (existingIntent) {
      this.logger.log(
        `Intent de checkout redirecionado jÃ¡ existe para o pedido ${order.id}. Reutilizando recurso existente.`,
      );
      return this.buildRedirectResponseFromIntent(existingIntent);
    }

    const { customer, shippingAddress, items } =
      this.buildPagSeguroPayload(order);
    const antifraudResult = await this.runAntifraud(
      order,
      customer,
      'REDIRECT_CHECKOUT',
    );
    const backendUrl = this.requireBackendUrl();

    const intent = await this.claimPaymentIntent({
      order,
      userId,
      gateway: 'PAGSEGURO_REDIRECT',
      description: `Checkout PagSeguro para Pedido #${order.id}`,
      metadata: { paymentMethod: 'REDIRECT_CHECKOUT' },
    });

    try {
      const pagSeguroResponse =
        await this.pagSeguroService.createPagSeguroCheckoutRedirect(
          {
            orderId: order.id,
            amount: order.totalAmount,
            description: `Pagamento do Pedido #${order.id} na MKCloset`,
            customer,
            shippingAddress,
            shippingService: order.shippingService,
            shippingPrice: order.shippingPrice,
            items,
          },
          backendUrl,
        );

      const updatedIntent = await this.updatePaymentIntent(intent.id, {
        status: 'CREATED',
        externalOrderId: pagSeguroResponse.pagSeguroCheckoutId,
        transactionRef: pagSeguroResponse.redirectUrl,
        metadata: {
          ...(intent.metadata as object | null),
          providerStatus: 'PENDING_REDIRECT',
        },
      });

      await this.syncTransactionFromIntent(
        order,
        updatedIntent,
        antifraudResult.status,
      );

      return this.buildRedirectResponseFromIntent(updatedIntent);
    } catch (error) {
      await this.updatePaymentIntent(intent.id, {
        status: 'FAILED',
        metadata: {
          ...(intent.metadata as object | null),
          error: (error as Error).message,  // <-- CORRIGIDO
        },
      });
      throw this.rethrowProviderError(
        error,
        'Falha ao iniciar o processo de pagamento com PagSeguro.',
      );
    }
  }

  async createCardSession(): Promise<{ sessionId: string }> {
    return { sessionId: await this.pagSeguroService.createSession() };
  }

  async getCardPublicKey(): Promise<{ publicKey: string }> {
    return { publicKey: await this.pagSeguroService.getPublicKey() };
  }

  async handlePagSeguroNotification(
    pagSeguroCheckoutId: string,
    signature: string,
    rawBody: string,
    payload: any,
  ) {
    this.logger.log(
      `[PaymentsService] Webhook do PagSeguro recebido para checkout/order ID: ${pagSeguroCheckoutId}`,
    );

    const webhookSecret = this.configService.pagSeguroWebhookSecret;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (signature !== expectedSignature) {
      this.logger.error(
        `[PaymentsService] Assinatura do webhook invÃ¡lida para ${pagSeguroCheckoutId}.`,
      );
      throw new UnauthorizedException('Assinatura do webhook invÃ¡lida.');
    }

    const intent = await this.findPaymentIntentByExternalId(pagSeguroCheckoutId);
    if (!intent) {
      this.logger.warn(
        `Webhook recebido para ${pagSeguroCheckoutId}, mas nenhum payment intent correspondente foi encontrado.`,
      );
      throw new NotFoundException(
        'Payment intent não encontrado para o identificador recebido.',
      );
    }

    const providerDetails = await this.fetchProviderDetails(intent);
    const providerStatus =
      providerDetails.status ?? providerDetails.charges?.[0]?.status ?? 'PENDING';
    const desiredState = this.mapExternalStatusToIntentStatus(providerStatus);
    const nextState = this.applyTransition(intent.status, desiredState);

    const updatedIntent = await this.updatePaymentIntent(intent.id, {
      status: nextState,
      externalChargeId:
        providerDetails.charges?.[0]?.id ??
        providerDetails.qr_codes?.[0]?.id ??
        intent.externalChargeId,
      transactionRef:
        providerDetails.charges?.[0]?.id ??
        providerDetails.qr_codes?.[0]?.text ??
        intent.transactionRef,
      qrCodeText:
        providerDetails.qr_codes?.[0]?.text ?? intent.qrCodeText ?? null,
      qrCodeUrl:
        providerDetails.qr_codes?.[0]?.links?.find(
          (link: any) =>
            link.rel === 'QR_CODE_IMAGE' || link.rel === 'QRCODE.PNG',
        )?.href ??
        intent.qrCodeUrl ??
        null,
      expiresAt: providerDetails.qr_codes?.[0]?.expiration_date
        ? new Date(providerDetails.qr_codes[0].expiration_date)
        : intent.expiresAt,
      lastWebhookPayload: payload,
      metadata: {
        ...(intent.metadata as object | null),
        providerStatus,
      },
    });

    const order = await this.ordersService.findOneById(intent.orderId);
    await this.syncTransactionFromIntent(order, updatedIntent);

    if (updatedIntent.status === 'CONFIRMED') {
      await this.markOrderPaid(order);
    } else if (
      updatedIntent.status === 'FAILED' ||
      updatedIntent.status === 'CANCELLED' ||
      updatedIntent.status === 'EXPIRED'
    ) {
      await this.prisma.order.update({
        where: { id: intent.orderId },
        data: { status: OrderStatus.CANCELLED },
      });
    }

    return { message: 'Status do pagamento atualizado com sucesso' };
  }

  private async getPayableOrder(
    orderId: string,
    requesterId?: string,
  ): Promise<OrderWithDetails> {
    const order: OrderWithDetails = await this.ordersService.findOneById(orderId);

    if (!order) {
      throw new NotFoundException(`Pedido com ID ${orderId} não encontrado.`);
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'O pedido jÃ¡ foi pago ou estÃ¡ em outro status.',
      );
    }

    this.ensureOrderOwnership(order, requesterId);
    return order;
  }

  private requireBackendUrl(): string {
    const backendUrl = this.configService.backendUrl?.trim();
    if (!backendUrl) {
      throw new InternalServerErrorException(
        'A variável de ambiente BACKEND_URL não está definida.',
      );
    }
    try {
      const parsedUrl = new URL(backendUrl);
      const apiPath = parsedUrl.pathname.includes('/api')
        ? parsedUrl.pathname.slice(
            0,
            parsedUrl.pathname.indexOf('/api') + '/api'.length,
          )
        : '/api';

      return `${parsedUrl.origin}${apiPath}`.replace(/\/+$/, '');
    } catch {
      throw new InternalServerErrorException(
        'A variável de ambiente BACKEND_URL é inválida.',
      );
    }
  }

  private async runAntifraud(
    order: OrderWithDetails,
    customer: {
      email: string;
      fullName: string;
      phone?: string;
      cpf?: string;
    },
    paymentMethod: string,
    cardDetails?: { brand?: string; installments?: number },
  ) {
    const antifraudResult = await this.antifraudService.analyzeTransaction({
      orderId: order.id,
      amount: order.totalAmount.toNumber(),
      customerEmail: customer.email,
      customerCpf: customer.cpf,
      paymentMethod,
      items: order.items.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        price: item.price.toNumber(),
      })),
      ...(cardDetails ? { cardDetails } : {}),
    });

    if (antifraudResult.status === 'DENIED') {
      throw new BadRequestException(
        'Transação negada pela análise antifraude.',
      );
    }

    return antifraudResult;
  }

  private paymentIntentDelegate() {
    return (this.prisma as any).paymentIntent;
  }

  private buildReferenceId(orderId: string, gateway: PaymentIntentGateway) {
    return `${gateway}:${orderId}`;
  }

  private buildIdempotencyKey(orderId: string, gateway: PaymentIntentGateway) {
    return `${gateway.toLowerCase()}:${orderId}`;
  }

  private async findPaymentIntent(
  orderId: string,
  gateway: PaymentIntentGateway,
): Promise<PaymentIntentRecord | null> {
  const [intent] = await this.prisma.$queryRaw<PaymentIntentRecord[]>(
    Prisma.sql`
      SELECT *
      FROM "PaymentIntent"
      WHERE "orderId" = ${orderId}
        AND "gateway" = ${gateway}
      ORDER BY "createdAt" DESC
      LIMIT 1
    `,
  );

  return intent ?? null;
}

  private async findPaymentIntentByExternalId(
    externalOrderId: string,
  ): Promise<PaymentIntentRecord | null> {
    const [intent] = await this.prisma.$queryRaw<PaymentIntentRecord[]>(
      Prisma.sql`
        SELECT *
        FROM "PaymentIntent"
        WHERE "externalOrderId" = ${externalOrderId}
        ORDER BY "createdAt" DESC
        LIMIT 1
      `,
    );

    return intent ?? null;
  }

  private async claimPaymentIntent(params: {
  order: OrderWithDetails;
  userId?: string;
  gateway: PaymentIntentGateway;
  description: string;
  metadata?: Prisma.JsonValue;
}): Promise<PaymentIntentRecord> {
  const { order, userId, gateway, description, metadata } = params;
  const existingIntent = await this.findPaymentIntent(order.id, gateway);

  if (existingIntent) {
    return existingIntent;
  }

  const [intent] = await this.prisma.$queryRaw<PaymentIntentRecord[]>(
    Prisma.sql`
      INSERT INTO "PaymentIntent" (
        "id",
        "userId",
        "orderId",
        "gateway",
        "status",
        "amount",
        "currency",
        "referenceId",
        "idempotencyKey",
        "description",
        "metadata"
      )
      VALUES (
        ${crypto.randomUUID()},
        ${order.userId ?? userId ?? null},
        ${order.id},
        ${gateway},  -- <-- AQUI SEM CAST!
        ${'PENDING'}::"PaymentIntentStatus",
        ${order.totalAmount},
        ${'BRL'},
        ${this.buildReferenceId(order.id, gateway)},
        ${this.buildIdempotencyKey(order.id, gateway)},
        ${description},
        ${metadata === undefined ? null : JSON.stringify(metadata)}::jsonb
      )
      RETURNING *
    `,
  );

  return intent;
}

private async updatePaymentIntent(
  intentId: string,
  data: Partial<PaymentIntentRecord>,
): Promise<PaymentIntentRecord> {
  const [current] = await this.prisma.$queryRaw<PaymentIntentRecord[]>(
    Prisma.sql`
      SELECT *
      FROM "PaymentIntent"
      WHERE "id" = ${intentId}
      LIMIT 1
    `,
  );
  if (!current) {
    throw new NotFoundException('Payment intent não encontrado.');
  }

  const nextStatus = data.status
    ? this.applyTransition(current.status, data.status)
    : current.status;

  const updateEntries = Object.entries({
    ...data,
    status: nextStatus,
  }).filter(([, value]) => value !== undefined);

  const assignments = updateEntries.map(([key, value]) => {
    if (key === 'metadata' || key === 'lastWebhookPayload') {
      return Prisma.sql`${Prisma.raw(`"${key}"`)} = ${
        value === null ? null : JSON.stringify(value)
      }::jsonb`;
    }
    
    if (key === 'status') {
      return Prisma.sql`${Prisma.raw(`"${key}"`)} = ${value}::"PaymentIntentStatus"`;
    }
    
    return Prisma.sql`${Prisma.raw(`"${key}"`)} = ${value}`;
  });

  const [updatedIntent] = await this.prisma.$queryRaw<PaymentIntentRecord[]>(
    Prisma.sql`
      UPDATE "PaymentIntent"
      SET ${Prisma.join(
        [...assignments, Prisma.sql`"updatedAt" = CURRENT_TIMESTAMP`],
        ', ',
      )}
      WHERE "id" = ${intentId}
      RETURNING *
    `,
  );

  return updatedIntent;
}

  private applyTransition(
    current: PaymentIntentStatus,
    desired: PaymentIntentStatus,
  ): PaymentIntentStatus {
    if (current === desired) {
      return current;
    }

    const allowed = PAYMENT_TRANSITIONS[current] ?? [];
    if (!allowed.includes(desired)) {
      throw new BadRequestException(
        `Transição de payment intent inválida: ${current} -> ${desired}.`,
      );
    }

    return desired;
  }

  private mapExternalStatusToIntentStatus(
    externalStatus?: string,
  ): PaymentIntentStatus {
    switch ((externalStatus || '').toUpperCase()) {
      case 'PAID':
      case 'APPROVED':
      case 'CONFIRMED':
      case 'COMPLETED':
        return 'CONFIRMED';
      case 'CANCELED':
      case 'CANCELLED':
      case 'ABORTED':
        return 'CANCELLED';
      case 'EXPIRED':
        return 'EXPIRED';
      case 'DECLINED':
      case 'DENIED':
      case 'FAILED':
      case 'NOT_PAID':
        return 'FAILED';
      default:
        return 'PENDING';
    }
  }

  private async syncTransactionFromIntent(
    order: OrderWithDetails,
    intent: PaymentIntentRecord,
    antifraudStatus?: string,
  ): Promise<Transaction> {
    const existingTransaction = await this.prisma.transaction.findUnique({
      where: { orderId: order.id },
      include: { order: true },
    });
    const transactionStatus = this.mapIntentStatusToTransactionStatus(
      intent.status,
      intent.gateway,
    );

    if (existingTransaction) {
      return this.prisma.transaction.update({
        where: { id: existingTransaction.id },
        data: {
          status: transactionStatus,
          description: intent.description ?? existingTransaction.description,
          gatewayTransactionId:
            intent.externalOrderId ?? existingTransaction.gatewayTransactionId,
          transactionRef: intent.transactionRef ?? existingTransaction.transactionRef,
          qrCodeUrl: intent.qrCodeUrl ?? existingTransaction.qrCodeUrl,
          antifraudStatus: antifraudStatus ?? existingTransaction.antifraudStatus,
        },
      });
    }

    return this.prisma.transaction.create({
      data: {
        userId: order.userId || null,
        orderId: order.id,
        amount: order.totalAmount,
        type: TransactionType.PAYMENT,
        status: transactionStatus,
        description: intent.description ?? `Pagamento para Pedido #${order.id}`,
        gatewayTransactionId: intent.externalOrderId ?? null,
        transactionRef: intent.transactionRef ?? null,
        qrCodeUrl: intent.qrCodeUrl ?? null,
        antifraudStatus: antifraudStatus ?? null,
      },
    });
  }

  private mapIntentStatusToTransactionStatus(
    status: PaymentIntentStatus,
    gateway: PaymentIntentGateway,
  ): string {
    switch (status) {
      case 'CONFIRMED':
        return OrderStatus.PAID;
      case 'FAILED':
        return 'FAILED';
      case 'CANCELLED':
        return OrderStatus.CANCELLED;
      case 'EXPIRED':
        return 'EXPIRED';
      default:
        return gateway === 'PAGSEGURO_REDIRECT' ? 'PENDING_REDIRECT' : 'PENDING';
    }
  }

  private async fetchProviderDetails(intent: PaymentIntentRecord): Promise<any> {
    if (!intent.externalOrderId) {
      return { status: intent.status };
    }

    if (intent.gateway === 'PAGSEGURO_REDIRECT') {
      return this.pagSeguroService.getCheckoutDetails(intent.externalOrderId);
    }

    return this.pagSeguroService.getOrderDetails(intent.externalOrderId);
  }

  private async markOrderPaid(order: OrderWithDetails) {
    if (order.status === OrderStatus.PAID) {
      return;
    }

    await this.prisma.$transaction(async (prisma) => {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.PAID },
      });

      for (const item of order.items) {
        await prisma.product.update({
          where: { id: item.product.id },
          data: { stock: { decrement: item.quantity } },
        });
      }
    });

    try {
      const recipientEmail = order.user?.email ?? order.guestEmail;
      if (recipientEmail) {
        await this.notificationsService.sendPaymentConfirmationEmail(
          recipientEmail,
          order.id,
          order.totalAmount.toNumber(),
        );
      }
    } catch (emailError) {
  this.logger.error(
    `Falha ao enviar e-mail de confirmação de pagamento para o pedido ${order.id}: ${(emailError as Error).message}`,  // <-- CORRIGIDO
  );
}
  }

  private buildPixResponseFromIntent(
    intent: PaymentIntentRecord,
  ): PixChargeResponseDto {
    return {
      transactionId: intent.externalOrderId ?? intent.id,
      status: this.mapIntentStatusToPixStatus(intent.status),
      brCode: intent.qrCodeText ?? intent.transactionRef ?? '',
      qrCodeImage: intent.qrCodeUrl ?? '',
      expiresAt:
        intent.expiresAt?.toISOString() ?? intent.updatedAt.toISOString(),
      amount: new Decimal(intent.amount).toNumber(),
      description: intent.description ?? '',
      orderId: intent.orderId,
    };
  }

  private buildCardResponseFromIntent(intent: PaymentIntentRecord) {
    return {
      paymentIntentId: intent.id,
      transactionId: intent.externalOrderId ?? intent.id,
      status: this.mapIntentStatusToTransactionStatus(intent.status, intent.gateway),
      transactionRef: intent.transactionRef ?? intent.externalChargeId ?? '',
      amount: new Decimal(intent.amount).toNumber(),
      description: intent.description ?? '',
      orderId: intent.orderId,
    };
  }

  private buildRedirectResponseFromIntent(intent: PaymentIntentRecord) {
    return {
      redirectUrl: intent.transactionRef ?? '',
      paymentIntentId: intent.id,
    };
  }

  private mapIntentStatusToPixStatus(
    status: PaymentIntentStatus,
  ): PixChargeResponseDto['status'] {
    switch (status) {
      case 'CONFIRMED':
        return 'COMPLETED';
      case 'CANCELLED':
        return 'CANCELED';
      case 'EXPIRED':
        return 'EXPIRED';
      case 'FAILED':
        return 'FAILED';
      default:
        return 'PENDING';
    }
  }

  private buildPagSeguroPayload(order: OrderWithDetails) {
    const customerEmail = order.user?.email ?? order.guestEmail ?? '';
    const customerFullName =
      order.user?.name ?? order.guestName ?? 'Cliente Convidado';
    const customerPhone =
      (order.user?.phone ?? order.guestPhone ?? '').trim() || undefined;
    const customerCpf = order.user?.cpf ?? order.guestCpf ?? undefined;

    const customer = {
      email: customerEmail,
      fullName: customerFullName,
      phone: customerPhone,
      cpf: customerCpf,
    };

    const shippingAddress = {
      cep: order.shippingAddressZipCode,
      street: order.shippingAddressStreet,
      number: order.shippingAddressNumber,
      complement: order.shippingAddressComplement ?? undefined,
      neighborhood: order.shippingAddressNeighborhood,
      city: order.shippingAddressCity,
      state: order.shippingAddressState,
    };

    const items = order.items.map((item) => ({
      name: item.product.name,
      quantity: item.quantity,
      unit_amount: new Decimal(item.price),
    }));

    return { customer, shippingAddress, items };
  }

  private ensureOrderOwnership(order: OrderWithDetails, requesterId?: string) {
    if (order.userId) {
      if (!requesterId || order.userId !== requesterId) {
        throw new BadRequestException('Acesso não autorizado a este pedido.');
      }
      return;
    }

    if (!order.guestId) {
      throw new BadRequestException(
        'Pedido sem identificador de convidado definido.',
      );
    }

    if (!requesterId || order.guestId !== requesterId) {
      throw new BadRequestException(
        'Acesso não autorizado ao pedido de convidado.',
      );
    }
  }

  private rethrowProviderError(error: any, fallbackMessage: string): never {
    this.logger.error(error?.message ?? fallbackMessage, error?.stack);
    if (
      error instanceof InternalServerErrorException &&
      error.message.startsWith('Falha no PagSeguro:')
    ) {
      throw error;
    }
    throw new InternalServerErrorException(fallbackMessage);
  }
}
