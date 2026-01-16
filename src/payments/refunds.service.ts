// src/payments/refunds.service.ts
import { Injectable, InternalServerErrorException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PagSeguroService } from './providers/pagseguro.service';
import { TransactionType, OrderStatus, Prisma } from '@prisma/client'; // ADICIONADO: Importe 'Prisma' aqui

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pagSeguroService: PagSeguroService,
  ) {}

  async initiateRefund(transactionId: string, amount?: number): Promise<any> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { order: true },
    });

    if (!transaction) {
      throw new NotFoundException(`Transação com ID "${transactionId}" não encontrada.`);
    }

    if (transaction.type !== TransactionType.PAYMENT || transaction.status !== 'PAID') {
      throw new BadRequestException('Apenas transações de pagamento com status PAGO podem ser reembolsadas.');
    }

    if (!transaction.gatewayTransactionId) {
      throw new BadRequestException('ID da transação no gateway de pagamento ausente.');
    }

    // Validação de valor para reembolso parcial
    if (amount && amount > transaction.amount.toNumber()) {
        throw new BadRequestException('O valor do reembolso não pode ser maior que o valor da transação original.');
    }

    try {
      // Chama o PagSeguroService para iniciar o reembolso
      const pagSeguroRefundResponse = await this.pagSeguroService.initiateRefund(
        transaction.gatewayTransactionId,
        amount,
      );

      // Atualiza o status da transação e do pedido no banco de dados
      await this.prisma.$transaction(async (prisma) => {
        // Cria um novo registro de transação para o reembolso
        await prisma.transaction.create({
          data: {
            userId: transaction.userId,
            // CORREÇÃO 1: Converte 'null' para 'undefined' para satisfazer o tipo 'string | undefined'
            orderId: transaction.orderId ?? undefined,
            // CORREÇÃO 2: Usa 'Prisma.Decimal' corretamente após importação
            amount: new Prisma.Decimal(amount || transaction.amount.toNumber()),
            type: TransactionType.REFUND,
            status: 'PROCESSING', // Ou o status que o PagSeguro retorna inicialmente para reembolso
            description: `Reembolso para Transação Original #${transaction.id}`,
            gatewayTransactionId: pagSeguroRefundResponse.id || pagSeguroRefundResponse.charge_id, // ID do reembolso no PagSeguro
            transactionRef: pagSeguroRefundResponse.status, // Status do reembolso no PagSeguro
          },
        });

        // Atualiza o status da transação original (opcional, pode ser 'REFUNDED' ou 'PARTIALLY_REFUNDED')
        await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
                status: amount ? 'PARTIALLY_REFUNDED' : 'REFUNDED',
                // Você pode adicionar um campo para linkar o ID do reembolso aqui
            },
        });

        // Atualiza o status do pedido se for um reembolso total
        if (!amount || amount === transaction.amount.toNumber()) {
          // CORREÇÃO 3: Verifica se transaction.orderId não é null antes de tentar atualizar o pedido
          if (transaction.orderId) {
            await prisma.order.update({
              where: { id: transaction.orderId },
              data: { status: OrderStatus.REFUNDED },
            });
          } else {
            this.logger.warn(`Transação ${transaction.id} não possui orderId associado. O status do pedido não será atualizado.`);
          }
        }
      });

      this.logger.log(`Reembolso iniciado com sucesso para transação ${transactionId}.`);
      return { message: 'Reembolso iniciado com sucesso.', details: pagSeguroRefundResponse };

    } catch (error) {
      this.logger.error(`Erro ao processar reembolso para transação ${transactionId}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Falha ao processar reembolso.');
    }
  }
}