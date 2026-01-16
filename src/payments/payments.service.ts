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
import {
  CreatePixChargeDto,
  PixChargeResponseDto,
} from './dto/create-pix-charge.dto';
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
    const order: OrderWithDetails =
      await this.ordersService.findOneById(orderId);

    if (!order) {
      throw new NotFoundException(`Pedido com ID ${orderId} não encontrado.`);
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'O pedido já foi pago ou está em outro status.',
      );
    }

    this.ensureOrderOwnership(order, userId);

    const existingTransaction = await this.getExistingPaymentTransaction(
      order.id,
    );
    if (existingTransaction) {
      this.logger.log(
        `Cobrança PIX já iniciada para o pedido ${order.id}. Retornando recurso existente.`,
      );
      return this.buildPixResponseFromTransaction(existingTransaction);
    }

    const { customer, shippingAddress, items } =
      this.buildPagSeguroPayload(order);

    try {
      const antifraudResult = await this.antifraudService.analyzeTransaction({
        orderId: order.id,
        amount: order.totalAmount.toNumber(),
        customerEmail: customer.email,
        customerCpf: customer.cpf,
        paymentMethod: 'PIX',
        items: order.items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          price: item.price.toNumber(),
        })),
      });

      if (antifraudResult.status === 'DENIED') {
        throw new BadRequestException(
          'Transação negada pela análise antifraude.',
        );
      }

            const backendUrl = this.configService.backendUrl;
      if (!backendUrl) {
        throw new InternalServerErrorException(
          'A variável de ambiente BACKEND_URL não está definida.',
        );
      }

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

      await this.prisma.transaction.create({
        data: {
          userId: order.userId || null,
          orderId: order.id,
          amount: order.totalAmount,
          type: TransactionType.PAYMENT,
          status: 'PENDING',
          description: `Cobrança PIX para Pedido #${order.id}`,
          gatewayTransactionId: pagSeguroResponse.transactionId,
          transactionRef: pagSeguroResponse.brCode,
          qrCodeUrl: pagSeguroResponse.qrCodeImage,
          antifraudStatus: antifraudResult.status,
        },
      });

      return pagSeguroResponse;
    } catch (error) {
      this.logger.error(
        `Erro ao criar cobrança PIX para o pedido ${orderId}: ${error.message}`,
        error.stack,
      );
      if (
        error instanceof InternalServerErrorException &&
        error.message.startsWith('Falha no PagSeguro:')
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
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
        'Dados do cartão incompletos para processamento direto.',
      );
    }

    const order: OrderWithDetails =
      await this.ordersService.findOneById(orderId);

    if (!order) {
      throw new NotFoundException(`Pedido com ID ${orderId} não encontrado.`);
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'O pedido já foi pago ou está em outro status.',
      );
    }

    this.ensureOrderOwnership(order, userId);

    const existingTransaction = await this.getExistingPaymentTransaction(
      order.id,
    );
    if (existingTransaction) {
      this.logger.log(
        `Pagamento com cartão já registrado para o pedido ${order.id}. Retornando recurso existente.`,
      );
      return this.buildExistingDirectCardResponse(existingTransaction);
    }

    const { customer, shippingAddress, items } =
      this.buildPagSeguroPayload(order);

    try {
      const antifraudResult = await this.antifraudService.analyzeTransaction({
        orderId: order.id,
        amount: order.totalAmount.toNumber(),
        customerEmail: customer.email,
        customerCpf: customer.cpf,
        paymentMethod: 'CREDIT_CARD',
        items: order.items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          price: item.price.toNumber(),
        })),
        cardDetails: { brand: cardBrand, installments: cardInstallments },
      });

      if (antifraudResult.status === 'DENIED') {
        throw new BadRequestException(
          'Transação negada pela análise antifraude.',
        );
      }

            const backendUrl = this.configService.backendUrl;
      if (!backendUrl) {
        throw new InternalServerErrorException(
          'A variável de ambiente BACKEND_URL não está definida.',
        );
      }

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

      await this.prisma.transaction.create({
        data: {
          userId: order.userId || null,
          orderId: order.id,
          amount: order.totalAmount,
          type: TransactionType.PAYMENT,
          status: pagSeguroResponse.status,
          description: `Pagamento com Cartão de Crédito para Pedido #${order.id}`,
          gatewayTransactionId: pagSeguroResponse.transactionId,
          transactionRef: pagSeguroResponse.transactionRef,
          antifraudStatus: antifraudResult.status,
        },
      });

      if (pagSeguroResponse.status === OrderStatus.PAID) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.PAID },
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
            `Falha ao enviar e-mail de confirmação de pagamento para o pedido ${order.id}: ${emailError.message}`,
          );
        }
      }

      return pagSeguroResponse;
    } catch (error) {
      this.logger.error(
        `Erro ao processar pagamento com cartão para o pedido ${orderId}: ${error.message}`,
        error.stack,
      );
      if (
        error instanceof InternalServerErrorException &&
        error.message.startsWith('Falha no PagSeguro:')
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Falha ao processar pagamento com cartão de crédito.',
      );
    }
  }

  async initiatePagSeguroRedirectCheckout(
    userId: string | undefined,
    orderId: string,
  ): Promise<{ redirectUrl: string }> {
    const order: OrderWithDetails =
      await this.ordersService.findOneById(orderId);

    if (!order) {
      throw new NotFoundException(`Pedido com ID ${orderId} não encontrado.`);
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'O pedido já foi pago ou está em outro status.',
      );
    }

    this.ensureOrderOwnership(order, userId);

    const existingTransaction = await this.getExistingPaymentTransaction(
      order.id,
    );
    if (existingTransaction) {
      this.logger.log(
        `Checkout PagSeguro já criado para o pedido ${order.id}. Retornando recurso existente.`,
      );
      return this.buildExistingRedirectResponse(existingTransaction);
    }

    const { customer, shippingAddress, items } =
      this.buildPagSeguroPayload(order);
    const clientEmail = customer.email;
    const clientCpf = customer.cpf;

    try {
      const antifraudResult = await this.antifraudService.analyzeTransaction({
        orderId: order.id,
        amount: order.totalAmount.toNumber(),
        customerEmail: clientEmail,
        customerCpf: clientCpf,
        paymentMethod: 'REDIRECT_CHECKOUT',
        items: order.items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          price: item.price.toNumber(),
        })),
      });

      if (antifraudResult.status === 'DENIED') {
        throw new BadRequestException(
          'Transação negada pela análise antifraude.',
        );
      }

            const backendUrl = this.configService.backendUrl;
      if (!backendUrl) {
        throw new InternalServerErrorException(
          'A variável de ambiente BACKEND_URL não está definida.',
        );
      }

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

      await this.prisma.transaction.create({
        data: {
          userId: order.userId || null,
          orderId: order.id,
          amount: order.totalAmount,
          type: TransactionType.PAYMENT,
          status: 'PENDING_REDIRECT',
          description: `Iniciação de pagamento via PagSeguro Checkout para Pedido #${order.id}`,
          gatewayTransactionId: pagSeguroResponse.pagSeguroCheckoutId,
          transactionRef: pagSeguroResponse.redirectUrl,
          antifraudStatus: antifraudResult.status,
        },
      });

      return { redirectUrl: pagSeguroResponse.redirectUrl };
    } catch (error) {
      this.logger.error(
        `Erro ao iniciar checkout de redirecionamento para o pedido ${orderId}: ${error.message}`,
        error.stack,
      );
      if (
        error instanceof InternalServerErrorException &&
        error.message.startsWith('Falha no PagSeguro:')
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Falha ao iniciar o processo de pagamento com PagSeguro.',
      );
    }
  }

  async handlePagSeguroNotification(
    pagSeguroCheckoutId: string,
    signature: string,
    rawBody: string,
  ) {
    this.logger.log(
      `[PaymentsService] Webhook do PagSeguro recebido para checkout ID: ${pagSeguroCheckoutId}`,
    );

    const webhookSecret = this.configService.pagSeguroWebhookSecret;

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (signature !== expectedSignature) {
      this.logger.error(
        `[PaymentsService] Assinatura do webhook inválida para checkout ID: ${pagSeguroCheckoutId}.`,
      );
      throw new UnauthorizedException('Assinatura do webhook inválida.');
    }
    this.logger.log(
      `[PaymentsService] Assinatura do webhook verificada com sucesso para checkout ID: ${pagSeguroCheckoutId}.`,
    );

    const checkoutDetails =
      await this.pagSeguroService.getCheckoutDetails(pagSeguroCheckoutId);
    const pagSeguroTransactionStatus =
      checkoutDetails.status ||
      checkoutDetails.charges?.[0]?.status ||
      'PENDING';
    const newOrderStatus = this.mapPagSeguroStatusToOrderStatus(
      pagSeguroTransactionStatus,
    );

    const transaction = await this.prisma.transaction.findFirst({
      where: { gatewayTransactionId: pagSeguroCheckoutId },
      include: { order: true },
    });

    if (!transaction || !transaction.order) {
      this.logger.warn(
        `Notificação do PagSeguro recebida para o checkout '${pagSeguroCheckoutId}', mas nenhuma transação correspondente foi encontrada.`,
      );
      throw new NotFoundException(
        'Transação não encontrada para o checkout ID fornecido.',
      );
    }

    if (
      transaction.status === newOrderStatus &&
      transaction.order.status === newOrderStatus
    ) {
      this.logger.log(
        `Status do pedido ${transaction.order.id} já está atualizado para ${newOrderStatus}.`,
      );
      return { message: 'Status já atualizado' };
    }

    await this.prisma.$transaction([
      this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: newOrderStatus },
      }),
      this.prisma.order.update({
        where: { id: transaction.order.id },
        data: { status: newOrderStatus },
      }),
    ]);

    this.logger.log(
      `Status do pedido ${transaction.order.id} atualizado para ${newOrderStatus} via webhook do PagSeguro.`,
    );

    try {
      const recipientEmail = transaction.order.userId
        ? (await this.ordersService.findOneById(transaction.order.id)).user
            ?.email
        : transaction.order.guestEmail;

      if (recipientEmail) {
        if (newOrderStatus === OrderStatus.PAID) {
          await this.notificationsService.sendPaymentConfirmationEmail(
            recipientEmail,
            transaction.order.id,
            transaction.order.totalAmount.toNumber(),
          );
        } else if (newOrderStatus === OrderStatus.CANCELLED) {
          await this.notificationsService.sendPaymentCancellationEmail(
            recipientEmail,
            transaction.order.id,
          );
        }
      }
    } catch (emailError) {
      this.logger.error(
        `Falha ao enviar e-mail de status de pagamento para o pedido ${transaction.order.id}: ${emailError.message}`,
      );
    }

    return { message: 'Status do pedido atualizado com sucesso' };
  }

  private async buildPixResponseFromTransaction(
    transaction: Transaction,
  ): Promise<PixChargeResponseDto> {
    if (!transaction.gatewayTransactionId) {
      throw new InternalServerErrorException(
        'Transação existente sem ID do PagSeguro.',
      );
    }

    try {
      const checkout = await this.pagSeguroService.getOrderDetails(
        transaction.gatewayTransactionId,
      );
      const qrCode = checkout.qr_codes?.[0];
      const status = this.mapPixStatus(qrCode?.status || transaction.status);
      const brCode = qrCode?.text || transaction.transactionRef || '';
      const qrCodeImage =
        qrCode?.links?.find((link: any) => link.rel === 'QR_CODE_IMAGE')
          ?.href ??
        transaction.qrCodeUrl ??
        '';
      const expiresAt =
        qrCode?.expiration_date ?? transaction.updatedAt.toISOString();

      return {
        transactionId: transaction.gatewayTransactionId,
        status,
        brCode,
        qrCodeImage,
        expiresAt,
        amount: transaction.amount.toNumber(),
        description: transaction.description ?? '',
        orderId: transaction.orderId ?? '',
      };
    } catch (error) {
      this.logger.warn(
        `[PaymentsService] Não foi possível reconstruir cobrança PIX existente para o pedido ${transaction.orderId}: ${error.message}`,
      );
      return {
        transactionId: transaction.gatewayTransactionId,
        status: this.mapPixStatus(transaction.status),
        brCode: transaction.transactionRef ?? '',
        qrCodeImage: transaction.qrCodeUrl ?? '',
        expiresAt: transaction.updatedAt.toISOString(),
        amount: transaction.amount.toNumber(),
        description: transaction.description ?? '',
        orderId: transaction.orderId ?? '',
      };
    }
  }

  private async buildExistingDirectCardResponse(
    transaction: Transaction,
  ): Promise<any> {
    if (!transaction.gatewayTransactionId) {
      throw new InternalServerErrorException(
        'Transação existente sem ID do PagSeguro.',
      );
    }

    try {
      const checkout = await this.pagSeguroService.getCheckoutDetails(
        transaction.gatewayTransactionId,
      );
      const charge = checkout.charges?.[0];
      return {
        transactionId: transaction.gatewayTransactionId,
        status: charge?.status ?? checkout.status ?? transaction.status,
        transactionRef: charge?.id ?? transaction.transactionRef,
        amount: transaction.amount.toNumber(),
        description: transaction.description ?? '',
        orderId: transaction.orderId ?? '',
      };
    } catch (error) {
      this.logger.warn(
        `[PaymentsService] Não foi possível reconstruir pagamento com cartão existente para o pedido ${transaction.orderId}: ${error.message}`,
      );
      return {
        transactionId: transaction.gatewayTransactionId,
        status: transaction.status,
        transactionRef: transaction.transactionRef ?? '',
        amount: transaction.amount.toNumber(),
        description: transaction.description ?? '',
        orderId: transaction.orderId ?? '',
      };
    }
  }

  private async buildExistingRedirectResponse(
    transaction: Transaction,
  ): Promise<{ redirectUrl: string; pagSeguroCheckoutId: string }> {
    if (!transaction.gatewayTransactionId) {
      throw new InternalServerErrorException(
        'Transação existente sem ID do PagSeguro.',
      );
    }

    try {
      const checkout = await this.pagSeguroService.getCheckoutDetails(
        transaction.gatewayTransactionId,
      );
      const payLink = checkout.links?.find((link: any) => link.rel === 'PAY');
      return {
        redirectUrl: payLink?.href ?? transaction.transactionRef ?? '',
        pagSeguroCheckoutId: checkout.id ?? transaction.gatewayTransactionId,
      };
    } catch (error) {
      this.logger.warn(
        `[PaymentsService] Não foi possível reconstruir checkout existente para o pedido ${transaction.orderId}: ${error.message}`,
      );
      return {
        redirectUrl: transaction.transactionRef ?? '',
        pagSeguroCheckoutId: transaction.gatewayTransactionId,
      };
    }
  }

  private buildPagSeguroPayload(order: OrderWithDetails) {
    const customerEmail = order.user?.email ?? order.guestEmail ?? '';
    const customerFullName = order.user?.name ?? 'Cliente Convidado';
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

  private async getExistingPaymentTransaction(
    orderId: string,
  ): Promise<Transaction | null> {
    return this.prisma.transaction.findUnique({
      where: { orderId },
    });
  }

  private mapPixStatus(
    externalStatus?: string,
  ): PixChargeResponseDto['status'] {
    switch (externalStatus) {
      case 'PAID':
      case 'CONFIRMED':
      case 'COMPLETED':
        return 'COMPLETED';
      case 'CANCELED':
        return 'CANCELED';
      case 'EXPIRED':
        return 'EXPIRED';
      case 'FAILED':
        return 'FAILED';
      default:
        return 'PENDING';
    }
  }

  private mapPagSeguroStatusToOrderStatus(
    pagSeguroStatus: string,
  ): OrderStatus {
    switch (pagSeguroStatus) {
      case 'PAID':
      case 'APPROVED':
        return OrderStatus.PAID;
      case 'IN_ANALYSIS':
      case 'PENDING':
        return OrderStatus.PENDING;
      case 'CANCELED':
      case 'ABORTED':
        return OrderStatus.CANCELLED;
      case 'REFUNDED':
      case 'SHIPPED':
        return OrderStatus.SHIPPED;
      case 'DELIVERED':
        return OrderStatus.DELIVERED;
      default:
        return OrderStatus.PENDING;
    }
  }
}
