import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProductsService } from 'src/products/products.service';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private productsService: ProductsService,
  ) {}

  async getStock(productId: string) {
    const product = await this.productsService.findOne(productId);
    return { productId: product.id, stock: product.stock };
  }

  async updateStock(productId: string, quantity: number) {
    if (quantity < 0) {
      throw new BadRequestException('A quantidade de estoque não pode ser negativa.');
    }

    const product = await this.productsService.findOne(productId);

    // Atualiza o estoque do produto
    const updatedProduct = await this.prisma.product.update({
      where: { id: productId },
      data: { stock: quantity },
    });

    return { productId: updatedProduct.id, stock: updatedProduct.stock };
  }

  // Métodos para decrementar/incrementar estoque (usados por OrdersService)
  async decrementStock(productId: string, quantity: number) {
    const product = await this.productsService.findOne(productId);
    if (product.stock < quantity) {
      throw new BadRequestException(`Estoque insuficiente para o produto "${product.name}". Disponível: ${product.stock}, solicitado: ${quantity}.`);
    }
    return this.prisma.product.update({
      where: { id: productId },
      data: { stock: { decrement: quantity } },
    });
  }

  async incrementStock(productId: string, quantity: number) {
    return this.prisma.product.update({
      where: { id: productId },
      data: { stock: { increment: quantity } },
    });
  }
}