// src/common/common.module.ts
import { Module } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { TransformInterceptor } from './interceptors/transform.interceptor';
import { AppConstants } from './constants/app.constants';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [
    JwtAuthGuard,
    // CurrentUser, // Removido
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: AppConstants,
      useValue: AppConstants,
    },
  ],
  exports: [
    JwtAuthGuard,
    // CurrentUser, // Removido
    AppConstants,
  ],
})
export class CommonModule {}