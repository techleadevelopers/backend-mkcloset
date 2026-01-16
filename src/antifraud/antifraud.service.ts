// src/antifraud/antifraud.service.ts
import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common'; // ADICIONADO: NotFoundException
import { ConfigService } from 'src/config/config.service';
import { PrismaService } from 'src/prisma/prisma.service'; // Para interagir com o DB (salvar status)
import axios from 'axios';

// Definição dos status da análise antifraude
export type AntifraudStatus = 'PENDING_REVIEW' | 'ACCEPTED' | 'DENIED';

// DTO de entrada para a análise
interface AnalyzeTransactionDto {
  orderId: string;
  amount: number;
  customerEmail: string;
  customerCpf?: string;
  paymentMethod: string;
  items: Array<{
    productId: string;
    quantity: number;
    price: number;
  }>;
  cardDetails?: {
    brand?: string;
    installments?: number;
  };
  // Outros dados relevantes para análise (endereço de IP, device fingerprint, etc.)
}

@Injectable()
export class AntifraudService {
  private readonly logger = new Logger(AntifraudService.name);
  private antifraudApiUrl: string;
  private antifraudApiKey: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService, // Injete o PrismaService
  ) {
    this.antifraudApiUrl = this.configService.antifraudApiUrl;
    this.antifraudApiKey = this.configService.antifraudApiKey;

    if (!this.antifraudApiUrl || !this.antifraudApiKey) {
      this.logger.warn('As credenciais da ferramenta antifraude não estão configuradas. A análise antifraude será simulada.');
    }
  }

  async analyzeTransaction(data: AnalyzeTransactionDto): Promise<{ status: AntifraudStatus; reason?: string }> {
    this.logger.log(`Iniciando análise antifraude para o pedido ${data.orderId}`);

    if (!this.antifraudApiUrl || !this.antifraudApiKey) {
      this.logger.warn('Análise antifraude simulada: credenciais não configuradas.');
      // Simulação para ambiente de desenvolvimento/teste
      if (data.amount > 5000) { // Exemplo: valores altos sempre em revisão
        return { status: 'PENDING_REVIEW', reason: 'Valor da transação muito alto (simulado).' };
      }
      if (data.customerCpf && data.customerCpf.startsWith('111')) { // Exemplo: CPF de teste suspeito
        return { status: 'DENIED', reason: 'CPF suspeito (simulado).' };
      }
      return { status: 'ACCEPTED', reason: 'Análise simulada: aprovado.' };
    }

    try {
      // Adapte o payload conforme a documentação da ferramenta antifraude real
      const payload = {
        transaction_id: data.orderId,
        value: data.amount,
        customer: {
          email: data.customerEmail,
          cpf: data.customerCpf,
        },
        items: data.items.map(item => ({
          id: item.productId,
          quantity: item.quantity,
          unit_price: item.price,
        })),
        payment_method: {
          type: data.paymentMethod,
          card_brand: data.cardDetails?.brand,
          installments: data.cardDetails?.installments,
        },
        // Adicione mais campos conforme a necessidade da API antifraude
      };

      const response = await axios.post(this.antifraudApiUrl, payload, {
        headers: {
          'Authorization': `Bearer ${this.antifraudApiKey}`,
          'Content-Type': 'application/json',
        },
      });

      // Adapte o mapeamento do status conforme a resposta da API antifraude
      const externalStatus = response.data.status; // Ex: 'approved', 'reproved', 'manual_review'
      let internalStatus: AntifraudStatus;
      let reason: string = response.data.reason || 'N/A';

      switch (externalStatus) {
        case 'approved':
          internalStatus = 'ACCEPTED';
          break;
        case 'reproved':
          internalStatus = 'DENIED';
          break;
        case 'manual_review':
          internalStatus = 'PENDING_REVIEW';
          break;
        default:
          internalStatus = 'PENDING_REVIEW'; // Default para status desconhecido
          reason = `Status antifraude desconhecido: ${externalStatus}`;
          break;
      }

      this.logger.log(`Análise antifraude para pedido ${data.orderId}: Status ${internalStatus}, Motivo: ${reason}`);
      return { status: internalStatus, reason };

    } catch (error) {
      this.logger.error(`Erro ao chamar ferramenta antifraude para o pedido ${data.orderId}: ${error.message}`, error.stack);
      if (axios.isAxiosError(error) && error.response) {
        this.logger.error(`Dados do erro da API Antifraude: ${JSON.stringify(error.response.data)}`);
      }
      // Em caso de falha na comunicação com a ferramenta, pode-se definir um status padrão
      // ou lançar um erro, dependendo da política de segurança.
      return { status: 'PENDING_REVIEW', reason: 'Falha na comunicação com o serviço antifraude.' };
    }
  }

  // Método para atualizar o status antifraude manualmente (usado pelo AdminController)
  async updateAntifraudStatus(transactionId: string, newStatus: AntifraudStatus, reason?: string): Promise<any> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException(`Transação com ID "${transactionId}" não encontrada.`);
    }

    const updatedTransaction = await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        antifraudStatus: newStatus,
        // Você pode adicionar um campo para o motivo da atualização manual
      },
    });

    // Opcional: Se o status mudar para ACCEPTED ou DENIED, você pode querer
    // acionar ações adicionais (ex: liberar pedido, cancelar pedido).
    // Isso dependerá da sua lógica de negócio.
    this.logger.log(`Status antifraude da transação ${transactionId} atualizado para ${newStatus} (motivo: ${reason || 'manual'}).`);

    return updatedTransaction;
  }
}