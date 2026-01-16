// src/orders/orders.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CartService } from 'src/cart/cart.service';
import { UsersService } from 'src/users/users.service';
import { ProductsService } from 'src/products/products.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus, Prisma, Order, User } from '@prisma/client';
import { ProductEntity } from 'src/products/entities/product.entity';
import { NotificationsService } from 'src/notifications/notifications.service'; // NOVO: Importe o serviço de notificações

// Opcional: Tipo para o pedido com as relações que esperamos carregar
// Isso ajuda o TypeScript a entender a estrutura do objeto 'order'
type OrderWithRelations = Order & {
  user?: User | null; // Inclui o usuário se o pedido for de um usuário logado
  items: { 
    product: {
      id: string; // Adicionado ID do produto
      name: string;
      price: Prisma.Decimal;
      // Adicione outros campos do produto que você precise aqui
    };
    quantity: number;
    price: Prisma.Decimal; // Preço do item no momento da compra
  }[];
};

interface OrderItemData {
  productId: string;
  quantity: number;
  price: Prisma.Decimal;
  size: string | null;
  color: string | null;
}

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private cartService: CartService,
    private usersService: UsersService,
    private productsService: ProductsService,
    private notificationsService: NotificationsService, // NOVO: Injete o serviço de notificações
  ) {}

  /**
   * Busca um pedido pelo seu ID único.
   * Este método é crucial para o PaymentsService, pois ele precisa dos dados do cliente (logado ou convidado).
   * Ele inclui a relação 'user' para que o PaymentsService possa acessar os dados do usuário, se aplicável.
   * @param orderId O ID único do pedido.
   * @returns O objeto Order com as relações de usuário, ou lança NotFoundException se não encontrado.
   */
  async findOneById(orderId: string): Promise<OrderWithRelations> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true, // Inclui os dados do usuário se userId estiver preenchido
        items: { // Inclui os itens do pedido
          include: {
            product: { // Inclui os detalhes do produto para cada item
              select: {
                id: true, // Inclua o ID do produto se precisar
                name: true,
                price: true,
                // Adicione outros campos do produto que você precise aqui
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Pedido com ID "${orderId}" não encontrado.`);
    }

    return order as OrderWithRelations; // Garante o tipo de retorno
  }

  async create(createOrderDto: CreateOrderDto, userId?: string) {
    const { 
      paymentMethod, 
      shippingAddressId, 
      guestId, 
      guestContactInfo, 
      guestShippingAddress, 
      shippingService, 
      shippingPrice, 
      shouldCreateAccount, 
      guestPassword 
    } = createOrderDto;

    let cart;
    let cartIdToClear: string;
    let finalUserId = userId;
    
    // 1. Obter o carrinho (do usuário logado ou do convidado)
    if (userId) {
      cart = await this.cartService.getCartForUser(userId);
      cartIdToClear = cart.id;
    } else if (guestId) {
      cart = await this.cartService.getCartForGuest(guestId);
      cartIdToClear = cart.id;
    } else {
      throw new BadRequestException('Identificador de usuário ou convidado ausente.');
    }

    if (!cart.items || cart.items.length === 0) {
      throw new BadRequestException('O carrinho está vazio.');
    }

    // 2. Verificar estoque e preço atualizado dos produtos
    let totalAmount = new Prisma.Decimal(0);
    const orderItemsData: OrderItemData[] = [];
    for (const cartItem of cart.items) {
      const product: ProductEntity = await this.productsService.findOne(cartItem.productId);
      
      if (!product) {
        throw new NotFoundException(`Produto "${cartItem.product.name}" não encontrado.`);
      }
      if (product.stock < cartItem.quantity) {
        throw new BadRequestException(`Estoque insuficiente para o produto "${product.name}". Disponível: ${product.stock}, solicitado: ${cartItem.quantity}.`);
      }

      const productPriceDecimal = new Prisma.Decimal(product.price);

      orderItemsData.push({
        productId: product.id,
        quantity: cartItem.quantity,
        price: productPriceDecimal, // Use o preço do produto no momento da compra
        size: cartItem.size,
        color: cartItem.color,
      });
      
      totalAmount = totalAmount.plus(productPriceDecimal.times(cartItem.quantity));
    }

    // 3. Obter/Definir endereço de entrega
    let finalShippingAddressData: {
      street: string;
      number: string;
      complement?: string; // string | undefined
      neighborhood: string;
      city: string;
      state: string;
      zipCode: string;
    };

    if (userId) {
      // Para usuário logado, buscar endereço salvo
      if (!shippingAddressId) {
        throw new BadRequestException('ID do endereço de entrega é obrigatório para usuários logados.');
      }
      const userAddresses = await this.usersService.findAddressesByUserId(userId);
      const shippingAddress = userAddresses.find(addr => addr.id === shippingAddressId);

      if (!shippingAddress) {
        throw new NotFoundException('Endereço de entrega não encontrado ou não pertence ao usuário.');
      }
      // Mapeamento explícito para lidar com `null` vs `undefined` para `complement`
      finalShippingAddressData = {
        street: shippingAddress.street,
        number: shippingAddress.number,
        complement: shippingAddress.complement ?? undefined,
        neighborhood: shippingAddress.neighborhood,
        city: shippingAddress.city,
        state: shippingAddress.state,
        zipCode: shippingAddress.zipCode,
      };
    } else {
      // Para convidado, usar o endereço fornecido no DTO
      if (!guestShippingAddress || !guestContactInfo) {
        throw new BadRequestException('Dados de contato e endereço do convidado são obrigatórios.');
      }
      finalShippingAddressData = guestShippingAddress;

      // NOVO: Criar a conta do usuário se a opção estiver marcada
      if (shouldCreateAccount && guestContactInfo && guestContactInfo.email && guestPassword) {
        const newUser = await this.usersService.create({
          email: guestContactInfo.email,
          password: guestPassword,
          name: guestContactInfo.name,
          phone: guestContactInfo.phone,
        });
        finalUserId = newUser.id; // Atualiza o userId para o novo usuário
      }
    }

    // 4. Calcular frete (usando o valor já fornecido pelo frontend)
    const parsedShippingPrice = new Prisma.Decimal(shippingPrice);

    // 5. Criar o pedido na transação
    const order = await this.prisma.$transaction(async (prisma) => {
      // Criar o pedido
      const newOrder = await prisma.order.create({
        data: {
          // Usar `?? undefined` para campos opcionais do Prisma onde `null` não é desejado
          userId: finalUserId ?? undefined, 
          guestId: finalUserId ? undefined : guestId,
          guestName: finalUserId ? undefined : guestContactInfo?.name,
          guestEmail: finalUserId ? undefined : guestContactInfo?.email,
          guestPhone: finalUserId ? undefined : guestContactInfo?.phone,
          guestCpf: finalUserId ? undefined : guestContactInfo?.cpf, // Adicionado guestCpf

          status: OrderStatus.PENDING,
          totalAmount: totalAmount.plus(parsedShippingPrice),
          shippingPrice: parsedShippingPrice,
          paymentMethod, // O paymentMethod do CreateOrderDto será salvo aqui
          paymentDetails: createOrderDto.paymentDetails || {},
          shippingService: shippingService,
          
          // Dados do endereço de entrega final
          shippingAddressStreet: finalShippingAddressData.street,
          shippingAddressNumber: finalShippingAddressData.number,
          // Certifique-se de que finalShippingAddressData.complement é string | undefined
          shippingAddressComplement: finalShippingAddressData.complement, 
          shippingAddressNeighborhood: finalShippingAddressData.neighborhood,
          shippingAddressCity: finalShippingAddressData.city,
          shippingAddressState: finalShippingAddressData.state,
          shippingAddressZipCode: finalShippingAddressData.zipCode,
        },
      });

      // Adicionar itens ao pedido e atualizar estoque
      for (const itemData of orderItemsData) {
        await prisma.orderItem.create({
          data: {
            orderId: newOrder.id,
            productId: itemData.productId,
            quantity: itemData.quantity,
            price: itemData.price,
            size: itemData.size,
            color: itemData.color,
          },
        });

        // Decrementar estoque
        await prisma.product.update({
          where: { id: itemData.productId },
          data: { stock: { decrement: itemData.quantity } },
        });
      }

      // Limpar o carrinho (do usuário ou do convidado)
      await prisma.cartItem.deleteMany({ where: { cartId: cartIdToClear } });

      return newOrder;
    });

    // NOVO: Enviar e-mail de confirmação de pedido
    try {
        const recipientEmail = finalUserId ? (await this.usersService.findOne(finalUserId)).email : guestContactInfo?.email;
        if (recipientEmail) {
            await this.notificationsService.sendOrderConfirmationEmail(recipientEmail, order.id, order.totalAmount.toNumber());
        }
    } catch (emailError) {
        this.notificationsService.logger.error(`Falha ao enviar e-mail de confirmação para o pedido ${order.id}: ${emailError.message}`);
        // Não relança o erro para não impedir a criação do pedido
    }

    return order;
  }

  async findAllByUserId(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneByUserId(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, userId },
      include: {
        items: { include: { product: true } },
        user: true,
      },
    });
    if (!order) {
      throw new NotFoundException(`Pedido com ID "${orderId}" não encontrado ou não pertence ao usuário.`);
    }
    return order;
  }

  async findOneByGuestId(guestId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, guestId },
      include: {
        items: { include: { product: true } },
      },
    });
    if (!order) {
      throw new NotFoundException(`Pedido com ID "${orderId}" não encontrado ou não pertence ao convidado.`);
    }
    return order;
  }
}