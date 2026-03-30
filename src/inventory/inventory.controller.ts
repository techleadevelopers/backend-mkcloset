import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { UpdateStockDto } from './dto/update-stock.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '@prisma/client';

// Controle de estoque é exclusivo de administradores
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get(':productId')
  async getStock(@Param('productId') productId: string) {
    return this.inventoryService.getStock(productId);
  }

  @Roles(Role.ADMIN)
  @Patch(':productId/stock')
  async updateStock(
    @Param('productId') productId: string,
    @Body() updateStockDto: UpdateStockDto,
  ) {
    return this.inventoryService.updateStock(
      productId,
      updateStockDto.quantity,
    );
  }
}
