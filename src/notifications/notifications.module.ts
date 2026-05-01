import { Module } from '@nestjs/common';
import { ConfigModule } from 'src/config/config.module';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [ConfigModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
