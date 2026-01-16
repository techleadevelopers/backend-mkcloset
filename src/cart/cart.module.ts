import { Module } from '@nestjs/common';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ProductsModule } from 'src/products/products.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [PrismaModule, ProductsModule, UsersModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService], // Exporta para OrdersModule
})
export class CartModule {}