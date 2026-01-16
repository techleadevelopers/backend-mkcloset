import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProductEntity } from './entities/product.entity';
import { ProductQueryDto } from './dto/product-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createProductDto: any): Promise<ProductEntity> {
    // Implemente a lógica de criação do produto aqui
    // Exemplo:
    // const newProduct = await this.prisma.product.create({ data: createProductDto });
    // return new ProductEntity(newProduct);
    throw new Error('Método create ainda não implementado.');
  }

  async findAll(query: ProductQueryDto): Promise<ProductEntity[]> {
    const { search, sortBy, sortOrder, categoryId, colors, sizes, page, limit } = query;

    const where: Prisma.ProductWhereInput = {};
    
    // Filtro por busca em nome e descrição
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Filtro por categoria
    if (categoryId) {
      where.categoryId = categoryId;
    }

    // Filtro por cores e tamanhos usando 'hasSome'
    if (colors) {
      const colorArray = colors.split(',');
      where.colors = { hasSome: colorArray };
    }

    if (sizes) {
      const sizeArray = sizes.split(',');
      where.sizes = { hasSome: sizeArray };
    }

    // Paginação
    const take = limit || 10;
    const skip = ((page || 1) - 1) * take;

    // Ordenação
    const orderBy: Prisma.ProductOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder || 'asc' }
      : { createdAt: 'desc' }; // Ordenação padrão

    const products = await this.prisma.product.findMany({
      where,
      orderBy,
      take,
      skip,
    });

    // CORRIGIDO: Lógica para construir o caminho completo da imagem
    const productsWithCorrectPath = products.map(product => {
      let folderName = '';
      const productName = product.name.toLowerCase();

      // Mapeia o nome do produto para a subpasta correspondente
      if (productName.includes('julia')) {
        folderName = 'conjunto-julia';
      } else if (productName.includes('glamour')) {
        folderName = 'conjunto-glamour';
      } else if (productName.includes('olivia')) {
        folderName = 'conjunto-olivia';
      }

      // Se o produto tiver uma imagem e uma subpasta, constrói a URL completa
      if (product.images && product.images.length > 0 && folderName) {
        // CORREÇÃO: Usa 'product.images[0]' no lugar de 'product.imageUrl'
        product.images[0] = `/images/${folderName}/${product.images[0]}`;
      } else {
        // Se não tiver imagem, defina um valor padrão ou null
        // Depende de como seu front-end lida com a ausência de imagens
      }

      return new ProductEntity(product);
    });

    return productsWithCorrectPath;
  }

  async findFeatured(): Promise<ProductEntity[]> {
    const featuredProducts = await this.prisma.product.findMany({
      where: {
        isFeatured: true,
      },
    });

    return featuredProducts.map(product => new ProductEntity(product));
  }

  async findOne(id: string): Promise<ProductEntity> {
    const product = await this.prisma.product.findUnique({ where: { id } });

    if (!product) {
      throw new NotFoundException(`Produto com ID "${id}" não encontrado.`);
    }

    return new ProductEntity(product);
  }

  async update(id: string, updateProductDto: any): Promise<ProductEntity> {
    // Implemente a lógica de atualização do produto aqui
    // Exemplo:
    // const updatedProduct = await this.prisma.product.update({
    //   where: { id },
    //   data: updateProductDto,
    // });
    // return new ProductEntity(updatedProduct);
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