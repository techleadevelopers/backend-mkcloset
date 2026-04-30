import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Get,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OptionalJwtAuthGuard } from 'src/auth/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { ConfigService } from 'src/config/config.service';
import { createHmac } from 'crypto';

@UseGuards(OptionalJwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly configService: ConfigService,
  ) {}

  private verifyGuest(guestId?: string, signature?: string) {
    if (!guestId) {
      throw new BadRequestException('guestId e obrigatorio para convidados.');
    }
    const expected = createHmac('sha256', this.configService.guestSigningSecret)
      .update(guestId)
      .digest('hex');
    if (expected !== signature) {
      throw new BadRequestException('Assinatura de guestId invalida.');
    }
  }

  @Post()
  async create(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUser() user?: User,
  ) {
    if (!user) {
      this.verifyGuest(
        createOrderDto.guestId,
        (createOrderDto as any)?.signature ||
          (createOrderDto as any)?.['x-guest-signature'],
      );
    }
    return this.ordersService.create(createOrderDto, user?.id);
  }

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

  @Get('track/:orderId')
  async trackGuestOrder(
    @Param('orderId') orderId: string,
    @Query('guestId') guestId?: string,
    @Query('email') email?: string,
  ) {
    if (guestId) {
      return this.ordersService.findOneByGuestId(guestId, orderId);
    }

    if (!email) {
      throw new BadRequestException(
        'Informe o guestId ou o e-mail usado no pedido para rastrear a compra.',
      );
    }

    return this.ordersService.findOneByGuestEmail(email, orderId);
  }
}
