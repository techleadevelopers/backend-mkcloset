// src/app.module.ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule as NestConfigModule } from '@nestjs/config'; // Renomeado para evitar conflito com seu ConfigModule customizado
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { CartModule } from './cart/cart.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { ShippingModule } from './shipping/shipping.module';
import { InventoryModule } from './inventory/inventory.module';
import { CommonModule } from './common/common.module';
import { ConfigModule } from './config/config.module'; // Seu ConfigModule customizado
import { NotificationsModule } from './notifications/notifications.module'; // NOVO: Módulo de Notificações
import { AntifraudModule } from './antifraud/antifraud.module'; // NOVO: Módulo Antifraude
import { AdminModule } from './admin/admin.module'; // NOVO: Módulo Administrativo

@Module({
  imports: [
    // Módulo para servir arquivos estáticos (ex: imagens de upload)
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'), // Caminho para a pasta de uploads
      serveRoot: '/images', // Prefixo da URL para acessar os arquivos (ex: http://localhost:3001/images/minha-imagem.jpg)
    }),
    // Módulo de configuração do NestJS, carrega variáveis de ambiente
    NestConfigModule.forRoot({
      isGlobal: true, // Torna as variáveis de ambiente acessíveis globalmente
    }),
    // Seu módulo de configuração customizado, que expõe o ConfigService
    ConfigModule,
    // Módulos de infraestrutura e funcionalidades principais
    PrismaModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    ProductsModule,
    CartModule,
    WishlistModule,
    OrdersModule,
    PaymentsModule,
    ShippingModule,
    InventoryModule,
    CommonModule,
    // NOVOS MÓDULOS ADICIONADOS PARA AS MELHORIAS
    NotificationsModule, // Para envio de e-mails transacionais
    AntifraudModule,     // Para integração com ferramentas antifraude
    AdminModule,         // Para funcionalidades administrativas (ex: gestão de reembolsos)
  ],
  controllers: [AppController], // Controladores principais da aplicação
  providers: [AppService],     // Provedores principais da aplicação
})
export class AppModule {}