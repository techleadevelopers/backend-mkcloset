// src/admin/admin.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { RefundsService } from 'src/payments/refunds.service';
import { AntifraudService, AntifraudStatus } from 'src/antifraud/antifraud.service';
import { OrdersService } from 'src/orders/orders.service';
import { PrismaService } from 'src/prisma/prisma.service'; // Para operações diretas no DB se necessário, ou para tipagem

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly refundsService: RefundsService,
    private readonly antifraudService: AntifraudService,
    private readonly ordersService: OrdersService,
    private readonly prisma: PrismaService, // Injetado para operações de DB, se o AdminService tiver lógica própria
  ) {}

  /**
   * Inicia um processo de reembolso para uma transação.
   * @param transactionId O ID da transação a ser reembolsada.
   * @param amount Opcional. O valor a ser reembolsado (para reembolso parcial).
   * @returns Detalhes da resposta do reembolso.
   */
  async processRefund(transactionId: string, amount?: number): Promise<any> {
    this.logger.log(`[AdminService] Solicitando reembolso para transação ${transactionId}.`);
    return this.refundsService.initiateRefund(transactionId, amount);
  }

  /**
   * Atualiza manualmente o status da análise antifraude para uma transação.
   * @param transactionId O ID da transação.
   * @param newStatus O novo status antifraude.
   * @param reason Opcional. O motivo da alteração.
   * @returns A transação atualizada com o novo status antifraude.
   */
  async updateTransactionAntifraudStatus(transactionId: string, newStatus: AntifraudStatus, reason?: string): Promise<any> {
    this.logger.log(`[AdminService] Atualizando status antifraude da transação ${transactionId} para ${newStatus}.`);
    return this.antifraudService.updateAntifraudStatus(transactionId, newStatus, reason);
  }

  /**
   * Busca todos os pedidos do sistema.
   * Idealmente, deveria incluir paginação e filtros.
   * @returns Uma lista de todos os pedidos.
   */
  async getAllOrdersForAdmin(): Promise<any[]> {
    this.logger.log('[AdminService] Buscando todos os pedidos para o painel administrativo.');
    // No ordersService, o findAllByUserId espera um userId.
    // Você precisará de um método findAll() no OrdersService que não dependa de userId,
    // ou ajustar este para usar um método de busca mais genérico.
    // Por enquanto, vou chamar um método hipotético `findAllOrders` que você precisaria implementar.
    // Ou, se `findAllByUserId` pode receber `undefined` para "todos", mantenha como está.
    // Para este exemplo, vamos assumir que ordersService.findAllOrders() existe ou adaptar.
    // Se ordersService.findAllByUserId(undefined) retorna todos os pedidos, mantenha.
    // Caso contrário, você precisaria criar um método findAllOrders no OrdersService.
    const allOrders = await this.prisma.order.findMany({
        include: {
            user: true,
            items: { include: { product: true } },
        },
        orderBy: { createdAt: 'desc' },
    });
    return allOrders;
  }

  // Você pode adicionar mais métodos aqui para outras funcionalidades administrativas
  // como gerenciar usuários, produtos, categorias, etc.
}