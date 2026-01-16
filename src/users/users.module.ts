import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationsModule } from 'src/notifications/notifications.module'; // IMPORTANTE: Importe o NotificationsModule


@Module({
  imports: [PrismaModule,
    NotificationsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // Exporta UsersService para ser usado em AuthModule
})
export class UsersModule {}