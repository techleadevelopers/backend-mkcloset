// src/payments/payments.module.ts
import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { OrdersModule } from 'src/orders/orders.module';
import { ConfigModule } from 'src/config/config.module';
import { PagSeguroService } from './providers/pagseguro.service';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { AntifraudModule } from 'src/antifraud/antifraud.module';

@Module({
  imports: [
    PrismaModule,
    OrdersModule,
    ConfigModule,
    NotificationsModule,
    AntifraudModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PagSeguroService, // Serviço de integração com PagSeguro
  ],
  exports: [
    PaymentsService,
    PagSeguroService, // Exporta para que outros módulos (ex: AdminModule) possam usar
  ],
})
export class PaymentsModule {}
