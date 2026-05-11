// src/payments/providers/pagseguro.service.ts
import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

type PixGatewayResponse = {
  transactionId: string;
  chargeId?: string;
  status: string;
  brCode: string;
  qrCodeImage: string;
  expiresAt: string;
  amount: number;
  description: string;
  orderId: string;
};

type CardGatewayResponse = {
  transactionId: string;
  status: string;
  transactionRef: string;
  amount: number;
  description: string;
  orderId: string;
};

// Interface para os detalhes de um item no checkout do PagSeguro
interface PagSeguroCheckoutItem {
  reference_id?: string; // ID de referência do item (opcional)
  name: string;
  quantity: number;
  unit_amount: number; // Valor em centavos
}

// Interface para os detalhes do cliente no checkout do PagSeguro
interface PagSeguroCheckoutCustomer {
  name: string;
  email: string;
  tax_id: string; // CPF
  phones: Array<{
    country: string;
    area: string;
    number: string;
    type: 'MOBILE' | 'HOME' | 'BUSINESS';
  }>;
}

// Interface para o endereço no checkout do PagSeguro
interface PagSeguroCheckoutAddress {
  country: string;
  region_code: string; // Estado (ex: SP)
  city: string;
  postal_code: string; // CEP
  street: string;
  number: string;
  locality: string; // Bairro
  complement?: string | null;
}

// Interface para os detalhes de envio no checkout do PagSeguro
interface PagSeguroCheckoutShipping {
  address: PagSeguroCheckoutAddress;
  type: 'FIXED' | 'FREE' | 'WEIGHT'; // Tipo de frete
  service_type: string; // Serviço de frete (ex: SEDEX, PAC)
  amount: number; // Custo do frete em centavos
  estimated_delivery_time_in_days?: number;
  address_modifiable?: boolean; // Se o cliente pode modificar o endereço na página do PagSeguro
}

// Interface para os detalhes necessários para criar um checkout de redirecionamento
interface CreatePagSeguroCheckoutRedirectDetails {
  orderId: string; // Seu ID de pedido interno, usado como reference_id
  amount: Prisma.Decimal; // Valor total do pedido, incluindo frete
  description: string;
  customer: {
    email: string;
    fullName: string;
    phone?: string | null;
    cpf?: string | null;
  };
  shippingAddress: {
    cep: string;
    street: string;
    number: string;
    complement?: string | null;
    neighborhood: string;
    city: string;
    state: string;
  };
  shippingService: string;
  shippingPrice: Prisma.Decimal;
  items: Array<{
    name: string;
    quantity: number;
    unit_amount: Prisma.Decimal; // Preço unitário do item
  }>;
  checkoutOptions?: {
    paymentMethods?: Array<'CREDIT_CARD' | 'DEBIT_CARD' | 'PIX' | 'BOLETO'>;
    softDescriptor?: string;
    returnUrl?: string;
    redirectUrl?: string;
    activateIfInactive?: boolean;
  };
}

// Interface para os detalhes necessários para criar uma cobrança PIX
interface CreatePagSeguroPixChargeDetails {
  orderId: string;
  amount: Prisma.Decimal;
  description: string;
  customer: {
    email: string;
    fullName: string;
    phone?: string | null;
    cpf?: string | null;
  };
  shippingAddress: {
    cep: string;
    street: string;
    number: string;
    complement?: string | null;
    neighborhood: string;
    city: string;
    state: string;
  };
  shippingService: string;
  shippingPrice: Prisma.Decimal;
  items: Array<{
    name: string;
    quantity: number;
    unit_amount: Prisma.Decimal;
  }>;
}

// NOVO: Interface para os detalhes necessários para processar pagamento direto com cartão
interface CreatePagSeguroCreditCardChargeDetails {
  orderId: string;
  amount: Prisma.Decimal;
  description: string;
  customer: {
    email: string;
    fullName: string;
    phone?: string | null;
    cpf?: string | null;
  };
  shippingAddress: {
    cep: string;
    street: string;
    number: string;
    complement?: string | null;
    neighborhood: string;
    city: string;
    state: string;
  };
  shippingService: string;
  shippingPrice: Prisma.Decimal;
  items: Array<{
    name: string;
    quantity: number;
    unit_amount: Prisma.Decimal;
  }>;
  cardDetails: {
    token: string; // Token gerado no frontend
    holderName: string;
    cpf: string;
    installments?: number;
  };
}

