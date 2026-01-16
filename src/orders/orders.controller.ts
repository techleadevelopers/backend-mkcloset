// src/orders/orders.controller.ts
import { Controller, Post, Body, Param, UseGuards, Get, Query, BadRequestException } from '@nestjs/common'; // NOVO: Adicionado Query e BadRequestException
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OptionalJwtAuthGuard } from 'src/auth/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { User } from '@prisma/client';

// Aplica o OptionalJwtAuthGuard na classe para que todos os métodos o usem
// Ou aplique individualmente se houver métodos que SÓ podem ser acessados por logados
@UseGuards(OptionalJwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  // MUDANÇA AQUI: createOrderDto vem primeiro, user? vem depois
  async create(@Body() createOrderDto: CreateOrderDto, @CurrentUser() user?: User) {
    // MUDANÇA AQUI: A ordem dos argumentos na chamada ao service foi ajustada
    return this.ordersService.create(createOrderDto, user?.id);
  }

  // Rotas que exigem autenticação ainda podem usar JwtAuthGuard explicitamente
  // ou confiar no OptionalJwtAuthGuard e verificar 'user' dentro do método.
  // Para findAll e findOne, provavelmente você ainda quer que seja para o usuário logado.
  // Se sim, você pode adicionar @UseGuards(JwtAuthGuard) a esses métodos ou
  // remover o OptionalJwtAuthGuard da classe e aplicar individualmente.
  // Mantendo JwtAuthGuard para garantir que essas rotas SÓ funcionem para logados.
  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@CurrentUser() user: User) {
    return this.ordersService.findAllByUserId(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.ordersService.findOneByUserId(user.id, id);
  }

  // NOVO ENDPOINT: Rastreamento de pedidos para convidados
  // Pode ser acessado sem autenticação, mas exige o guestId (ou email) para validação
  @Get('track/:orderId')
  async trackGuestOrder(
    @Param('orderId') orderId: string,
    @Query('guestId') guestId: string, // Ou @Query('email') email: string
  ) {
    // É crucial que o guestId seja passado para validar se o convidado tem acesso ao pedido
    if (!guestId) {
      throw new BadRequestException('O ID do convidado (guestId) é obrigatório para rastrear o pedido.');
    }
    return this.ordersService.findOneByGuestId(guestId, orderId);
  }
}