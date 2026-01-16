// src/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { RefundsService } from 'src/payments/refunds.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { OrdersModule } from 'src/orders/orders.module';
import { AntifraudModule } from 'src/antifraud/antifraud.module';

@Module({
  imports: [
    PrismaModule,
    PaymentsModule,  // Importa PagSeguroService e PaymentsService
    OrdersModule,    // Importa OrdersService
    AntifraudModule, // Importa AntifraudService
  ],
  controllers: [
    AdminController,
  ],
  providers: [
    AdminService,
    RefundsService, // Mantém como provider local para evitar problemas de injeção
  ],
  exports: [
    AdminService, // Exporta se precisar usar AdminService em outros módulos
  ],
})
export class AdminModule {}