@Injectable()
export class PagSeguroService {
  private readonly logger = new Logger(PagSeguroService.name);
  private pagSeguroBaseApiUrl: string; // URL base da API (sem /checkouts)
  private pagSeguroToken: string;
  private pagSeguroEmail: string; // Email da conta PagSeguro, se necessário para alguma API
  private redirectBaseUrl: string; // URL base do frontend (ngrok)
  private readonly isSandbox: boolean;

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private extractCheckoutPayLink(payload: any): string | null {
    const payLink = payload?.links?.find((link: any) => link.rel === 'PAY');
    return payLink?.href || null;
  }

  private resolveCustomerPhone(
    rawPhone: string | null | undefined,
    context: string,
    sandboxMode: 'mobile' | 'home' = 'mobile',
  ): { area: string; number: string; type: 'MOBILE' | 'HOME' | 'BUSINESS' } {
    const cleanedPhone = rawPhone ? rawPhone.replace(/\D/g, '') : '';
    let normalizedPhone = cleanedPhone;

    while (normalizedPhone.length > 11 && normalizedPhone.startsWith('55')) {
      normalizedPhone = normalizedPhone.substring(2);
    }

    if (normalizedPhone.length > 11) {
      normalizedPhone = normalizedPhone.slice(-11);
    }

    if (normalizedPhone.length === 10 || normalizedPhone.length === 11) {
      const area = normalizedPhone.substring(0, 2);
      const number = normalizedPhone.substring(2);

      if (number.length < 8 || number.length > 9) {
        throw new BadRequestException(
          `Telefone do cliente invalido para ${context}.`,
        );
      }

      this.logger.log(
        `[PagSeguroService] Telefone normalizado para ${context}: raw="${rawPhone ?? ''}" cleaned="${cleanedPhone}" normalized="${normalizedPhone}" area="${area}" number="${number}"`,
      );
      return {
        area,
        number,
        type: number.length === 9 ? 'MOBILE' : 'HOME',
      };
    }

    if (this.isSandbox) {
      return sandboxMode === 'home'
        ? { area: '11', number: '30335000', type: 'HOME' }
        : { area: '11', number: '999999999', type: 'MOBILE' };
    }

    throw new BadRequestException(
      `Telefone do cliente invalido para ${context}.`,
    );
  }

  private resolveCustomerTaxId(
    rawCpf: string | null | undefined,
    context: string,
  ): string {
    const normalizedCpf = (rawCpf || '').replace(/\D/g, '');
    if (normalizedCpf.length === 11) {
      return normalizedCpf;
    }

    if (this.isSandbox) {
      return '30061150827';
    }

    throw new BadRequestException(`CPF do cliente invalido para ${context}.`);
  }

  private logGatewayPayload(endpoint: string, payload: unknown) {
    if (this.isSandbox) {
      this.logger.debug(
        `[PagSeguroService] Payload sandbox ${endpoint}: ${JSON.stringify(payload)}`,
      );
    }
  }

  private logGatewayResponse(endpoint: string, payload: unknown) {
    if (this.isSandbox) {
      this.logger.debug(
        `[PagSeguroService] Response sandbox ${endpoint}: ${JSON.stringify(payload)}`,
      );
    }
  }

  constructor(private configService: ConfigService) {
    // Carrega a URL base da API do PagSeguro (ex: https://sandbox.api.pagseguro.com)
    this.pagSeguroBaseApiUrl =
      this.configService.get<string>('PAGSEGURO_API_URL') ||
      'https://sandbox.api.pagseguro.com';
    this.pagSeguroToken = this.configService.get<string>(
      'PAGSEGURO_API_TOKEN',
    )!;
    this.pagSeguroEmail = this.configService.get<string>('PAGSEGURO_EMAIL')!; // Pode ser necessário para APIs mais antigas ou especÃ­ficas

    // Carrega as URLs do ngrok do .env
    this.redirectBaseUrl = this.configService.get<string>('FRONTEND_URL')!; // Usando FRONTEND_URL
    this.isSandbox = this.pagSeguroBaseApiUrl.includes('sandbox');
    // REMOVIDO: this.notificationBaseUrl = this.configService.get<string>('BACKEND_URL')!;

    // Validação de configuração
    if (!this.pagSeguroToken || !this.redirectBaseUrl) {
      this.logger.error(
        'Credenciais e/ou URLs do PagSeguro não configuradas corretamente. Verifique PAGSEGURO_API_TOKEN, FRONTEND_URL no seu .env.',
      );
      throw new InternalServerErrorException(
        'Credenciais e/ou URLs do PagSeguro não configuradas.',
      );
    }
  }

