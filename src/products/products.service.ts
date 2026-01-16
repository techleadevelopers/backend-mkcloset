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

    // Filtro por busca em nome e descrição
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Filtro por categoria
    if (categorySlug) {
      where.category = { is: { slug: categorySlug } };
    } else if (categoryId) {
      where.categoryId = categoryId;
    }

    // Filtro por cores e tamanhos
    if (colors) {
      const colorArray = colors.split(',');
      where.colors = { hasSome: colorArray };
    }

    if (sizes) {
      const sizeArray = sizes.split(',');
      where.sizes = { hasSome: sizeArray };
    }

    // Paginação
    const take = Number(limit) || 10;
    const skip = ((Number(page) || 1) - 1) * take;

    // Ordenação
    const orderBy: Prisma.ProductOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder || 'asc' }
      : { createdAt: 'desc' };

    const products = await this.prisma.product.findMany({
      where,
      orderBy,
      take,
      skip,
      include: { category: true } // Importante para o frontend
    });

    // Mantém sua lógica de construção de caminho de imagem
    const productsWithCorrectPath = products.map((product) => {
      let folderName = '';
      const productName = product.name.toLowerCase();

      // Mapeia o nome do produto para a subpasta (ajustado para aceitar nomes parciais se houver bug de acento)
      if (productName.includes('julia')) {
        folderName = 'conjunto-julia';
      } else if (productName.includes('glamour')) {
        folderName = 'conjunto-glamour';
      } else if (productName.includes('olivia')) {
        folderName = 'conjunto-olivia';
      } else if (productName.includes('po')) { // Captura "Poá" mesmo se o banco enviar "Po "
        folderName = 'conjunto-poa';
      }

      const imagesWithPath =
        product.images && product.images.length > 0 && folderName
          ? [
              `/images/${folderName}/${product.images[0]}`,
              ...product.images.slice(1),
            ]
          : product.images;

      return new ProductEntity({
        ...product,
        images: imagesWithPath,
      });
    });

    return productsWithCorrectPath;
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

    if (!product) {
      throw new NotFoundException(`Produto com ID "${id}" não encontrado.`);
    }

    return new ProductEntity(product);
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