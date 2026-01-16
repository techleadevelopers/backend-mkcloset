// src/orders/entities/order.entity.ts

import { Order as PrismaOrder, OrderItem as PrismaOrderItem, OrderStatus, Product as PrismaProduct, Prisma } from '@prisma/client';

// Entidade para o item do pedido
export class OrderItemEntity implements PrismaOrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  
  price: Prisma.Decimal;
  
  size: string | null;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
  product?: PrismaProduct; // Opcional, se você for incluir o produto
}

// Entidade para o pedido
export class OrderEntity implements PrismaOrder {
  id: string;
  userId: string | null;
  
  // NOVOS CAMPOS PARA GUEST CHECKOUT
  guestId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  guestCpf: string | null; // ADICIONADO: Propriedade guestCpf

  status: OrderStatus;
  
  totalAmount: Prisma.Decimal;
  shippingPrice: Prisma.Decimal;
  shippingService: string;

  shippingAddressStreet: string;
  shippingAddressNumber: string;
  shippingAddressComplement: string | null;
  shippingAddressNeighborhood: string;
  shippingAddressCity: string;
  shippingAddressState: string;
  shippingAddressZipCode: string;
  paymentMethod: string;
  paymentDetails: Prisma.JsonValue | null;

  couponId: string | null;

  createdAt: Date;
  updatedAt: Date;
  items?: OrderItemEntity[];
  // user?: User; // Opcional, se você for incluir o usuário
  // transaction?: Transaction; // Opcional, se você for incluir a transação
  // coupon?: Coupon; // Opcional, se você for incluir o cupom
}