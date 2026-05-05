import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { ConfigService } from 'src/config/config.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { normalizeProductColorLabels } from './product-colors';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductEntity } from './entities/product.entity';

type UploadedImageFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private sanitizeStringArray(values?: string[]): string[] {
    if (!Array.isArray(values)) return [];

    return values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private buildImages(images?: string[], imageUrl?: string): string[] {
    const sanitizedImages = this.sanitizeStringArray(images);
    const primaryImage = typeof imageUrl === 'string' ? imageUrl.trim() : '';

    if (primaryImage && !sanitizedImages.includes(primaryImage)) {
      return [primaryImage, ...sanitizedImages];
    }

    return sanitizedImages;
  }

  private formatProduct(product: any): ProductEntity {
    return new ProductEntity(product);
  }

  async uploadImage(file: UploadedImageFile): Promise<{ secureUrl: string }> {
    if (!file.mimetype?.startsWith('image/')) {
      throw new Error('Arquivo inválido. Envie uma imagem.');
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'mkcloset/products';
    const signature = createHash('sha1')
      .update(`folder=${folder}&timestamp=${timestamp}${this.configService.cloudinaryApiSecret}`)
      .digest('hex');

    const formData = new FormData();
    formData.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
    formData.append('api_key', this.configService.cloudinaryApiKey);
    formData.append('timestamp', String(timestamp));
    formData.append('folder', folder);
    formData.append('signature', signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${this.configService.cloudinaryCloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
      },
    );

    if (!response.ok) {
      throw new Error('Falha ao enviar imagem para o Cloudinary.');
    }

    const payload = (await response.json()) as { secure_url?: string };
    if (!payload.secure_url) {
      throw new Error('Cloudinary não retornou a URL da imagem.');
    }

    return { secureUrl: payload.secure_url };
  }

  async create(createProductDto: CreateProductDto): Promise<ProductEntity> {
    const category = await this.prisma.category.findUnique({
      where: { id: createProductDto.categoryId },
    });

    if (!category) {
      throw new NotFoundException(
        `Categoria com ID "${createProductDto.categoryId}" não encontrada.`,
      );
    }

    const price = Number(createProductDto.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new Error('Preço inválido.');
    }

    const originalPrice =
      createProductDto.originalPrice !== undefined &&
      createProductDto.originalPrice !== null
        ? Number(createProductDto.originalPrice)
        : null;

    if (
      originalPrice !== null &&
      (!Number.isFinite(originalPrice) || originalPrice < 0)
    ) {
      throw new Error('Preço original inválido.');
    }

    const weight =
      createProductDto.weight !== undefined && createProductDto.weight !== null
        ? Number(createProductDto.weight)
        : null;

    if (weight !== null && (!Number.isFinite(weight) || weight < 0)) {
      throw new Error('Peso inválido.');
    }

    const images = this.buildImages(
      createProductDto.images,
      createProductDto.imageUrl,
    );
    const sizes = this.sanitizeStringArray(createProductDto.sizes);
    const colors = normalizeProductColorLabels(
      this.sanitizeStringArray(createProductDto.colors),
    );
    const stock = Math.max(0, Number(createProductDto.stock) || 0);
    const discount =
      createProductDto.discount !== undefined &&
      createProductDto.discount !== null
        ? Math.max(0, Math.trunc(Number(createProductDto.discount) || 0))
        : null;

    const created = await this.prisma.product.create({
      data: {
        name: createProductDto.name.trim(),
        description: createProductDto.description?.trim() || null,
        price,
        originalPrice,
        images,
        imgBanner: null,
        categoryId: createProductDto.categoryId,
        sizes,
        colors,
        isNew: Boolean(createProductDto.isNew),
        isFeatured: Boolean(createProductDto.isFeatured),
        discount,
        stock,
        weight,
        dimensions: createProductDto.dimensions
          ? (createProductDto.dimensions as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
      include: { category: true },
    });

    return this.formatProduct({
      ...created,
      imageUrl: images[0] ?? null,
    });
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

    if (query.isFeatured !== undefined) {
      where.isFeatured = query.isFeatured;
    }

    if (query.onSale) {
      where.discount = { gt: 0 };
    }

    if (categorySlug) {
      where.category = { is: { slug: categorySlug } };
    } else if (categoryId) {
      where.categoryId = categoryId;
    }

    if (colors) {
      where.colors = {
        hasSome: normalizeProductColorLabels(colors.split(',')),
      };
    }

    if (sizes) {
      where.sizes = { hasSome: sizes.split(',') };
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
      include: { category: true },
    });

    return products.map((product) =>
      this.formatProduct({
        ...product,
        imageUrl: product.images?.[0] ?? null,
      }),
    );
  }

  async findFeatured(): Promise<ProductEntity[]> {
    const featuredProducts = await this.prisma.product.findMany({
      where: { isFeatured: true },
      include: { category: true },
    });

    return featuredProducts.map((product) =>
      this.formatProduct({
        ...product,
        imageUrl: product.images?.[0] ?? null,
      }),
    );
  }

  async findOne(id: string): Promise<ProductEntity> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!product) {
      throw new NotFoundException(`Produto com ID "${id}" não encontrado.`);
    }

    return this.formatProduct({
      ...product,
      imageUrl: product.images?.[0] ?? null,
    });
  }

  async update(id: string, updateProductDto: UpdateProductDto): Promise<ProductEntity> {
    const data: Prisma.ProductUncheckedUpdateInput = {};

    if (updateProductDto.name !== undefined) {
      data.name = updateProductDto.name.trim();
    }

    if (updateProductDto.description !== undefined) {
      data.description = updateProductDto.description?.trim() || null;
    }

    if (updateProductDto.categoryId !== undefined) {
      const category = await this.prisma.category.findUnique({
        where: { id: updateProductDto.categoryId },
      });

      if (!category) {
        throw new NotFoundException(
          `Categoria com ID "${updateProductDto.categoryId}" não encontrada.`,
        );
      }

      data.categoryId = updateProductDto.categoryId;
    }

    if (updateProductDto.stock !== undefined) {
      data.stock = Math.max(0, Number(updateProductDto.stock) || 0);
    }

    if (updateProductDto.price !== undefined) {
      const price = Number(updateProductDto.price);
      if (!Number.isFinite(price) || price < 0) {
        throw new Error('Preço inválido.');
      }
      data.price = price;
    }

    if (updateProductDto.originalPrice !== undefined) {
      if (updateProductDto.originalPrice === null) {
        data.originalPrice = null;
      } else {
        const originalPrice = Number(updateProductDto.originalPrice);
        if (!Number.isFinite(originalPrice) || originalPrice < 0) {
          throw new Error('Preço original inválido.');
        }
        data.originalPrice = originalPrice;
      }
    }

    if (updateProductDto.sizes !== undefined) {
      data.sizes = this.sanitizeStringArray(updateProductDto.sizes);
    }

    if (updateProductDto.colors !== undefined) {
      data.colors = normalizeProductColorLabels(
        this.sanitizeStringArray(updateProductDto.colors),
      );
    }

    if (
      updateProductDto.images !== undefined ||
      updateProductDto.imageUrl !== undefined
    ) {
      data.images = this.buildImages(
        updateProductDto.images,
        updateProductDto.imageUrl,
      );
    }

    if (updateProductDto.isNew !== undefined) {
      data.isNew = Boolean(updateProductDto.isNew);
    }

    if (updateProductDto.isFeatured !== undefined) {
      data.isFeatured = Boolean(updateProductDto.isFeatured);
    }

    if (updateProductDto.discount !== undefined) {
      data.discount =
        updateProductDto.discount === null
          ? null
          : Math.max(0, Math.trunc(Number(updateProductDto.discount) || 0));
    }

    if (updateProductDto.weight !== undefined) {
      if (updateProductDto.weight === null) {
        data.weight = null;
      } else {
        const weight = Number(updateProductDto.weight);
        if (!Number.isFinite(weight) || weight < 0) {
          throw new Error('Peso inválido.');
        }
        data.weight = weight;
      }
    }

    if (updateProductDto.dimensions !== undefined) {
      data.dimensions = updateProductDto.dimensions
        ? (updateProductDto.dimensions as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data,
      include: { category: true },
    });

    return this.formatProduct({
      ...updated,
      imageUrl: updated.images?.[0] ?? null,
    });
  }

  async remove(id: string): Promise<ProductEntity> {
    try {
      const removedProduct = await this.prisma.product.delete({
        where: { id },
      });

      return this.formatProduct({
        ...removedProduct,
        imageUrl: removedProduct.images?.[0] ?? null,
      });
    } catch {
      throw new NotFoundException(`Produto com ID "${id}" não encontrado.`);
    }
  }
}
