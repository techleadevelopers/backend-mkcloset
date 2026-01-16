// src/cart/cart.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProductsService } from 'src/products/products.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { Prisma } from '@prisma/client';
// Importa o tipo Decimal diretamente do runtime do Prisma
import { Decimal } from '@prisma/client/runtime/library'; 

// 1. Define um type alias para o tipo de payload do carrinho com os detalhes necessários
type CartWithDetails = Prisma.CartGetPayload<{
  include: {
    items: {
      include: {
        product: {
          select: {
            id: true;
            name: true;
            price: true;
            originalPrice: true;
            images: true;
            stock: true;
            description: true;
            sizes: true;
            colors: true;
            isNew: true;
            isFeatured: true;
            discount: true;
            weight: true;
            dimensions: true;
            createdAt: true;
            updatedAt: true;
            categoryId: true;
          };
        };
      };
    };
  };
}>;

@Injectable()
export class CartService {
  constructor(
    private prisma: PrismaService,
    private productsService: ProductsService,
  ) {}

  private productSelect = {
    id: true,
    name: true,
    price: true,
    originalPrice: true,
    images: true,
    stock: true,
    description: true,
    sizes: true,
    colors: true,
    isNew: true,
    isFeatured: true,
    discount: true,
    weight: true,
    dimensions: true,
    createdAt: true,
    updatedAt: true,
    categoryId: true,
  };

  // Método auxiliar privado para obter ou criar um carrinho (para usuário ou convidado)
  // Retorna Promise<CartWithDetails> para garantir o tipo
  private async _getOrCreateCart(userId?: string, guestId?: string): Promise<CartWithDetails> {
    const commonInclude = {
      items: {
        include: {
          product: {
            select: this.productSelect,
          },
        },
      },
    };

    let cart: CartWithDetails | null = null; // Inicializa como null

    if (userId) {
      cart = await this.prisma.cart.findUnique({
        where: { userId },
        include: commonInclude,
      });
      if (!cart) {
        cart = await this.prisma.cart.create({
          data: { userId },
          include: commonInclude,
        });
      }
    } else if (guestId) {
      cart = await this.prisma.cart.findUnique({
        where: { guestId },
        include: commonInclude,
      });
      if (!cart) {
        cart = await this.prisma.cart.create({
          data: { guestId },
          include: commonInclude,
        });
      }
    } else {
      throw new BadRequestException('Nenhum identificador de usuário ou convidado fornecido.');
    }

    // Como garantimos que 'cart' será preenchido ou criado, não precisamos de 'as' aqui
    return cart; 
  }

  async getCartForUser(userId: string) {
    const cart = await this._getOrCreateCart(userId);
    return this.calculateCartTotals(cart);
  }

  async getCartForGuest(guestId: string) {
    const cart = await this._getOrCreateCart(undefined, guestId);
    return this.calculateCartTotals(cart);
  }

