// src/cart/entities/cart.entity.ts
import { Cart as PrismaCart, CartItem as PrismaCartItem, Product as PrismaProduct, User as PrismaUser, Prisma } from '@prisma/client';

// Define uma entidade para o item do carrinho com o produto incluído
export class CartItemEntity implements PrismaCartItem {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  size: string | null;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
  
  price: Prisma.Decimal; // CORREÇÃO: Adicionado a propriedade 'price'

  product: PrismaProduct; // Inclui o produto relacionado
}

// Define uma entidade para o carrinho com os itens incluídos
export class CartEntity implements PrismaCart {
  id: string;
  userId: string | null; // ALTERADO: userId agora é opcional
  user?: PrismaUser;    // Adicionado: Se você quiser incluir o objeto User, ele também é opcional agora
  guestId: string | null; // NOVO: Adicionado para corresponder ao schema.prisma
  createdAt: Date;
  updatedAt: Date;
  items: CartItemEntity[]; // Lista de itens do carrinho
  total?: number; // Adicionado dinamicamente pelo serviço
  itemCount?: number; // Adicionado dinamicamente pelo serviço
}
