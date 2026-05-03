// src/payments/expiration.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { OrderStatus, TransactionType, PaymentIntentStatus } from '@prisma/client';

// Define o tipo para os intents expirados
type ExpiredIntent = {
  id: string;
  orderId: string;
  userId: string | null;
  amount: any;
  status: string;
  expiresAt: Date;
  order_status: string;
};

@Injectable()
export class PaymentExpirationService {
  private readonly logger = new Logger(PaymentExpirationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Roda a cada 5 minutos
  @Cron(CronExpression.EVERY_5_MINUTES)
  async cancelExpiredOrders() {
    this.logger.log('Verificando pedidos pendentes expirados...');

    const now = new Date();
    const expirationMinutes = 30; // 30 minutos

    // Busca intents de pagamento expirados
    const expiredIntents = await this.prisma.$queryRaw<ExpiredIntent[]>`
      SELECT pi.*, o.status as order_status
      FROM "PaymentIntent" pi
      JOIN "Order" o ON o.id = pi."orderId"
      WHERE pi.status = 'PENDING'
        AND pi."expiresAt" IS NOT NULL
        AND pi."expiresAt" < ${now}
        AND o.status = 'PENDING'
    `;

    let cancelledCount = 0;

    for (const intent of expiredIntents) {
      try {
        await this.prisma.$transaction(async (prisma) => {
          // 1. Atualiza PaymentIntent para EXPIRED
          await prisma.$executeRaw`
            UPDATE "PaymentIntent"
            SET status = ${PaymentIntentStatus.EXPIRED}::"PaymentIntentStatus",
                "updatedAt" = NOW()
            WHERE id = ${intent.id}
          `;

          // 2. Cancela o pedido
          await prisma.order.update({
            where: { id: intent.orderId },
            data: { status: OrderStatus.CANCELLED },
          });

          // 3. Registra transação de cancelamento
          await prisma.transaction.create({
            data: {
              orderId: intent.orderId,
              userId: intent.userId,
              amount: intent.amount,
              type: TransactionType.REFUND,
              status: 'EXPIRED',
              description: `Pedido cancelado automaticamente após ${expirationMinutes} minutos sem pagamento`,
            },
          });

          cancelledCount++;
          this.logger.log(`Pedido ${intent.orderId} cancelado por expiração`);
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Erro ao cancelar pedido ${intent.orderId}: ${errorMessage}`);
      }
    }

    if (cancelledCount > 0) {
      this.logger.log(`Total de ${cancelledCount} pedidos cancelados por expiração`);
    }

    return { cancelledCount, expiredCount: expiredIntents.length };
  }
}