  async addItemToCart(addToCartDto: AddToCartDto, userId?: string, guestId?: string) {
    const { productId, quantity, size, color } = addToCartDto;

    const product = await this.productsService.findOne(productId);
    if (!product) {
      throw new NotFoundException(`Produto com ID "${productId}" não encontrado.`);
    }

    if (product.stock < quantity) {
      throw new BadRequestException(`Estoque insuficiente para o produto "${product.name}". Disponível: ${product.stock}`);
    }

    const cart = await this._getOrCreateCart(userId, guestId);

    const existingCartItem = await this.prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId,
        size: size || null,
        color: color || null,
      },
    });

    let resultCart: CartWithDetails; // Variável para armazenar o carrinho final

    if (existingCartItem) {
      const newQuantity = existingCartItem.quantity + quantity;
      if (product.stock < newQuantity) {
        throw new BadRequestException(`Estoque insuficiente para o produto "${product.name}". Tentando adicionar ${quantity}, mas já tem ${existingCartItem.quantity}. Total: ${newQuantity}, Disponível: ${product.stock}`);
      }
      // Acessa diretamente a propriedade 'cart' do resultado da atualização
      resultCart = (await this.prisma.cartItem.update({
        where: { id: existingCartItem.id },
        data: { quantity: newQuantity },
        include: {
          cart: { // Inclui o carrinho para ter todos os dados necessários
            include: {
              items: {
                include: {
                  product: {
                    select: this.productSelect,
                  },
                },
              },
            },
          },
        },
      })).cart;
    } else {
      // Acessa diretamente a propriedade 'cart' do resultado da criação
      resultCart = (await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId,
          quantity,
          size,
          color,
          price: product.price,
        },
        include: {
          cart: { // Inclui o carrinho para ter todos os dados necessários
            include: {
              items: {
                include: {
                  product: {
                    select: this.productSelect,
                  },
                },
              },
            },
          },
        }
      })).cart;
    }

    return this.calculateCartTotals(resultCart); // Passa o carrinho com o tipo correto
  }

  async updateCartItemQuantity(userId: string | undefined, guestId: string | undefined, itemId: string, quantity: number) {
    if (quantity <= 0) {
      return this.removeCartItem(userId, guestId, itemId);
    }

    const cart = await this._getOrCreateCart(userId, guestId);

    const cartItem = await this.prisma.cartItem.findUnique({
      where: { id: itemId, cartId: cart.id },
      include: {
        product: {
          select: this.productSelect,
        },
      },
    });

    if (!cartItem) {
      throw new NotFoundException(`Item do carrinho com ID "${itemId}" não encontrado no carrinho atual.`);
    }

    if (cartItem.product.stock < quantity) {
      throw new BadRequestException(`Estoque insuficiente para o produto "${cartItem.product.name}". Disponível: ${cartItem.product.stock}`);
    }

    const updatedCartItem = await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
      include: {
        cart: { // Inclui o carrinho para ter todos os dados necessários
          include: {
            items: {
              include: {
                product: {
                  select: this.productSelect,
                },
              },
            },
          },
        },
      },
    });

    return this.calculateCartTotals(updatedCartItem.cart); // Passa o carrinho com o tipo correto
  }

  async removeCartItem(userId: string | undefined, guestId: string | undefined, itemId: string) {
    const cart = await this._getOrCreateCart(userId, guestId);

    const cartItem = await this.prisma.cartItem.findUnique({
      where: { id: itemId, cartId: cart.id },
    });

    if (!cartItem) {
      throw new NotFoundException(`Item do carrinho com ID "${itemId}" não encontrado no carrinho atual.`);
    }

    await this.prisma.cartItem.delete({ where: { id: itemId } });

    const updatedCart = await this.prisma.cart.findUnique({
      where: { id: cart.id },
      include: {
        items: {
          include: {
            product: {
              select: this.productSelect,
            },
          },
        },
      },
    });

    // É importante lidar com o caso de updatedCart ser null, embora improvável após deleteMany
    if (!updatedCart) {
        throw new NotFoundException('Carrinho não encontrado após remoção do item.');
    }

    return this.calculateCartTotals(updatedCart); // Passa o carrinho com o tipo correto
  }

  async clearCart(userId: string | undefined, guestId: string | undefined) {
    const cart = await this._getOrCreateCart(userId, guestId);

    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    const updatedCart = await this.prisma.cart.findUnique({
      where: { id: cart.id },
      include: {
        items: {
          include: {
            product: {
              select: this.productSelect,
            },
          },
        },
      },
    });

    // É importante lidar com o caso de updatedCart ser null
    if (!updatedCart) {
        throw new NotFoundException('Carrinho não encontrado após limpeza.');
    }

    return this.calculateCartTotals(updatedCart); // Passa o carrinho com o tipo correto
  }

  // Usa o type alias CartWithDetails para o parâmetro
  private calculateCartTotals(cart: CartWithDetails) {
    const total = cart.items.reduce((sum, item) => {
      // Usa o tipo Decimal importado para garantir a tipagem correta
      const itemPrice = (item.product.price as Decimal).toNumber(); 
      return sum + itemPrice * item.quantity;
    }, 0);
    const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    return { ...cart, total, itemCount };
  }
}