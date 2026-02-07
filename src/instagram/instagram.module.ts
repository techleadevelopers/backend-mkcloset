import { Module } from '@nestjs/common';
import { InstagramService } from './instagram.service';
import { InstagramController } from './instagram.controller';
import { FacebookAuthController } from './facebook-auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [InstagramService],
  controllers: [InstagramController, FacebookAuthController],
  exports: [InstagramService],
})
export class InstagramModule {}
