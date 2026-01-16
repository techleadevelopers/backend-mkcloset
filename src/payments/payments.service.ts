import { Injectable, InternalServerErrorException, BadRequestException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { OrdersService } from 'src/orders/orders.service';
import { OrderStatus, TransactionType, Order, User, Prisma } from '@prisma/client';
import { PagSeguroService } from './providers/pagseguro.service';
import { CreatePixChargeDto, PixChargeResponseDto } from './dto/create-pix-charge.dto';
import { ProcessPaymentDto } from './dto/process-payment.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from 'src/notifications/notifications.service';
import { AntifraudService } from 'src/antifraud/antifraud.service';
import * as crypto from 'crypto';

type OrderWithDetails = Order & {
    user?: User | null;
    items: {
        product: {
            id: string;
            name: string;
            price: Prisma.Decimal;
        };
        quantity: number;
        price: Prisma.Decimal;
    }[];
};

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly ordersService: OrdersService,
        private readonly pagSeguroService: PagSeguroService,
        private readonly configService: ConfigService,
        private readonly notificationsService: NotificationsService,
        private readonly antifraudService: AntifraudService,
    ) {}

    async createPixCharge(orderId: string, userId: string): Promise<PixChargeResponseDto> {
        const order: OrderWithDetails = await this.ordersService.findOneById(orderId);

        if (!order) {
            throw new NotFoundException(`Pedido com ID ${orderId} não encontrado.`);
        }

        if (order.status !== OrderStatus.PENDING) {
            throw new BadRequestException('O pedido já foi pago ou está em outro status.');
        }

        if (order.userId && order.userId !== userId) {
            throw new BadRequestException('Acesso não autorizado a este pedido.');
        }

        const clientEmail: string = order.user?.email ?? order.guestEmail ?? '';
        const clientFullName: string = order.user?.name ?? 'Cliente Convidado';
        const clientPhone: string = order.user?.phone ?? order.guestPhone ?? '';
        const clientCpf: string | undefined = order.user?.cpf ?? (order.guestCpf || undefined);

        const items = order.items.map(item => ({
            name: item.product.name,
            quantity: item.quantity,
            unit_amount: new Decimal(item.price),
        }));

        try {
            const antifraudResult = await this.antifraudService.analyzeTransaction({
                orderId: order.id,
                amount: order.totalAmount.toNumber(),
                customerEmail: clientEmail,
                customerCpf: clientCpf,
                paymentMethod: 'PIX',
                items: order.items.map(item => ({ productId: item.product.id, quantity: item.quantity, price: item.price.toNumber() })),
            });

            if (antifraudResult.status === 'DENIED') {
                throw new BadRequestException('Transação negada pela análise antifraude.');
            }
            
            const backendUrl = this.configService.get<string>('BACKEND_URL');
            if (!backendUrl) {
                throw new InternalServerErrorException('A variável de ambiente BACKEND_URL não está definida.');
            }

            const pagSeguroResponse = await this.pagSeguroService.createPagSeguroPixCharge(
                {
                    orderId: order.id,
                    amount: order.totalAmount,
                    description: `Pagamento do Pedido #${order.id} na MKCloset`,
                    customer: {
                        email: clientEmail,
                        fullName: clientFullName,
                        phone: clientPhone,
                        cpf: clientCpf,
                    },
                    shippingAddress: {
                        cep: order.shippingAddressZipCode,
                        street: order.shippingAddressStreet,
                        number: order.shippingAddressNumber,
                        complement: order.shippingAddressComplement ?? undefined,
                        neighborhood: order.shippingAddressNeighborhood,
                        city: order.shippingAddressCity,
                        state: order.shippingAddressState,
                    },
                    shippingService: order.shippingService,
                    shippingPrice: order.shippingPrice,
                    items: items,
                },
                backendUrl
            );

            await this.prisma.transaction.create({
                data: {
                    userId: order.userId || null,
                    orderId: order.id,
                    amount: order.totalAmount,
                    type: TransactionType.PAYMENT,
                    status: 'PENDING',
                    description: `Cobrança PIX para Pedido #${order.id}`,
                    gatewayTransactionId: pagSeguroResponse.transactionId,
                    transactionRef: pagSeguroResponse.brCode,
                    antifraudStatus: antifraudResult.status,
                },
            });

            return pagSeguroResponse;

        } catch (error) {
            this.logger.error(`Erro ao criar cobrança PIX para o pedido ${orderId}: ${error.message}`, error.stack);
            if (error instanceof InternalServerErrorException && error.message.startsWith('Falha no PagSeguro:')) {
                throw error;
            }
            throw new InternalServerErrorException('Falha ao iniciar o processo de pagamento PIX com PagSeguro.');
        }
    }

    async processCreditCardPayment(orderId: string, userId: string | undefined, processPaymentDto: ProcessPaymentDto): Promise<any> {
        const { cardToken, cardHolderName, cardCpf, cardInstallments, cardBrand } = processPaymentDto;

        if (!cardToken || !cardHolderName || !cardCpf) {
            throw new BadRequestException('Dados do cartão incompletos para processamento direto.');
        }

        const order: OrderWithDetails = await this.ordersService.findOneById(orderId);

        if (!order) {
            throw new NotFoundException(`Pedido com ID ${orderId} não encontrado.`);
        }

        if (order.status !== OrderStatus.PENDING) {
            throw new BadRequestException('O pedido já foi pago ou está em outro status.');
        }

        if (order.userId && userId && order.userId !== userId) {
            throw new BadRequestException('Acesso não autorizado a este pedido.');
        }

        const clientEmail: string = order.user?.email ?? order.guestEmail ?? '';
        const clientFullName: string = order.user?.name ?? 'Cliente Convidado';
        const clientPhone: string = order.user?.phone ?? order.guestPhone ?? '';
        const clientCpf: string | undefined = order.user?.cpf ?? (order.guestCpf || undefined);

        const items = order.items.map(item => ({
            name: item.product.name,
            quantity: item.quantity,
            unit_amount: new Decimal(item.price),
        }));

        try {
            const antifraudResult = await this.antifraudService.analyzeTransaction({
                orderId: order.id,
                amount: order.totalAmount.toNumber(),
                customerEmail: clientEmail,
                customerCpf: clientCpf,
                paymentMethod: 'CREDIT_CARD',
                items: order.items.map(item => ({ productId: item.product.id, quantity: item.quantity, price: item.price.toNumber() })),
                cardDetails: { brand: cardBrand, installments: cardInstallments },
            });

            if (antifraudResult.status === 'DENIED') {
                throw new BadRequestException('Transação negada pela análise antifraude.');
            }
            
            const backendUrl = this.configService.get<string>('BACKEND_URL');
            if (!backendUrl) {
                throw new InternalServerErrorException('A variável de ambiente BACKEND_URL não está definida.');
            }

            const pagSeguroResponse = await this.pagSeguroService.processDirectCreditCardPayment(
                {
                    orderId: order.id,
                    amount: order.totalAmount,
                    description: `Pagamento do Pedido #${order.id} na MKCloset`,
                    customer: {
                        email: clientEmail,
                        fullName: clientFullName,
                        phone: clientPhone,
                        cpf: clientCpf,
                    },
                    shippingAddress: {
                        cep: order.shippingAddressZipCode,
                        street: order.shippingAddressStreet,
                        number: order.shippingAddressNumber,
                        complement: order.shippingAddressComplement ?? undefined,
                        neighborhood: order.shippingAddressNeighborhood,
                        city: order.shippingAddressCity,
                        state: order.shippingAddressState,
                    },
                    shippingService: order.shippingService,
                    shippingPrice: order.shippingPrice,
                    items: items,
                    cardDetails: {
                        token: cardToken,
                        holderName: cardHolderName,
                        cpf: cardCpf,
                        installments: cardInstallments,
                    }
                },
                backendUrl
            );

            await this.prisma.transaction.create({
                data: {
                    userId: order.userId || null,
                    orderId: order.id,
                    amount: order.totalAmount,
                    type: TransactionType.PAYMENT,
                    status: pagSeguroResponse.status,
                    description: `Pagamento com Cartão de Crédito para Pedido #${order.id}`,
                    gatewayTransactionId: pagSeguroResponse.transactionId,
                    transactionRef: pagSeguroResponse.transactionRef,
                    antifraudStatus: antifraudResult.status,
                },
            });

            if (pagSeguroResponse.status === OrderStatus.PAID) {
                await this.prisma.order.update({
                    where: { id: order.id },
                    data: { status: OrderStatus.PAID },
                });
                try {
                    const recipientEmail = order.user?.email ?? order.guestEmail;
                    if (recipientEmail) {
                        await this.notificationsService.sendPaymentConfirmationEmail(recipientEmail, order.id, order.totalAmount.toNumber());
                    }
                } catch (emailError) {
                    this.logger.error(`Falha ao enviar e-mail de confirmação de pagamento para o pedido ${order.id}: ${emailError.message}`);
                }
            }

            return pagSeguroResponse;

        } catch (error) {
            this.logger.error(`Erro ao processar pagamento com cartão para o pedido ${orderId}: ${error.message}`, error.stack);
            if (error instanceof InternalServerErrorException && error.message.startsWith('Falha no PagSeguro:')) {
                throw error;
            }
            throw new InternalServerErrorException('Falha ao processar pagamento com cartão de crédito.');
        }
    }


    async initiatePagSeguroRedirectCheckout(userId: string | undefined, orderId: string): Promise<{ redirectUrl: string }> {
        const order: OrderWithDetails = await this.ordersService.findOneById(orderId);

        if (!order) {
            throw new NotFoundException(`Pedido com ID ${orderId} não encontrado.`);
        }

        if (order.userId && userId && order.userId !== userId) {
            throw new BadRequestException('Acesso não autorizado a este pedido.');
        }

        if (order.status !== OrderStatus.PENDING) {
            throw new BadRequestException('O pedido já foi pago ou está em outro status.');
        }

        let clientEmail: string = order.user?.email ?? order.guestEmail ?? '';
        let clientFullName: string = order.user?.name ?? 'Cliente Convidado';
        let clientPhone: string = order.user?.phone ?? order.guestPhone ?? '';
        let clientCpf: string | undefined = order.user?.cpf ?? (order.guestCpf || undefined);

        const pagSeguroItems = order.items.map(item => ({
            name: item.product.name,
            quantity: item.quantity,
            unit_amount: item.price,
        }));

        try {
            const antifraudResult = await this.antifraudService.analyzeTransaction({
                orderId: order.id,
                amount: order.totalAmount.toNumber(),
                customerEmail: clientEmail,
                customerCpf: clientCpf,
                paymentMethod: 'REDIRECT_CHECKOUT',
                items: order.items.map(item => ({ productId: item.product.id, quantity: item.quantity, price: item.price.toNumber() })),
            });

            if (antifraudResult.status === 'DENIED') {
                throw new BadRequestException('Transação negada pela análise antifraude.');
            }

            const backendUrl = this.configService.get<string>('BACKEND_URL');
            if (!backendUrl) {
                throw new InternalServerErrorException('A variável de ambiente BACKEND_URL não está definida.');
            }

            const pagSeguroResponse = await this.pagSeguroService.createPagSeguroCheckoutRedirect(
                {
                    orderId: order.id,
                    amount: order.totalAmount,
                    description: `Pagamento do Pedido #${order.id} na MKCloset`,
                    customer: {
                        email: clientEmail,
                        fullName: clientFullName,
                        phone: clientPhone,
                        cpf: clientCpf,
                    },
                    shippingAddress: {
                        cep: order.shippingAddressZipCode,
                        street: order.shippingAddressStreet,
                        number: order.shippingAddressNumber,
                        complement: order.shippingAddressComplement ?? undefined,
                        neighborhood: order.shippingAddressNeighborhood,
                        city: order.shippingAddressCity,
                        state: order.shippingAddressState,
                    },
                    shippingService: order.shippingService,
                    shippingPrice: order.shippingPrice,
                    items: pagSeguroItems,
                },
                backendUrl
            );

            await this.prisma.transaction.create({
                data: {
                    userId: order.userId || null,
                    orderId: order.id,
                    amount: order.totalAmount,
                    type: TransactionType.PAYMENT,
                    status: 'PENDING_REDIRECT',
                    description: `Iniciação de pagamento via PagSeguro Checkout para Pedido #${order.id}`,
                    gatewayTransactionId: pagSeguroResponse.pagSeguroCheckoutId,
                    transactionRef: pagSeguroResponse.redirectUrl,
                    antifraudStatus: antifraudResult.status,
                },
            });

            return { redirectUrl: pagSeguroResponse.redirectUrl };

        } catch (error) {
            this.logger.error(`Erro ao iniciar checkout de redirecionamento para o pedido ${orderId}: ${error.message}`, error.stack);
            if (error instanceof InternalServerErrorException && error.message.startsWith('Falha no PagSeguro:')) {
                throw error;
            }
            throw new InternalServerErrorException('Falha ao iniciar o processo de pagamento com PagSeguro.');
        }
    }

    async handlePagSeguroNotification(pagSeguroCheckoutId: string, signature: string, rawBody: string) {
        this.logger.log(`[PaymentsService] Webhook do PagSeguro recebido para checkout ID: ${pagSeguroCheckoutId}`);

        const webhookSecret = this.configService.get<string>('PAGSEGURO_WEBHOOK_SECRET');
        if (!webhookSecret) {
            throw new InternalServerErrorException('A variável de ambiente PAGSEGURO_WEBHOOK_SECRET não está definida.');
        }

        const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

        if (signature !== expectedSignature) {
            this.logger.error(`[PaymentsService] Assinatura do webhook inválida para checkout ID: ${pagSeguroCheckoutId}.`);
            throw new UnauthorizedException('Assinatura do webhook inválida.');
        }
        this.logger.log(`[PaymentsService] Assinatura do webhook verificada com sucesso para checkout ID: ${pagSeguroCheckoutId}.`);

        const checkoutDetails = await this.pagSeguroService.getCheckoutDetails(pagSeguroCheckoutId);
        const pagSeguroTransactionStatus = checkoutDetails.status || checkoutDetails.charges?.[0]?.status || 'PENDING';
        const newOrderStatus = this.mapPagSeguroStatusToOrderStatus(pagSeguroTransactionStatus);

        const transaction = await this.prisma.transaction.findFirst({
            where: { gatewayTransactionId: pagSeguroCheckoutId },
            include: { order: true },
        });

        if (!transaction || !transaction.order) {
            this.logger.warn(`Notificação do PagSeguro recebida para o checkout '${pagSeguroCheckoutId}', mas nenhuma transação correspondente foi encontrada.`);
            throw new NotFoundException('Transação não encontrada para o checkout ID fornecido.');
        }

        if (transaction.status === newOrderStatus && transaction.order.status === newOrderStatus) {
            this.logger.log(`Status do pedido ${transaction.order.id} já está atualizado para ${newOrderStatus}.`);
            return { message: 'Status já atualizado' };
        }

        await this.prisma.$transaction([
            this.prisma.transaction.update({
                where: { id: transaction.id },
                data: { status: newOrderStatus },
            }),
            this.prisma.order.update({
                where: { id: transaction.order.id },
                data: { status: newOrderStatus },
            }),
        ]);

        this.logger.log(`Status do pedido ${transaction.order.id} atualizado para ${newOrderStatus} via webhook do PagSeguro.`);
        
        try {
            const recipientEmail = transaction.order.userId 
                ? (await this.ordersService.findOneById(transaction.order.id)).user?.email 
                : transaction.order.guestEmail;
            
            if (recipientEmail) {
                if (newOrderStatus === OrderStatus.PAID) {
                    await this.notificationsService.sendPaymentConfirmationEmail(recipientEmail, transaction.order.id, transaction.order.totalAmount.toNumber());
                } else if (newOrderStatus === OrderStatus.CANCELLED) {
                    await this.notificationsService.sendPaymentCancellationEmail(recipientEmail, transaction.order.id);
                }
            }
        } catch (emailError) {
            this.logger.error(`Falha ao enviar e-mail de status de pagamento para o pedido ${transaction.order.id}: ${emailError.message}`);
        }

        return { message: 'Status do pedido atualizado com sucesso' };
    }

    private mapPagSeguroStatusToOrderStatus(pagSeguroStatus: string): OrderStatus {
        switch (pagSeguroStatus) {
            case 'PAID':
            case 'APPROVED':
                return OrderStatus.PAID;
            case 'IN_ANALYSIS':
            case 'PENDING':
                return OrderStatus.PENDING;
            case 'CANCELED':
            case 'ABORTED':
                return OrderStatus.CANCELLED;
            case 'REFUNDED':
            case 'SHIPPED':
                return OrderStatus.SHIPPED;
            case 'DELIVERED':
                return OrderStatus.DELIVERED;
            default:
                return OrderStatus.PENDING;
        }
    }
}
