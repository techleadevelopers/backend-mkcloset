import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProductEntity } from './entities/product.entity';
import { ProductQueryDto } from './dto/product-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createProductDto: any): Promise<ProductEntity> {
    throw new Error('Método create ainda não implementado.');
  }

  async findAll(query: ProductQueryDto): Promise<ProductEntity[]> {
    const { search, sortBy, sortOrder, categoryId, categorySlug, colors, sizes, page, limit } = query;

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
      where.colors = { hasSome: colors.split(',') };
    }

    if (sizes) {
      where.sizes = { hasSome: sizes.split(',') };
    }

    const take = limit || 10;
    const skip = ((page || 1) - 1) * take;
    const orderBy: Prisma.ProductOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder || 'asc' }
      : { createdAt: 'desc' };

    const products = await this.prisma.product.findMany({
      where,
      orderBy,
      take,
      skip,
      include: { category: true } // Garante que a categoria venha junto
    });

    return products.map((product) => {
      // Normalização simples para evitar erro de case/acentuação no mapeamento de pastas
      const normalizedName = product.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      
      let folderName = '';
      if (normalizedName.includes('julia')) folderName = 'conjunto-julia';
      else if (normalizedName.includes('glamour')) folderName = 'conjunto-glamour';
      else if (normalizedName.includes('olivia')) folderName = 'conjunto-olivia';

      const imagesWithPath = product.images && product.images.length > 0 && folderName
        ? [`/images/${folderName}/${product.images[0]}`, ...product.images.slice(1)]
        : product.images;

      return new ProductEntity({
        ...product,
        images: imagesWithPath,
      });
    });
  }

  async findFeatured(): Promise<ProductEntity[]> {
    const featuredProducts = await this.prisma.product.findMany({
      where: { isFeatured: true },
      include: { category: true }
    });
    return featuredProducts.map((product) => new ProductEntity(product));
  }

  async findOne(id: string): Promise<ProductEntity> {
    const product = await this.prisma.product.findUnique({ 
      where: { id },
      include: { category: true }
    });
    if (!product) throw new NotFoundException(`Produto com ID "${id}" não encontrado.`);
    return new ProductEntity(product);
  }

  async update(id: string, updateProductDto: any): Promise<ProductEntity> {
    throw new Error('Método update ainda não implementado.');
  }

  async remove(id: string): Promise<ProductEntity> {
    try {
      const removedProduct = await this.prisma.product.delete({ where: { id } });
      return new ProductEntity(removedProduct);
    } catch (error) {
      throw new NotFoundException(`Produto com ID "${id}" não encontrado.`);
    }
  }
}