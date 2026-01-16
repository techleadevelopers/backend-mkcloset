import { Wishlist as PrismaWishlist, WishlistItem as PrismaWishlistItem, Product as PrismaProduct } from '@prisma/client';

export class WishlistItemEntity implements PrismaWishlistItem {
  id: string;
  wishlistId: string;
  productId: string;
  createdAt: Date;
  updatedAt: Date;
  product: PrismaProduct; // Inclui o produto relacionado
}

export class WishlistEntity implements PrismaWishlist {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  items: WishlistItemEntity[]; // Lista de itens da wishlist
}