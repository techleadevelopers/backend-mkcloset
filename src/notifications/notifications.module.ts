// src/notifications/notifications.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from 'src/config/config.module';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    ConfigModule, // Deixe aqui apenas se NotificationsService realmente usa ConfigService
  ],
  providers: [
    NotificationsService, // Serviço que envia as notificações
  ],
  exports: [
    NotificationsService, // Exporta para que outros módulos (como OrdersModule) possam injetar
  ],
})
export class NotificationsModule {}