  async createSession() {
    const sessionUrl = `https://ws.sandbox.pagseguro.uol.com.br/v2/sessions?email=${this.pagSeguroEmail}&token=${this.pagSeguroToken}`;

    try {
      const response = await axios.post(sessionUrl);
      this.logger.log(
        `[PagSeguroService] Sessão PagSeguro criada: ${JSON.stringify(response.data)}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error('Erro ao criar sessão no PagSeguro:', this.getErrorMessage(error));
      if (axios.isAxiosError(error) && error.response) {
        this.logger.error(
          `[PagSeguroService] Dados do erro da API PagSeguro (sessão): ${JSON.stringify(error.response.data)}`,
        );
      }
      throw new InternalServerErrorException(
        'Falha ao criar sessão no PagSeguro.',
      );
    }
  }

  async getPublicKey(): Promise<string> {
    const url = `${this.pagSeguroBaseApiUrl}/public-keys`;

    try {
      const response = await axios.post(
        url,
        { type: 'card' },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.pagSeguroToken}`,
            'x-api-version': '4.0',
          },
        },
      );

      const publicKey =
        response.data?.public_key ??
        response.data?.publicKey ??
        response.data?.data?.public_key ??
        response.data?.data?.publicKey ??
        response.data?.public_keys?.[0]?.public_key ??
        response.data?.publicKeys?.[0]?.publicKey ??
        '';
      if (!publicKey) {
        throw new InternalServerErrorException(
          'Resposta invÃƒÂ¡lida do PagSeguro: public key ausente.',
        );
      }

