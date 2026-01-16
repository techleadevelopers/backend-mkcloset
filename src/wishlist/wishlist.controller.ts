import { Controller, Get, Post, Body, Param, Delete, UseGuards } from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { AddToWishlistDto } from './dto/add-to-wishlist.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { User } from '@prisma/client'; // Importa o tipo User do Prisma

@UseGuards(JwtAuthGuard)
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  async getWishlist(@CurrentUser() user: User) {
    return this.wishlistService.getOrCreateWishlist(user.id);
  }

  @Post('items')
  async addItemToWishlist(@CurrentUser() user: User, @Body() addToWishlistDto: AddToWishlistDto) {
    return this.wishlistService.addItemToWishlist(user.id, addToWishlistDto.productId);
  }

  @Delete('items/:productId')
  async removeItemFromWishlist(@CurrentUser() user: User, @Param('productId') productId: string) {
    return this.wishlistService.removeItemFromWishlist(user.id, productId);
  }
}