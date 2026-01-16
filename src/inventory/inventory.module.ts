import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ProductsModule } from 'src/products/products.module';

@Module({
  imports: [PrismaModule, ProductsModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService], // Pode ser usado por OrdersModule, por exemplo, para validação de estoque
})
export class InventoryModule {}