import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProductsService } from 'src/products/products.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class WishlistService {
  constructor(
    private prisma: PrismaService,
    private productsService: ProductsService,
  ) {}

  async getOrCreateWishlist(userId: string) {
    let wishlist = await this.prisma.wishlist.findUnique({
      where: { userId },
      include: {
        items: {
          include: { product: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!wishlist) {
      wishlist = await this.prisma.wishlist.create({
        data: { userId },
        include: { items: { include: { product: true } } },
      });
    }
    return wishlist;
  }

  async addItemToWishlist(userId: string, productId: string) {
    const product = await this.productsService.findOne(productId);
    if (!product) {
      throw new NotFoundException(`Produto com ID "${productId}" não encontrado.`);
    }

    const wishlist = await this.getOrCreateWishlist(userId);

    const existingWishlistItem = await this.prisma.wishlistItem.findFirst({
      where: {
        wishlistId: wishlist.id,
        productId,
      },
    });

    if (existingWishlistItem) {
      throw new ConflictException(`Produto com ID "${productId}" já está na sua wishlist.`);
    }

    return this.prisma.wishlistItem.create({
      data: {
        wishlistId: wishlist.id,
        productId,
      },
      include: { wishlist: { include: { items: { include: { product: true } } } } },
    });
  }

  async removeItemFromWishlist(userId: string, productId: string) {
    const wishlist = await this.getOrCreateWishlist(userId);

    const wishlistItem = await this.prisma.wishlistItem.findFirst({
      where: {
        wishlistId: wishlist.id,
        productId,
      },
    });

    if (!wishlistItem) {
      throw new NotFoundException(`Produto com ID "${productId}" não encontrado na sua wishlist.`);
    }

    await this.prisma.wishlistItem.delete({ where: { id: wishlistItem.id } });

    const updatedWishlist = await this.prisma.wishlist.findUnique({
      where: { id: wishlist.id },
      include: { items: { include: { product: true } } },
    });
    return updatedWishlist;
  }
}