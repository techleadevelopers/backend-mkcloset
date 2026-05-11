import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentsService } from './payments.service';

@Injectable()
export class PaymentExpirationService {
  private readonly logger = new Logger(PaymentExpirationService.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Cron('0 */15 * * * *')
  async cancelExpiredOrders() {
    const result = await this.paymentsService.cancelExpiredPaymentIntents();

    if (result.expiredCount > 0 || result.cancelledCount > 0) {
      this.logger.log(
        `Rotina de expiracao finalizada: intents vencidos=${result.expiredCount}, pedidos cancelados=${result.cancelledCount}.`,
      );
    }

    return result;
  }
}
