// src/admin/admin.controller.ts
import { Controller, Post, Param, Body, UseGuards, Patch, Get } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { AdminService } from './admin.service'; // NOVO: Importe o AdminService
import { AntifraudStatus } from 'src/antifraud/antifraud.service'; // Importe o tipo AntifraudStatus

// Exemplo de DTO para reembolso
class InitiateRefundDto {
  amount?: number; // Opcional, para reembolso parcial
}

// Exemplo de DTO para atualização de status antifraude
class UpdateAntifraudStatusDto {
  status: AntifraudStatus; // Use o tipo correto
  reason?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard) // Protege todas as rotas do admin
@Roles(Role.ADMIN) // Apenas usuários com a role ADMIN podem acessar
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService, // NOVO: Injete o AdminService
  ) {}

  @Post('refunds/:transactionId')
  async initiateRefund(
    @Param('transactionId') transactionId: string,
    @Body() initiateRefundDto: InitiateRefundDto,
  ) {
    return this.adminService.processRefund(transactionId, initiateRefundDto.amount);
  }

  @Patch('antifraud/transactions/:transactionId/status')
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
  async getAllOrders() {
    return this.adminService.getAllOrdersForAdmin();
  }

  // Outros endpoints administrativos podem ser adicionados aqui
}