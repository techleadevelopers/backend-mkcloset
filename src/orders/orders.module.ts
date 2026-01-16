// src/orders/orders.module.ts
import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CartModule } from 'src/cart/cart.module';
import { UsersModule } from 'src/users/users.module';
import { ProductsModule } from 'src/products/products.module';
import { NotificationsModule } from 'src/notifications/notifications.module'; // <-- Importação adicionada

@Module({
  imports: [
    PrismaModule,
    CartModule,
    UsersModule,
    ProductsModule,
    NotificationsModule, // <-- Agora o OrdersService terá acesso ao NotificationsService
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
