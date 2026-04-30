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
  reference_id?: string; // ID de referÃªncia do item (opcional)
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

// Interface para o endereÃ§o no checkout do PagSeguro
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
  service_type: string; // ServiÃ§o de frete (ex: SEDEX, PAC)
  amount: number; // Custo do frete em centavos
  estimated_delivery_time_in_days?: number;
  address_modifiable?: boolean; // Se o cliente pode modificar o endereÃ§o na pÃ¡gina do PagSeguro
}

// Interface para os detalhes necessÃ¡rios para criar um checkout de redirecionamento
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
    unit_amount: Prisma.Decimal; // PreÃ§o unitÃ¡rio do item
  }>;
}

// Interface para os detalhes necessÃ¡rios para criar uma cobranÃ§a PIX
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

// NOVO: Interface para os detalhes necessÃ¡rios para processar pagamento direto com cartÃ£o
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
  private pagSeguroEmail: string; // Email da conta PagSeguro, se necessÃ¡rio para alguma API
  private redirectBaseUrl: string; // URL base do frontend (ngrok)

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  constructor(private configService: ConfigService) {
    // Carrega a URL base da API do PagSeguro (ex: https://sandbox.api.pagseguro.com)
    this.pagSeguroBaseApiUrl =
      this.configService.get<string>('PAGSEGURO_API_URL') ||
      'https://sandbox.api.pagseguro.com';
    this.pagSeguroToken = this.configService.get<string>(
      'PAGSEGURO_API_TOKEN',
    )!;
    this.pagSeguroEmail = this.configService.get<string>('PAGSEGURO_EMAIL')!; // Pode ser necessÃ¡rio para APIs mais antigas ou especÃ­ficas

    // Carrega as URLs do ngrok do .env
    this.redirectBaseUrl = this.configService.get<string>('FRONTEND_URL')!; // Usando FRONTEND_URL
    // REMOVIDO: this.notificationBaseUrl = this.configService.get<string>('BACKEND_URL')!;

    // ValidaÃ§Ã£o de configuraÃ§Ã£o
    if (!this.pagSeguroToken || !this.redirectBaseUrl) {
      this.logger.error(
        'Credenciais e/ou URLs do PagSeguro nÃ£o configuradas corretamente. Verifique PAGSEGURO_API_TOKEN, FRONTEND_URL no seu .env.',
      );
      throw new InternalServerErrorException(
        'Credenciais e/ou URLs do PagSeguro nÃ£o configuradas.',
      );
    }
  }

  async createSession() {
    const sessionUrl = `https://ws.sandbox.pagseguro.uol.com.br/v2/sessions?email=${this.pagSeguroEmail}&token=${this.pagSeguroToken}`;

    try {
      const response = await axios.post(sessionUrl);
      this.logger.log(
        `[PagSeguroService] SessÃ£o PagSeguro criada: ${JSON.stringify(response.data)}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error('Erro ao criar sessÃ£o no PagSeguro:', this.getErrorMessage(error));
      if (axios.isAxiosError(error) && error.response) {
        this.logger.error(
          `[PagSeguroService] Dados do erro da API PagSeguro (sessÃ£o): ${JSON.stringify(error.response.data)}`,
        );
      }
      throw new InternalServerErrorException(
        'Falha ao criar sessÃ£o no PagSeguro.',
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
        response.data?.public_key ?? response.data?.publicKey ?? '';
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

  // MODIFICADO: Agora recebe o 'notificationBaseUrl' como parÃ¢metro
  async createPagSeguroPixCharge(
    details: CreatePagSeguroPixChargeDetails,
    notificationBaseUrl: string,
  ): Promise<PixGatewayResponse> {
    this.logger.log(
      `[PagSeguroService] Criando cobranÃ§a PIX para o pedido ${details.orderId}`,
    );

    const cleanedPhone = details.customer.phone
      ? details.customer.phone.replace(/\D/g, '')
      : '';
    let customerPhoneArea: string;
    let customerPhoneNumber: string;
    let customerPhoneType: 'MOBILE' | 'HOME' | 'BUSINESS';

    const isSandbox = this.pagSeguroBaseApiUrl.includes('sandbox');
    if (isSandbox) {
      customerPhoneArea = '11';
      customerPhoneNumber = '999999999';
      customerPhoneType = 'MOBILE';
      this.logger.debug(
        `[PagSeguroService] Usando telefone de teste para sandbox: (${customerPhoneArea}) ${customerPhoneNumber}`,
      );
    } else {
      if (cleanedPhone.length >= 10) {
        customerPhoneArea = cleanedPhone.substring(0, 2);
        customerPhoneNumber = cleanedPhone.substring(2);
        customerPhoneType =
          customerPhoneNumber.length === 9 ? 'MOBILE' : 'HOME';
      } else {
        this.logger.warn(
          `[PagSeguroService] Telefone do cliente (${details.customer.phone}) Ã© invÃ¡lido. Usando fallback.`,
        );
        customerPhoneArea = '11';
        customerPhoneNumber = '999999999';
        customerPhoneType = 'MOBILE';
      }
    }

    const customerTaxId = (details.customer.cpf || '30061150827').replace(
      /\D/g,
      '',
    );
    const finalCustomerTaxId =
      customerTaxId.length === 11 ? customerTaxId : '30061150827';

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
            area: customerPhoneArea,
            number: customerPhoneNumber,
            type: customerPhoneType,
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
      // MODIFICADO: Agora usa o parÃ¢metro 'notificationBaseUrl'
      notification_urls: [`${notificationBaseUrl}/payments/webhook/pagseguro`],
    };

    this.logger.warn(
      `[PagSeguroService][HOMOLOG] POST /orders payload=${JSON.stringify(payload)}`,
    );

    this.logger.debug(
      `[PagSeguroService] Enviando cobranÃ§a PIX para PagSeguro (${this.pagSeguroBaseApiUrl}/orders) para o pedido ${details.orderId}.`,
    );

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
        `[PagSeguroService] CobranÃ§a PIX criada com sucesso para o pedido ${details.orderId}.`,
      );
      this.logger.warn(
        `[PagSeguroService][HOMOLOG] response=${JSON.stringify(response.data)}`,
      );

      const qrCodeResponse = response.data.qr_codes?.[0];

      if (!qrCodeResponse) {
        throw new InternalServerErrorException(
          'Resposta invÃ¡lida do PagSeguro: QR Code nÃ£o encontrado na resposta do pedido.',
        );
      }

      return {
        transactionId: response.data.id,
        chargeId: qrCodeResponse.id,
        status: 'PENDING',
        brCode: qrCodeResponse.text,
        qrCodeImage: qrCodeResponse.links?.find(
          (link: any) =>
            link.rel === 'QR_CODE_IMAGE' || link.rel === 'QRCODE.PNG',
        )?.href,
        expiresAt: qrCodeResponse.expiration_date,
        amount: details.amount.toNumber(),
        description: details.description,
        orderId: details.orderId,
      };
    } catch (error) {
      this.logger.error(
        `[PagSeguroService] Erro ao criar cobranÃ§a PIX para o pedido ${details.orderId}: ${this.getErrorMessage(error)}`,
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
        'Falha ao criar cobranÃ§a PIX com PagSeguro.',
      );
    }
  }

  // MODIFICADO: Agora recebe o 'notificationBaseUrl' como parÃ¢metro
  async processDirectCreditCardPayment(
    details: CreatePagSeguroCreditCardChargeDetails,
    notificationBaseUrl: string,
  ): Promise<CardGatewayResponse> {
    this.logger.log(
      `[PagSeguroService] Processando pagamento com cartÃ£o para o pedido ${details.orderId}`,
    );

    const cleanedPhone = details.customer.phone
      ? details.customer.phone.replace(/\D/g, '')
      : '';
    let customerPhoneArea: string;
    let customerPhoneNumber: string;
    let customerPhoneType: 'MOBILE' | 'HOME' | 'BUSINESS';

    if (cleanedPhone.length >= 10) {
      customerPhoneArea = cleanedPhone.substring(0, 2);
      customerPhoneNumber = cleanedPhone.substring(2);
      customerPhoneType = customerPhoneNumber.length === 9 ? 'MOBILE' : 'HOME';
    } else {
      this.logger.warn(
        `[PagSeguroService] Telefone do cliente (${details.customer.phone}) Ã© invÃ¡lido. Usando fallback.`,
      );
      customerPhoneArea = '11';
      customerPhoneNumber = '999999999';
      customerPhoneType = 'MOBILE';
    }

    const customerTaxId = (details.customer.cpf || '30061150827').replace(
      /\D/g,
      '',
    );
    const finalCustomerTaxId =
      customerTaxId.length === 11 ? customerTaxId : '30061150827';

    const itemsPayload: PagSeguroCheckoutItem[] = details.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit_amount: Math.round(item.unit_amount.toNumber() * 100),
    }));

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

    const payload = {
      reference_id: details.orderId,
      customer: {
        name: details.customer.fullName,
        email: details.customer.email,
        tax_id: finalCustomerTaxId,
        phones: [
          {
            country: '55',
            area: customerPhoneArea,
            number: customerPhoneNumber,
            type: customerPhoneType,
          },
        ],
      },
      items: itemsPayload,
      shipping: {
        address: {
          country: 'BRA',
          region_code: regionCode,
          city: details.shippingAddress.city,
          postal_code: details.shippingAddress.cep.replace(/\D/g, ''),
          street: details.shippingAddress.street,
          number: details.shippingAddress.number,
          locality: details.shippingAddress.neighborhood,
          complement: details.shippingAddress.complement || null,
        },
        amount: Math.round(details.shippingPrice.toNumber() * 100),
        type: 'FIXED',
        service_type: 'STANDARD',
      },
      charges: [
        {
          reference_id: details.orderId,
          description: details.description,
          amount: { value: Math.round(details.amount.toNumber() * 100) },
          payment_method: {
            type: 'CREDIT_CARD',
            installments: details.cardDetails.installments || 1,
            capture: true,
            card: {
              token: details.cardDetails.token,
              holder: {
                name: details.cardDetails.holderName,
                tax_id: details.cardDetails.cpf.replace(/\D/g, ''),
              },
            },
          },
        },
      ],
      // MODIFICADO: Agora usa o parÃ¢metro 'notificationBaseUrl'
      notification_urls: [`${notificationBaseUrl}/payments/webhook/pagseguro`],
    };

    this.logger.warn(
      `[PagSeguroService][HOMOLOG] POST /orders payload=${JSON.stringify(payload)}`,
    );

    this.logger.debug(
      `[PagSeguroService] Enviando pagamento com cartÃ£o para PagSeguro (${this.pagSeguroBaseApiUrl}/orders) para o pedido ${details.orderId}.`,
    );

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
        `[PagSeguroService] Pagamento com cartÃ£o processado com sucesso para o pedido ${details.orderId}.`,
      );
      this.logger.warn(
        `[PagSeguroService][HOMOLOG] response=${JSON.stringify(response.data)}`,
      );

      const charge = response.data.charges?.[0];
      if (!charge) {
        throw new InternalServerErrorException(
          'Resposta invÃ¡lida do PagSeguro: charge nÃ£o encontrada.',
        );
      }

      return {
        transactionId: response.data.id,
        status: charge.status,
        transactionRef: charge.id,
        amount: details.amount.toNumber(),
        description: details.description,
        orderId: details.orderId,
      };
    } catch (error) {
      this.logger.error(
        `[PagSeguroService] Erro ao processar pagamento com cartÃ£o para o pedido ${details.orderId}: ${this.getErrorMessage(error)}`,
      );
      if (axios.isAxiosError(error) && error.response) {
        this.logger.error(
          `[PagSeguroService] Dados do erro da API PagSeguro (Direct Card): ${JSON.stringify(error.response.data)}`,
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
        'Falha ao processar pagamento direto com cartÃ£o de crÃ©dito via PagSeguro.',
      );
    }
  }

  // MODIFICADO: Agora recebe o 'notificationBaseUrl' como parÃ¢metro
  async createPagSeguroCheckoutRedirect(
    details: CreatePagSeguroCheckoutRedirectDetails,
    notificationBaseUrl: string,
  ): Promise<{ redirectUrl: string; pagSeguroCheckoutId: string }> {
    this.logger.log(
      `[PagSeguroService] Criando checkout de redirecionamento para o pedido ${details.orderId}`,
    );
    this.logger.debug(
      `[PagSeguroService] Raw customer phone: ${details.customer.phone}`,
    );

    let customerPhoneArea: string;
    let customerPhoneNumber: string;
    let customerPhoneType: 'MOBILE' | 'HOME' | 'BUSINESS';

    const isSandbox = this.pagSeguroBaseApiUrl.includes('sandbox');

    if (isSandbox) {
      customerPhoneArea = '11';
      customerPhoneNumber = '30335000';
      customerPhoneType = 'HOME';
      this.logger.debug(
        `[PagSeguroService] Usando telefone de teste para sandbox: (${customerPhoneArea}) ${customerPhoneNumber}`,
      );
    } else {
      const cleanedPhone = details.customer.phone
        ? details.customer.phone.replace(/\D/g, '')
        : '';
      if (cleanedPhone.length >= 10) {
        customerPhoneArea = cleanedPhone.substring(0, 2);
        customerPhoneNumber = cleanedPhone.substring(2);
        customerPhoneType =
          customerPhoneNumber.length === 9 ? 'MOBILE' : 'HOME';
      } else {
        this.logger.warn(
          `[PagSeguroService] Telefone do cliente (${details.customer.phone}) Ã© invÃ¡lido. Usando fallback.`,
        );
        customerPhoneArea = '11';
        customerPhoneNumber = '999999999';
        customerPhoneType = 'MOBILE';
      }
    }

    const customerTaxId = (details.customer.cpf || '30061150827').replace(
      /\D/g,
      '',
    );
    const finalCustomerTaxId =
      customerTaxId.length === 11 ? customerTaxId : '30061150827';

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
    if (regionCode.length !== 2) {
      this.logger.warn(
        `[PagSeguroService] CÃ³digo de regiÃ£o invÃ¡lido para o estado: ${details.shippingAddress.state}. Enviado: ${regionCode}`,
      );
    }

    const shippingServiceMap: { [key: string]: string } = {
      '4014': 'SEDEX',
      '41106': 'PAC',
      FIXED: 'FIXED',
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
            area: customerPhoneArea,
            number: customerPhoneNumber,
            type: customerPhoneType,
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
      redirect_url: `${this.redirectBaseUrl}/order-success?orderId=${details.orderId}`,
      // MODIFICADO: Agora usa o parÃ¢metro 'notificationBaseUrl'
      notification_urls: [`${notificationBaseUrl}/payments/webhook/pagseguro`],
      description: details.description,
      customer_modifiable: false,
      address_modifiable: false,
    };

    this.logger.warn(
      `[PagSeguroService][HOMOLOG] POST /checkouts payload=${JSON.stringify(payload)}`,
    );

    this.logger.debug(
      `[PagSeguroService] Enviando checkout de redirecionamento para PagSeguro (${this.pagSeguroBaseApiUrl}/checkouts) para o pedido ${details.orderId}.`,
    );

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
      this.logger.warn(
        `[PagSeguroService][HOMOLOG] response=${JSON.stringify(response.data)}`,
      );

      const checkoutId = response.data.id;
      const payLink = response.data.links?.find(
        (link: any) => link.rel === 'PAY',
      );

      if (!payLink || !payLink.href) {
        this.logger.error(
          `[PagSeguroService] Resposta invÃ¡lida do PagSeguro (link PAY ausente): ${JSON.stringify(response.data)}`,
        );
        throw new InternalServerErrorException(
          'Falha ao obter link de pagamento do PagSeguro. Resposta incompleta.',
        );
      }

      return {
        redirectUrl: payLink.href,
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
          `Checkout PagSeguro com ID "${pagSeguroCheckoutId}" nÃ£o encontrado.`,
        );
      }
      throw new InternalServerErrorException(
        'Falha ao consultar detalhes do checkout PagSeguro.',
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
          `Pedido PagSeguro com ID "${orderId}" nÃ£o encontrado.`,
        );
      }
      throw new InternalServerErrorException(
        'Falha ao consultar detalhes do pedido PagSeguro.',
      );
    }
  }

  // NOVO: MÃ©todo para iniciar um reembolso
  async initiateRefund(transactionId: string, amount?: number): Promise<any> {
    this.logger.log(
      `[PagSeguroService] Iniciando reembolso para a transaÃ§Ã£o ${transactionId}, valor: ${amount || 'total'}`,
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
        `[PagSeguroService] Reembolso iniciado com sucesso para transaÃ§Ã£o ${transactionId}.`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `[PagSeguroService] Erro ao iniciar reembolso para transaÃ§Ã£o ${transactionId}: ${this.getErrorMessage(error)}`,
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
}
