import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ConfigService } from './config.service';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true, // Torna o ConfigModule disponível globalmente
    }),
  ],
  providers: [ConfigService],
  exports: [ConfigService], // Exporta ConfigService para uso em outros módulos
})
export class ConfigModule {}