      return publicKey;
    } catch (error) {
      this.logger.error(
        `[PagSeguroService] Erro ao gerar public key do PagSeguro: ${this.getErrorMessage(error)}`,
      );
      if (axios.isAxiosError(error) && error.response) {
        this.logger.error(
          `[PagSeguroService] Dados do erro da API PagSeguro (public key): ${JSON.stringify(error.response.data)}`,
        );
      }
      throw new InternalServerErrorException(
        'Falha ao obter public key do PagSeguro.',
      );
    }
  }

  // MODIFICADO: Agora recebe o 'notificationBaseUrl' como parametro
  async createPagSeguroPixCharge(
    details: CreatePagSeguroPixChargeDetails,
    notificationBaseUrl: string,
  ): Promise<PixGatewayResponse> {
    this.logger.log(
      `[PagSeguroService] Criando cobranca PIX para o pedido ${details.orderId}`,
    );

    const customerPhone = this.resolveCustomerPhone(
      details.customer.phone,
      `cobranca PIX do pedido ${details.orderId}`,
    );
    const finalCustomerTaxId = this.resolveCustomerTaxId(
      details.customer.cpf,
      `cobranca PIX do pedido ${details.orderId}`,
    );

    const itemsPayload: PagSeguroCheckoutItem[] = details.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit_amount: Math.round(item.unit_amount.toNumber() * 100),
    }));

    const payload = {
      reference_id: details.orderId,
      customer: {
        name: details.customer.fullName,
        email: details.customer.email,
        tax_id: finalCustomerTaxId,
        phones: [
          {
            country: '55',
            area: customerPhone.area,
            number: customerPhone.number,
            type: customerPhone.type,
          },
        ],
      },
      items: itemsPayload,
      qr_codes: [
        {
          amount: {
            value: Math.round(details.amount.toNumber() * 100),
          },
          expiration_date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      ],
      notification_urls: [`${notificationBaseUrl}/payments/webhook/pagseguro`],
    };

    this.logger.log(
      `[PagSeguroService] Payload PIX phone para ${details.orderId}: ${JSON.stringify(payload.customer.phones?.[0])}`,
    );

    this.logGatewayPayload('POST /orders', payload);

    try {
      const response = await axios.post(
        `${this.pagSeguroBaseApiUrl}/orders`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.pagSeguroToken}`,
            'x-api-version': '4.0',
          },
        },
      );

      this.logger.log(
        `[PagSeguroService] Cobranca PIX criada com sucesso para o pedido ${details.orderId}.`,
      );
      this.logGatewayResponse('POST /orders', response.data);

      const qrCode = response.data.qr_codes?.[0];
      const qrCodeImage =
        qrCode?.links?.find(
          (link: any) => link.rel === 'QR_CODE_IMAGE' || link.rel === 'QRCODE.PNG',
        )?.href ?? '';

      return {
        transactionId: response.data.id,
        chargeId: qrCode?.id,
        status: response.data?.charges?.[0]?.status ?? response.data?.status ?? 'PENDING',
        brCode: qrCode?.text ?? '',
        qrCodeImage,
        expiresAt: qrCode?.expiration_date ?? '',
        amount: details.amount.toNumber(),
        description: details.description,
        orderId: details.orderId,
      };
    } catch (error) {
      this.logger.error(
        `[PagSeguroService] Erro ao criar cobranca PIX para o pedido ${details.orderId}: ${this.getErrorMessage(error)}`,
      );
      if (axios.isAxiosError(error) && error.response) {
        this.logger.error(
          `[PagSeguroService] Dados do erro da API PagSeguro (PIX): ${JSON.stringify(error.response.data)}`,
        );
        const pagseguroErrorMessage =
          error.response.data?.error_messages?.[0]?.description ||
          error.response.data?.message ||
          'Erro desconhecido do PagSeguro.';
        throw new InternalServerErrorException(
          `Falha no PagSeguro: ${pagseguroErrorMessage}`,
        );
      }
      throw new InternalServerErrorException(
        'Falha ao iniciar cobranca PIX via PagSeguro.',
      );
    }
  }

  // MODIFICADO: Agora recebe o 'notificationBaseUrl' como parametro
  async createPagSeguroCheckoutRedirect(
    details: CreatePagSeguroCheckoutRedirectDetails,
    notificationBaseUrl: string,
  ): Promise<{ redirectUrl: string; pagSeguroCheckoutId: string }> {
    this.logger.log(
      `[PagSeguroService] Criando checkout de redirecionamento para o pedido ${details.orderId}`,
    );

    const customerPhone = this.resolveCustomerPhone(
      details.customer.phone,
      `checkout do pedido ${details.orderId}`,
      'home',
    );
    const finalCustomerTaxId = this.resolveCustomerTaxId(
      details.customer.cpf,
      `checkout do pedido ${details.orderId}`,
    );

    const stateUfMap: { [key: string]: string } = {
      Acre: 'AC',
      Alagoas: 'AL',
      Amapa: 'AP',
      Amazonas: 'AM',
      Bahia: 'BA',
      Ceara: 'CE',
      'Distrito Federal': 'DF',
      'Espirito Santo': 'ES',
      Goias: 'GO',
      Maranhao: 'MA',
      'Mato Grosso': 'MT',
      'Mato Grosso do Sul': 'MS',
      'Minas Gerais': 'MG',
      Para: 'PA',
      Paraiba: 'PB',
      Parana: 'PR',
      Pernambuco: 'PE',
      Piaui: 'PI',
      'Rio de Janeiro': 'RJ',
      'Rio Grande do Norte': 'RN',
      'Rio Grande do Sul': 'RS',
      Rondonia: 'RO',
      Roraima: 'RR',
      'Santa Catarina': 'SC',
      'Sao Paulo': 'SP',
      Sergipe: 'SE',
      Tocantins: 'TO',
    };
    const regionCode =
      stateUfMap[details.shippingAddress.state] ||
      details.shippingAddress.state.toUpperCase();

    const shippingServiceMap: { [key: string]: string } = {
      '4014': 'SEDEX',
      '41106': 'PAC',
      FIXED: 'FIXED',
      TEST_PIX_FREE: 'FIXED',
    };
    const pagSeguroShippingService =
      shippingServiceMap[details.shippingService] || details.shippingService;

    const shippingAddressPayload: PagSeguroCheckoutAddress = {
      country: 'BRA',
      region_code: regionCode,
      city: details.shippingAddress.city,
      postal_code: details.shippingAddress.cep.replace(/\D/g, ''),
      street: details.shippingAddress.street,
      number: details.shippingAddress.number,
      locality: details.shippingAddress.neighborhood,
      complement: details.shippingAddress.complement || null,
    };

    const itemsPayload: PagSeguroCheckoutItem[] = details.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit_amount: Math.round(item.unit_amount.toNumber() * 100),
    }));

    const payload = {
      reference_id: details.orderId,
      customer: {
        name: details.customer.fullName,
        email: details.customer.email,
        tax_id: finalCustomerTaxId,
        phones: [
          {
            country: '55',
            area: customerPhone.area,
            number: customerPhone.number,
            type: customerPhone.type,
          },
        ],
      },
      items: itemsPayload,
      shipping: {
        address: shippingAddressPayload,
        type: 'FIXED',
        service_type: pagSeguroShippingService,
        amount: Math.round(details.shippingPrice.toNumber() * 100),
        address_modifiable: false,
      },
      redirect_url:
        details.checkoutOptions?.redirectUrl ||
        `${this.redirectBaseUrl}/order-success?orderId=${details.orderId}`,
      return_url:
        details.checkoutOptions?.returnUrl ||
        `${this.redirectBaseUrl}/order-success?orderId=${details.orderId}`,
      notification_urls: [`${notificationBaseUrl}/payments/webhook/pagseguro`],
      payment_notification_urls: [`${notificationBaseUrl}/payments/webhook/pagseguro`],
      description: details.description,
      customer_modifiable: false,
      address_modifiable: false,
      ...(details.checkoutOptions?.paymentMethods?.length
        ? {
            payment_methods: details.checkoutOptions.paymentMethods.map((type) => ({ type })),
          }
        : {}),
      ...(details.checkoutOptions?.softDescriptor
        ? { soft_descriptor: details.checkoutOptions.softDescriptor }
        : {}),
    };

    this.logger.log(
      `[PagSeguroService] Payload checkout phone para ${details.orderId}: ${JSON.stringify(payload.customer.phones?.[0])}`,
    );

    this.logGatewayPayload('POST /checkouts', payload);

    try {
      const response = await axios.post(
        `${this.pagSeguroBaseApiUrl}/checkouts`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.pagSeguroToken}`,
            'x-api-version': '4.0',
          },
        },
      );

      this.logger.log(
        `[PagSeguroService] Checkout de redirecionamento criado com sucesso para order ${details.orderId}.`,
      );
      this.logGatewayResponse('POST /checkouts', response.data);

      const checkoutId = response.data.id;
      let checkoutPayload = response.data;
      let redirectUrl = this.extractCheckoutPayLink(checkoutPayload);

      if (
        details.checkoutOptions?.activateIfInactive &&
        checkoutPayload?.status === 'INACTIVE' &&
        checkoutId
      ) {
        await this.activateCheckout(checkoutId);
        checkoutPayload = await this.getCheckoutDetails(checkoutId);
        redirectUrl = this.extractCheckoutPayLink(checkoutPayload);
      }

      if (!redirectUrl) {
        this.logger.error(
          `[PagSeguroService] Resposta invalida do PagSeguro (link PAY ausente): ${JSON.stringify(checkoutPayload)}`,
        );
        throw new InternalServerErrorException(
          'Falha ao obter link de pagamento do PagSeguro. Resposta incompleta.',
        );
      }

      return {
        redirectUrl,
        pagSeguroCheckoutId: checkoutId,
      };
    } catch (error) {
      this.logger.error(
        `[PagSeguroService] Erro ao criar checkout de redirecionamento para order ${details.orderId}: ${this.getErrorMessage(error)}`,
      );
      if (axios.isAxiosError(error) && error.response) {
        this.logger.error(
          `[PagSeguroService] Dados do erro da API PagSeguro: ${JSON.stringify(error.response.data)}`,
        );
        const pagseguroErrorMessage =
          error.response.data?.error_messages?.[0]?.description ||
          error.response.data?.message ||
          'Erro desconhecido do PagSeguro.';
        throw new InternalServerErrorException(
          `Falha no PagSeguro: ${pagseguroErrorMessage}`,
        );
      }
      throw new InternalServerErrorException(
        'Falha ao criar checkout de redirecionamento com PagSeguro.',
      );
    }
  }

  async getCheckoutDetails(pagSeguroCheckoutId: string): Promise<any> {
    this.logger.log(
      `[PagSeguroService] Buscando detalhes do checkout PagSeguro: ${pagSeguroCheckoutId}`,
    );

    const url = `${this.pagSeguroBaseApiUrl}/checkouts/${pagSeguroCheckoutId}`;

    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${this.pagSeguroToken}`,
          'x-api-version': '4.0',
        },
      });
      this.logger.log(
        `[PagSeguroService] Detalhes do checkout ${pagSeguroCheckoutId} obtidos com sucesso.`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `[PagSeguroService] Erro ao buscar detalhes do checkout PagSeguro ${pagSeguroCheckoutId}:`,
        axios.isAxiosError(error)
          ? error.response?.data || this.getErrorMessage(error)
          : this.getErrorMessage(error),
      );
      if (
        axios.isAxiosError(error) &&
        error.response &&
        error.response.status === 404
      ) {
        throw new NotFoundException(
          `Checkout PagSeguro com ID "${pagSeguroCheckoutId}" não encontrado.`,
        );
      }
      throw new InternalServerErrorException(
        'Falha ao consultar detalhes do checkout PagSeguro.',
      );
    }
  }

  async activateCheckout(pagSeguroCheckoutId: string): Promise<any> {
    this.logger.log(
      `[PagSeguroService] Ativando checkout PagSeguro: ${pagSeguroCheckoutId}`,
    );

    try {
      const response = await axios.post(
        `${this.pagSeguroBaseApiUrl}/checkouts/${pagSeguroCheckoutId}/activate`,
        undefined,
        {
          headers: {
            Authorization: `Bearer ${this.pagSeguroToken}`,
            accept: 'application/json',
            'x-api-version': '4.0',
          },
        },
      );

      this.logger.log(
        `[PagSeguroService] Checkout ${pagSeguroCheckoutId} ativado com sucesso.`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `[PagSeguroService] Erro ao ativar checkout ${pagSeguroCheckoutId}: ${this.getErrorMessage(error)}`,
      );
      if (axios.isAxiosError(error) && error.response) {
        this.logger.error(
          `[PagSeguroService] Dados do erro da ativacao do checkout: ${JSON.stringify(error.response.data)}`,
        );
      }
      throw new InternalServerErrorException(
        'Falha ao ativar checkout no PagSeguro.',
      );
    }
  }

  async getOrderDetails(orderId: string): Promise<any> {
    this.logger.log(
      `[PagSeguroService] Buscando detalhes do pedido PagSeguro: ${orderId}`,
    );

    const url = `${this.pagSeguroBaseApiUrl}/orders/${orderId}`;

    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${this.pagSeguroToken}`,
          'x-api-version': '4.0',
        },
      });
      this.logger.log(
        `[PagSeguroService] Detalhes do pedido ${orderId} obtidos com sucesso.`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `[PagSeguroService] Erro ao buscar detalhes do pedido PagSeguro ${orderId}:`,
        axios.isAxiosError(error)
          ? error.response?.data || this.getErrorMessage(error)
          : this.getErrorMessage(error),
      );
      if (
        axios.isAxiosError(error) &&
        error.response &&
        error.response.status === 404
      ) {
        throw new NotFoundException(
          `Pedido PagSeguro com ID "${orderId}" não encontrado.`,
        );
      }
      throw new InternalServerErrorException(
        'Falha ao consultar detalhes do pedido PagSeguro.',
      );
    }
  }

  // NOVO: Método para iniciar um reembolso
  async initiateRefund(transactionId: string, amount?: number): Promise<any> {
    this.logger.log(
      `[PagSeguroService] Iniciando reembolso para a transação ${transactionId}, valor: ${amount || 'total'}`,
    );

    const refundUrl = `${this.pagSeguroBaseApiUrl}/charges/${transactionId}/cancel`;

    const payload: any = {};
    if (amount) {
      payload.amount = { value: Math.round(amount * 100) };
    }

    try {
      const response = await axios.post(refundUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.pagSeguroToken}`,
          'x-api-version': '4.0',
        },
      });
      this.logger.log(
        `[PagSeguroService] Reembolso iniciado com sucesso para transação ${transactionId}.`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `[PagSeguroService] Erro ao iniciar reembolso para transação ${transactionId}: ${this.getErrorMessage(error)}`,
      );
      if (axios.isAxiosError(error) && error.response) {
        this.logger.error(
          `[PagSeguroService] Dados do erro da API PagSeguro (reembolso): ${JSON.stringify(error.response.data)}`,
        );
        const pagseguroErrorMessage =
          error.response.data?.error_messages?.[0]?.description ||
          error.response.data?.message ||
          'Erro desconhecido do PagSeguro.';
        throw new InternalServerErrorException(
          `Falha no PagSeguro ao reembolsar: ${pagseguroErrorMessage}`,
        );
      }
      throw new InternalServerErrorException(
        'Falha ao iniciar reembolso com PagSeguro.',
      );
    }
    
  }
  async createCreditCardOrder(details: {
  orderId: string;
  amount: number;
  description: string;
  customer: { email: string; name: string; cpf: string; phone?: string };
  items: Array<{ name: string; quantity: number; unit_amount: number }>;
  shippingAddress: any;
  encryptedCard: string;
  holderName: string;
  holderCpf: string;
  installments: number;
  notificationUrl: string;
  subMerchant: {
    referenceId: string;
    name: string;
    taxId: string;
    mcc: string;
    address: {
      country: string;
      regionCode: string;
      city: string;
      postalCode: string;
      street: string;
      number: string;
      locality: string;
    };
    phones: Array<{ country: string; area: string; number: string; type: string }>;
  };
}) {
  const finalCustomerPhone = details.customer.phone
    ? this.resolveCustomerPhone(
        details.customer.phone,
        `cartao do pedido ${details.orderId}`,
      )
    : null;
  const finalCustomerTaxId = this.resolveCustomerTaxId(
    details.customer.cpf,
    `cartao do pedido ${details.orderId}`,
  );
  const finalHolderTaxId = this.resolveCustomerTaxId(
    details.holderCpf,
    `portador do cartao do pedido ${details.orderId}`,
  );

  const payload = {
    reference_id: details.orderId,
    customer: {
      name: details.customer.name,
      email: details.customer.email,
      tax_id: finalCustomerTaxId,
      phones: finalCustomerPhone ? [{
        country: '55',
        area: finalCustomerPhone.area,
        number: finalCustomerPhone.number,
        type: finalCustomerPhone.type
      }] : []
    },
    items: details.items,
    shipping: {
      address: {
        country: 'BRA',
        region_code: details.shippingAddress.state,
        city: details.shippingAddress.city,
        postal_code: details.shippingAddress.cep?.replace(/\D/g, '') || '',
        street: details.shippingAddress.street,
        number: details.shippingAddress.number,
        locality: details.shippingAddress.neighborhood,
        complement: details.shippingAddress.complement || undefined
      }
    },
    charges: [{
      reference_id: `charge_${details.orderId}`,
      description: details.description,
      amount: { value: Math.round(details.amount * 100), currency: 'BRL' },
      payment_method: {
        type: 'CREDIT_CARD',
        installments: details.installments || 1,
        capture: true,
        card: { encrypted: details.encryptedCard, store: false },
        holder: { name: details.holderName, tax_id: finalHolderTaxId }
      },
      sub_merchant: {
        reference_id: details.subMerchant.referenceId,
        name: details.subMerchant.name,
        tax_id: details.subMerchant.taxId,
        mcc: details.subMerchant.mcc,
        address: {
          country: details.subMerchant.address.country,
          region_code: details.subMerchant.address.regionCode,
          city: details.subMerchant.address.city,
          postal_code: details.subMerchant.address.postalCode,
          street: details.subMerchant.address.street,
          number: details.subMerchant.address.number,
          locality: details.subMerchant.address.locality
        },
        phones: details.subMerchant.phones
      }
    }],
    notification_urls: [details.notificationUrl]
  };

  try {
    const response = await axios.post(`${this.pagSeguroBaseApiUrl}/orders`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.pagSeguroToken}`,
        'x-api-version': '4.0'
      }
    });
    return response.data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.logger.error(`Erro ao criar pedido com cartão: ${errorMessage}`);
    if (axios.isAxiosError(error) && error.response) {
      this.logger.error(
        `[PagSeguroService] Dados do erro da API PagSeguro (cartao): ${JSON.stringify(error.response.data)}`,
      );
    }
    throw error;
  }
}
}
