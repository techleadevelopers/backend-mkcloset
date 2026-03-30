// src/cart/cart.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  BadRequestException,
  Query,
  UnauthorizedException,
  Headers,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'; // Para rotas que SÓ usuários logados podem acessar
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { OptionalJwtAuthGuard } from 'src/auth/guards/optional-jwt-auth.guard'; // Para rotas que usuários logados OU convidados podem acessar
import { ConfigService } from 'src/config/config.service';
import { createHmac } from 'crypto';

@Controller('cart')
export class CartController {
  constructor(
    private readonly cartService: CartService,
    private readonly configService: ConfigService,
  ) {}

  private verifyGuestSignature(guestId?: string, signature?: string) {
    if (!guestId || guestId.length < 20) {
      throw new BadRequestException(
        'ID de convidado ausente ou inválido na requisição.',
      );
    }
    if (!signature) {
      throw new UnauthorizedException('Assinatura do guestId ausente.');
    }
    const expected = createHmac('sha256', this.configService.guestSigningSecret)
      .update(guestId)
      .digest('hex');
    if (expected !== signature) {
      throw new UnauthorizedException('Assinatura do guestId inválida.');
    }
  }

  // Rota para usuários logados verem seu próprio carrinho
  // Esta rota AINDA exige autenticação JWT, pois é para o carrinho associado a um usuário registrado.
  @UseGuards(JwtAuthGuard)
  @Get()
  async getCart(@CurrentUser() user: User) {
    return this.cartService.getCartForUser(user.id);
  }

  // Rota para usuários convidados recuperarem seu carrinho
  // Usa OptionalJwtAuthGuard para permitir acesso sem JWT, mas foca no guestId.
  @UseGuards(OptionalJwtAuthGuard)
  @Get('guest')
  async getGuestCart(
    @Query('guestId') guestId?: string,
    @Query('signature') signatureQuery?: string,
    @Headers('x-guest-signature') signatureHeader?: string,
  ) {
    this.verifyGuestSignature(guestId, signatureHeader || signatureQuery);
    return this.cartService.getCartForGuest(guestId!);
  }

  // Adicionar item ao carrinho (para usuários logados ou convidados)
  // Usa OptionalJwtAuthGuard para permitir que convidados também adicionem itens.
  @UseGuards(OptionalJwtAuthGuard)
  @Post('items')
  async addItemToCart(
    @Body() addToCartDto: AddToCartDto,
    @CurrentUser() user?: User, // user pode ser undefined para convidados
  ) {
    const userId = user?.id;
    const guestId = addToCartDto.guestId; // Assumindo que AddToCartDto tem um campo guestId opcional
    if (!userId) {
      this.verifyGuestSignature(guestId, (addToCartDto as any)?.signature);
    }

    // O serviço será responsável por criar/atualizar o carrinho com base em userId ou guestId
    return this.cartService.addItemToCart(addToCartDto, userId, guestId);
  }

  // Atualizar quantidade de um item no carrinho (para usuários logados ou convidados)
  // Usa OptionalJwtAuthGuard para permitir que convidados também atualizem itens.
  @UseGuards(OptionalJwtAuthGuard)
  @Patch('items/:itemId')
  async updateCartItemQuantity(
    @CurrentUser() user: User | undefined, // user pode ser undefined para convidados
    @Param('itemId') itemId: string,
    @Body() updateCartItemDto: UpdateCartItemDto,
    @Query('guestId') guestId?: string, // Recebe guestId da query string para convidados
    @Query('signature') signatureQuery?: string,
    @Headers('x-guest-signature') signatureHeader?: string,
  ) {
    const userId = user?.id;
    if (!userId) this.verifyGuestSignature(guestId, signatureHeader || signatureQuery);
    // O serviço precisará de lógica para encontrar o carrinho certo (por userId ou guestId)
    return this.cartService.updateCartItemQuantity(
      userId,
      guestId,
      itemId,
      updateCartItemDto.quantity,
    );
  }

  // Remover item do carrinho (para usuários logados ou convidados)
  // Usa OptionalJwtAuthGuard para permitir que convidados também removam itens.
  @UseGuards(OptionalJwtAuthGuard)
  @Delete('items/:itemId')
  async removeCartItem(
    @CurrentUser() user: User | undefined, // user pode ser undefined para convidados
    @Param('itemId') itemId: string,
    @Query('guestId') guestId?: string, // Recebe guestId da query string para convidados
    @Query('signature') signatureQuery?: string,
    @Headers('x-guest-signature') signatureHeader?: string,
  ) {
    const userId = user?.id;
    if (!userId) this.verifyGuestSignature(guestId, signatureHeader || signatureQuery);
    // O serviço precisará de lógica para encontrar o carrinho certo (por userId ou guestId)
    return this.cartService.removeCartItem(userId, guestId, itemId);
  }

  // Limpar todo o carrinho (para usuários logados ou convidados)
  // Esta é a rota que estava causando o erro 401 para convidados.
  // Agora usa OptionalJwtAuthGuard e aceita guestId.
  @UseGuards(OptionalJwtAuthGuard)
  @Delete('clear')
  async clearCart(
    @CurrentUser() user: User | undefined, // user pode ser undefined para convidados
    @Query('guestId') guestId?: string, // Recebe guestId da query string para convidados
    @Query('signature') signatureQuery?: string,
    @Headers('x-guest-signature') signatureHeader?: string,
  ) {
    const userId = user?.id;
    if (!userId) this.verifyGuestSignature(guestId, signatureHeader || signatureQuery);
    // O serviço precisará de lógica para encontrar o carrinho certo (por userId ou guestId)
    return this.cartService.clearCart(userId, guestId);
  }

  // Endpoint para assinar guestId (retorna assinatura HMAC)
  @Get('guest/sign')
  async signGuest(@Query('guestId') guestId?: string) {
    if (!guestId || guestId.length < 20) {
      throw new BadRequestException('guestId inválido para assinatura.');
    }
    const signature = createHmac('sha256', this.configService.guestSigningSecret)
      .update(guestId)
      .digest('hex');
    return { guestId, signature };
  }
}
