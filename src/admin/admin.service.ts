import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import {
  AntifraudService,
  AntifraudStatus,
} from 'src/antifraud/antifraud.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { RefundsService } from 'src/payments/refunds.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly refundsService: RefundsService,
    private readonly antifraudService: AntifraudService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async processRefund(transactionId: string, amount?: number) {
    this.logger.log(
      `[AdminService] Solicitando reembolso para transação ${transactionId}.`,
    );
    return this.refundsService.initiateRefund(transactionId, amount);
  }

  async updateTransactionAntifraudStatus(
    transactionId: string,
    newStatus: AntifraudStatus,
    reason?: string,
  ) {
    this.logger.log(
      `[AdminService] Atualizando status antifraude da transação ${transactionId} para ${newStatus}.`,
    );
    return this.antifraudService.updateAntifraudStatus(
      transactionId,
      newStatus,
      reason,
    );
  }

  async getAllOrdersForAdmin() {
    this.logger.log('[AdminService] Buscando pedidos do painel administrativo.');
    return this.prisma.order.findMany({
      select: {
        id: true,
        userId: true,
        guestId: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        guestCpf: true,
        status: true,
        totalAmount: true,
        shippingPrice: true,
        shippingService: true,
        shippingAddressStreet: true,
        shippingAddressNumber: true,
        shippingAddressComplement: true,
        shippingAddressNeighborhood: true,
        shippingAddressCity: true,
        shippingAddressState: true,
        shippingAddressZipCode: true,
        paymentMethod: true,
        paymentDetails: true,
        createdAt: true,
        updatedAt: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                images: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            cpf: true,
            addresses: {
              select: {
                id: true,
                street: true,
                number: true,
                complement: true,
                neighborhood: true,
                city: true,
                state: true,
                zipCode: true,
                isDefault: true,
              },
              orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    options?: {
      carrier?: string | null;
      postedAt?: string | null;
      trackingCode?: string | null;
      trackingUrl?: string | null;
      notifyStage?: 'PROCESSING' | null;
    },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Pedido com ID "${orderId}" não encontrado.`);
    }

    const paymentDetails =
      order.paymentDetails &&
      typeof order.paymentDetails === 'object' &&
      !Array.isArray(order.paymentDetails)
        ? { ...(order.paymentDetails as Record<string, unknown>) }
        : {};

    if (options?.trackingCode) {
      paymentDetails.trackingCode = options.trackingCode;
    }
    if (options?.carrier) {
      paymentDetails.carrier = options.carrier;
    }
    if (options?.postedAt) {
      paymentDetails.postedAt = options.postedAt;
    }
    if (options?.trackingUrl) {
      paymentDetails.trackingUrl = options.trackingUrl;
    } else if (
      options?.trackingCode &&
      options?.carrier &&
      options.carrier.trim().toLowerCase() === 'correios'
    ) {
      paymentDetails.trackingUrl = `https://rastreamento.correios.com.br/app/index.php?objeto=${encodeURIComponent(options.trackingCode)}`;
    }
    if (options?.notifyStage === 'PROCESSING') {
      paymentDetails.processingNotifiedAt = new Date().toISOString();
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        paymentDetails: paymentDetails as unknown as Prisma.InputJsonValue,
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                images: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    const recipientEmail = updatedOrder.user?.email || updatedOrder.guestEmail;
    const customerName = updatedOrder.user?.name || updatedOrder.guestName;

    if (recipientEmail) {
      if (options?.notifyStage === 'PROCESSING') {
        await this.notificationsService.sendOrderProcessingEmail(recipientEmail, {
          orderId: updatedOrder.id,
          customerName,
        });
      } else if (status === OrderStatus.PAID) {
        await this.notificationsService.sendPaymentConfirmationEmail(
          recipientEmail,
          updatedOrder.id,
          Number(updatedOrder.totalAmount || 0),
          customerName,
        );
      } else if (status === OrderStatus.SHIPPED) {
        await this.notificationsService.sendOrderShippedEmail(recipientEmail, {
          orderId: updatedOrder.id,
          customerName,
          carrier: (paymentDetails.carrier as string | undefined) || null,
          postedAt: (paymentDetails.postedAt as string | undefined) || null,
          trackingCode: (paymentDetails.trackingCode as string | undefined) || null,
          trackingUrl: (paymentDetails.trackingUrl as string | undefined) || null,
        });
      } else if (status === OrderStatus.DELIVERED) {
        await this.notificationsService.sendOrderDeliveredEmail(recipientEmail, {
          orderId: updatedOrder.id,
          customerName,
        });
      }
    }

    return updatedOrder;
  }

  async getTransactionLogs(limit = 100) {
    const transactions = await this.prisma.transaction.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            id: true,
            status: true,
            totalAmount: true,
            paymentMethod: true,
            createdAt: true,
          },
        },
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    return transactions.map((transaction) => ({
      id: transaction.id,
      orderId: transaction.orderId,
      status: transaction.status,
      type: transaction.type,
      amount: transaction.amount.toNumber(),
      description: transaction.description,
      antifraudStatus: transaction.antifraudStatus,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      orderStatus: transaction.order?.status,
      paymentMethod: transaction.order?.paymentMethod,
      customer: transaction.user
        ? {
            id: transaction.user.id,
            email: transaction.user.email,
            name: transaction.user.name,
          }
        : null,
    }));
  }

  async sendTestEmail(payload: {
    to: string;
    template:
      | 'ORDER_CREATED'
      | 'PAYMENT_APPROVED'
      | 'ORDER_PROCESSING'
      | 'ORDER_SHIPPED'
      | 'ORDER_DELIVERED';
    customerName?: string;
    orderId?: string;
    totalAmount?: number;
    carrier?: string;
    postedAt?: string;
    trackingCode?: string;
    trackingUrl?: string;
  }) {
    const orderId = payload.orderId || `TEST-${Date.now()}`;
    const customerName = payload.customerName || 'Cliente Teste';
    const totalAmount = Number(payload.totalAmount || 199.9);

    switch (payload.template) {
      case 'ORDER_CREATED':
        await this.notificationsService.sendOrderConfirmationEmail(
          payload.to,
          orderId,
          totalAmount,
          customerName,
        );
        break;
      case 'PAYMENT_APPROVED':
        await this.notificationsService.sendPaymentConfirmationEmail(
          payload.to,
          orderId,
          totalAmount,
          customerName,
        );
        break;
      case 'ORDER_PROCESSING':
        await this.notificationsService.sendOrderProcessingEmail(payload.to, {
          orderId,
          customerName,
        });
        break;
      case 'ORDER_SHIPPED':
        await this.notificationsService.sendOrderShippedEmail(payload.to, {
          orderId,
          customerName,
          carrier: payload.carrier || 'Correios',
          postedAt: payload.postedAt || new Date().toISOString().slice(0, 10),
          trackingCode: payload.trackingCode || 'QG123456789BR',
          trackingUrl:
            payload.trackingUrl ||
            'https://rastreamento.correios.com.br/app/index.php?objeto=QG123456789BR',
        });
        break;
      case 'ORDER_DELIVERED':
        await this.notificationsService.sendOrderDeliveredEmail(payload.to, {
          orderId,
          customerName,
        });
        break;
    }

    return {
      ok: true,
      sentTo: payload.to,
      template: payload.template,
      orderId,
    };
  }
}
