// src/payments/payments.module.ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule'; // 🔥 ADICIONADO
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { OrdersModule } from 'src/orders/orders.module';
import { ConfigModule } from 'src/config/config.module';
import { PagSeguroService } from './providers/pagseguro.service';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { AntifraudModule } from 'src/antifraud/antifraud.module';
import { PaymentExpirationService } from './expiration.service'; 

@Module({
  imports: [
    ScheduleModule.forRoot(),
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
    PaymentExpirationService, // Serviço para lidar com expiração de pedidos
  ],
  exports: [
    PaymentsService,
    PagSeguroService, // Exporta para que outros módulos (ex: AdminModule) possam usar
  ],
})
export class PaymentsModule {}