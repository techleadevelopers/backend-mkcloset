import { Product as PrismaProduct, Prisma } from '@prisma/client';

// Define uma interface para as dimensões para melhor tipagem do JSON
interface ProductDimensions {
  length: number;
  width: number;
  height: number;
}

export class ProductEntity implements Omit<PrismaProduct, 'price' | 'originalPrice'> {
  id: string;
  name: string;
  description: string | null;
  price: number; // Alterado para number para ser usado no frontend/cálculos
  originalPrice: number | null; // Alterado para number
  imageUrl: string;
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

  // Adicionando um construtor para fazer a conversão de tipos
  constructor(prismaProduct: PrismaProduct) {
    // Atribui todas as propriedades do objeto Prisma
    Object.assign(this, prismaProduct);

    // Converte os campos Decimal para number
    this.price = prismaProduct.price.toNumber();
    this.originalPrice = prismaProduct.originalPrice ? prismaProduct.originalPrice.toNumber() : null;
  }

  // Método para obter dimensões tipadas
  getTypedDimensions(): ProductDimensions | null {
    if (this.dimensions && typeof this.dimensions === 'object' && !Array.isArray(this.dimensions)) {
      // Conversão para 'unknown' primeiro, depois para o tipo desejado.
      // Isso resolve o erro de conversão direta.
      const dims = this.dimensions as unknown as ProductDimensions;
      
      // Validação adicional para garantir que as propriedades são números
      if (typeof dims.length === 'number' && typeof dims.width === 'number' && typeof dims.height === 'number') {
        return dims;
      }
    }
    return null;
  }
}