import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentsService } from './payments.service';

@Injectable()
export class PaymentExpirationService {
  private readonly logger = new Logger(PaymentExpirationService.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cancelExpiredOrders() {
    this.logger.log('Executando rotina automatica de expiracao de pagamentos...');
    return this.paymentsService.cancelExpiredPaymentIntents();
  }
}
