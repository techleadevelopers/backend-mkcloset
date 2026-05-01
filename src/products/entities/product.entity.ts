import { Prisma, Product as PrismaProduct } from '@prisma/client';

interface ProductDimensions {
  length: number;
  width: number;
  height: number;
}

type ProductRecord = PrismaProduct & { imageUrl?: string | null };

export class ProductEntity
  implements Omit<PrismaProduct, 'price' | 'originalPrice'>
{
  id: string;
  name: string;
  description: string | null;
  price: number;
  originalPrice: number | null;
  imageUrl: string;
  imgBanner: string | null;
  images: string[];
  categoryId: string;
  sizes: string[];
  colors: string[];
  isNew: boolean;
  isFeatured: boolean;
  discount: number | null;
  stock: number;
  weight: number | null;
  dimensions: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(prismaProduct: ProductRecord) {
    Object.assign(this, prismaProduct);
    this.price = prismaProduct.price.toNumber();
    this.originalPrice = prismaProduct.originalPrice
      ? prismaProduct.originalPrice.toNumber()
      : null;
    this.imageUrl = prismaProduct.imageUrl || prismaProduct.images?.[0] || '';
  }

  getTypedDimensions(): ProductDimensions | null {
    if (
      this.dimensions &&
      typeof this.dimensions === 'object' &&
      !Array.isArray(this.dimensions)
    ) {
      const dims = this.dimensions as unknown as ProductDimensions;

      if (
        typeof dims.length === 'number' &&
        typeof dims.width === 'number' &&
        typeof dims.height === 'number'
      ) {
        return dims;
      }
    }

    return null;
  }
}
