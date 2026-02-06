import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProductEntity } from './entities/product.entity';
import { ProductQueryDto } from './dto/product-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // Função centralizada para não repetir lógica de tratamento em cada método
  private formatProduct(product: any): ProductEntity {
    // Se no banco a imagem já for completa (Cloudinary/HTTP), enviamos ela pura.
    // Se for um path relativo que você quer manter, o banco já deve trazer o path certo.
    // Removemos aquele if/else de 'julia', 'glamour', etc.
    return new ProductEntity(product);
  }

  async create(createProductDto: any): Promise<ProductEntity> {
    throw new Error('Método create ainda não implementado.');
  }

  async findAll(query: ProductQueryDto): Promise<ProductEntity[]> {
    const {
      search,
      sortBy,
      sortOrder,
      categoryId,
      categorySlug,
      colors,
      sizes,
      page,
      limit,
    } = query;

    const where: Prisma.ProductWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (categorySlug) {
      where.category = { is: { slug: categorySlug } };
    } else if (categoryId) {
      where.categoryId = categoryId;
    }

    if (colors) {
      const colorArray = colors.split(',');
      where.colors = { hasSome: colorArray };
    }

    if (sizes) {
      const sizeArray = sizes.split(',');
      where.sizes = { hasSome: sizeArray };
    }

    const take = Number(limit) || 10;
    const skip = ((Number(page) || 1) - 1) * take;

    const orderBy: Prisma.ProductOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder || 'asc' }
      : { createdAt: 'desc' };

    const products = await this.prisma.product.findMany({
      where,
      orderBy,
      take,
      skip,
      include: { category: true }
    });

    // MAPEAMENTO LIMPO: Apenas converte para Entity sem injetar strings fixas
    return products.map((product) => this.formatProduct(product));
  }

  async findFeatured(): Promise<ProductEntity[]> {
    const featuredProducts = await this.prisma.product.findMany({
      where: { isFeatured: true },
      include: { category: true }
    });
    return featuredProducts.map((product) => this.formatProduct(product));
  }

  async findOne(id: string): Promise<ProductEntity> {
    const product = await this.prisma.product.findUnique({ 
      where: { id },
      include: { category: true }
    });

    if (!product) {
      throw new NotFoundException(`Produto com ID "${id}" não encontrado.`);
    }

    return this.formatProduct(product);
  }

  async update(id: string, updateProductDto: any): Promise<ProductEntity> {
    throw new Error('Método update ainda não implementado.');
  }

  async remove(id: string): Promise<ProductEntity> {
    try {
      const removedProduct = await this.prisma.product.delete({
        where: { id },
      });
      return new ProductEntity(removedProduct);
    } catch (error) {
      throw new NotFoundException(`Produto com ID "${id}" não encontrado.`);
    }
  }
}