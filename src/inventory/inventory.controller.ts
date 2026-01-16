import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { UpdateStockDto } from './dto/update-stock.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
// import { RolesGuard } from 'src/common/guards/roles.guard'; // Para controle de acesso por função (ex: admin)
// import { Roles } from 'src/common/decorators/roles.decorator'; // Decorator de funções

// Geralmente, o controle de estoque é uma rota protegida para administradores
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get(':productId')
  async getStock(@Param('productId') productId: string) {
    return this.inventoryService.getStock(productId);
  }

  // @Roles('admin') // Exemplo de proteção por função
  @Patch(':productId/stock')
  async updateStock(@Param('productId') productId: string, @Body() updateStockDto: UpdateStockDto) {
    return this.inventoryService.updateStock(productId, updateStockDto.quantity);
  }
}