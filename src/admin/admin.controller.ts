import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { AntifraudStatus } from 'src/antifraud/antifraud.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { AdminService } from './admin.service';

class InitiateRefundDto {
  amount?: number;
}

class UpdateAntifraudStatusDto {
  status: AntifraudStatus;
  reason?: string;
}

class UpdateOrderStatusDto {
  @IsIn([
    OrderStatus.PENDING,
    OrderStatus.PAID,
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
    OrderStatus.REFUNDED,
  ])
  status: OrderStatus;

  @IsOptional()
  @IsString()
  carrier?: string;

  @IsOptional()
  @IsString()
  postedAt?: string;

  @IsOptional()
  @IsString()
  trackingCode?: string;

  @IsOptional()
  @IsString()
  trackingUrl?: string;

  @IsOptional()
  @IsIn(['PROCESSING'])
  notifyStage?: 'PROCESSING';
}

class SendTestEmailDto {
  @IsEmail()
  to: string;

  @IsIn([
    'ORDER_CREATED',
    'PAYMENT_APPROVED',
    'ORDER_PROCESSING',
    'ORDER_SHIPPED',
    'ORDER_DELIVERED',
  ])
  template:
    | 'ORDER_CREATED'
    | 'PAYMENT_APPROVED'
    | 'ORDER_PROCESSING'
    | 'ORDER_SHIPPED'
    | 'ORDER_DELIVERED';

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalAmount?: number;

  @IsOptional()
  @IsString()
  carrier?: string;

  @IsOptional()
  @IsString()
  postedAt?: string;

  @IsOptional()
  @IsString()
  trackingCode?: string;

  @IsOptional()
  @IsString()
  trackingUrl?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('refunds/:transactionId')
  @Roles(Role.ADMIN)
  async initiateRefund(
    @Param('transactionId') transactionId: string,
    @Body() initiateRefundDto: InitiateRefundDto,
  ) {
    return this.adminService.processRefund(
      transactionId,
      initiateRefundDto.amount,
    );
  }

  @Patch('antifraud/transactions/:transactionId/status')
  @Roles(Role.ADMIN)
  async updateAntifraudStatus(
    @Param('transactionId') transactionId: string,
    @Body() updateAntifraudStatusDto: UpdateAntifraudStatusDto,
  ) {
    return this.adminService.updateTransactionAntifraudStatus(
      transactionId,
      updateAntifraudStatusDto.status,
      updateAntifraudStatusDto.reason,
    );
  }

  @Get('orders')
  @Roles(Role.ADMIN)
  async getAllOrders() {
    return this.adminService.getAllOrdersForAdmin();
  }

  @Patch('orders/:orderId/status')
  @Roles(Role.ADMIN)
  async updateOrderStatus(
    @Param('orderId') orderId: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
  ) {
    return this.adminService.updateOrderStatus(
      orderId,
      updateOrderStatusDto.status,
      {
        carrier: updateOrderStatusDto.carrier,
        postedAt: updateOrderStatusDto.postedAt,
        trackingCode: updateOrderStatusDto.trackingCode,
        trackingUrl: updateOrderStatusDto.trackingUrl,
        notifyStage: updateOrderStatusDto.notifyStage,
      },
    );
  }

  @Get('payment-logs')
  @Roles(Role.ADMIN)
  async listPaymentLogs() {
    return this.adminService.getTransactionLogs();
  }

  @Post('test-email')
  @Roles(Role.ADMIN)
  async sendTestEmail(@Body() sendTestEmailDto: SendTestEmailDto) {
    return this.adminService.sendTestEmail(sendTestEmailDto);
  }
}
