import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { RefundsService } from 'src/payments/refunds.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { OrdersModule } from 'src/orders/orders.module';
import { AntifraudModule } from 'src/antifraud/antifraud.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    PaymentsModule,
    OrdersModule,
    AntifraudModule,
    NotificationsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, RefundsService],
  exports: [AdminService],
})
export class AdminModule {}
