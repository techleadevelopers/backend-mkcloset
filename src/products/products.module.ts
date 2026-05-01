import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CategoriesModule } from 'src/categories/categories.module';
import { ConfigModule } from 'src/config/config.module';

@Module({
  imports: [PrismaModule, CategoriesModule, ConfigModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService], // Exporta para CartModule, OrderModule, WishlistModule
})
export class ProductsModule {}
