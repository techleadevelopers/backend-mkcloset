// src/antifraud/antifraud.module.ts
import { Module } from '@nestjs/common';
import { AntifraudService } from './antifraud.service';
import { ConfigModule } from 'src/config/config.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [
    ConfigModule, // Necessário se AntifraudService usar ConfigService
    PrismaModule, // Necessário se AntifraudService usar PrismaService
  ],
  providers: [
    AntifraudService,
  ],
  exports: [
    AntifraudService, // Exporta para outros módulos, como PaymentsModule
  ],
})
export class AntifraudModule {}
