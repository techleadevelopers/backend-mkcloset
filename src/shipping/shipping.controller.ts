import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { CalculateShippingDto } from './dto/calculate-shipping.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { User } from '@prisma/client';

// O cálculo de frete pode ser público ou exigir autenticação, dependendo da regra de negócio.
// Para este exemplo, vamos deixá-lo público, como no frontend.
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Post('calculate')
  async calculateShipping(@Body() calculateShippingDto: CalculateShippingDto) {
    return this.shippingService.calculateShipping(calculateShippingDto);
  }
}