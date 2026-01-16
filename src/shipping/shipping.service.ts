import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from 'src/config/config.service';
import { CalculateShippingDto, CartItemForShipping } from './dto/calculate-shipping.dto';
import { CorreiosResponse, ShippingOption } from './interfaces/correios.interface'; // Crie esta interface
import { AppConstants } from 'src/common/constants/app.constants';
import axios from 'axios'; // Instale: npm install axios

@Injectable()
export class ShippingService {
  constructor(private configService: ConfigService) {}

  async calculateShipping(dto: CalculateShippingDto): Promise<CorreiosResponse> {
    const { zipCode, items } = dto;

    if (!zipCode || zipCode.replace(/\D/g, '').length !== 8) {
      throw new BadRequestException('CEP inválido. Por favor, digite um CEP válido com 8 dígitos.');
    }

    // Validação básica de CEP via ViaCEP (simulada ou real)
    const cleanZip = zipCode.replace(/\D/g, '');
    try {
      const viaCepResponse = await axios.get(`https://viacep.com.br/ws/${cleanZip}/json/`);
      if (viaCepResponse.data.erro) {
        throw new BadRequestException('CEP não encontrado.');
      }
    } catch (error) {
      throw new BadRequestException('Erro ao validar CEP. Verifique o CEP digitado.');
    }

    // Calcular informações totais do pacote
    const packageInfo = this.getTotalPackageInfo(items);

    // Simulação de cálculo de frete baseado na lógica do frontend (regional)
    // Em um cenário real, você chamaria a API dos Correios ou de outra transportadora aqui.
    // Ex: const correiosApiUrl = this.configService.correiosApiUrl;
    // const response = await axios.get(`${correiosApiUrl}/ws/calculo/v1/precos?cepOrigem=...`);

    const region = parseInt(cleanZip.substring(0, 2));

    let sedexPrice = 25.50;
    let pacPrice = 15.50;
    let sedexTime = 3;
    let pacTime = 8;

    // Ajustar preços por região (baseado nas faixas do frontend)
    if (region >= 1 && region <= 19) { // São Paulo - SP
      sedexPrice = 20.50;
      pacPrice = 12.50;
      sedexTime = 2;
      pacTime = 5;
    } else if (region >= 20 && region <= 28) { // Rio de Janeiro - RJ
      sedexPrice = 22.50;
      pacPrice = 13.50;
      sedexTime = 3;
      pacTime = 6;
    } else if (region >= 30 && region <= 39) { // Minas Gerais - MG
      sedexPrice = 24.50;
      pacPrice = 14.50;
      sedexTime = 3;
      pacTime = 7;
    } else if (region >= 40 && region <= 48) { // Bahia - BA (Nordeste)
      sedexPrice = 35.50;
      pacPrice = 20.50;
      sedexTime = 5;
      pacTime = 12;
    } else if (region >= 50 && region <= 56) { // Pernambuco - PE (Nordeste)
      sedexPrice = 37.50;
      pacPrice = 22.50;
      sedexTime = 6;
      pacTime = 13;
    } else if (region >= 60 && region <= 72) { // Centro-Oeste (GO, MT, MS, DF)
      sedexPrice = 38.50;
      pacPrice = 22.50;
      sedexTime = 6;
      pacTime = 14;
    } else if (region >= 80 && region <= 87) { // Paraná - PR (Sul)
      sedexPrice = 28.50;
      pacPrice = 16.50;
      sedexTime = 4;
      pacTime = 10;
    } else if (region >= 88 && region <= 89) { // Santa Catarina - SC (Sul)
      sedexPrice = 30.50;
      pacPrice = 18.50;
      sedexTime = 4;
      pacTime = 11;
    } else if (region >= 90 && region <= 99) { // Rio Grande do Sul - RS (Sul)
      sedexPrice = 32.50;
      pacPrice = 19.50;
      sedexTime = 5;
      pacTime = 12;
    } else { // Norte (AC, AP, AM, PA, RO, RR, TO)
      sedexPrice = 45.50;
      pacPrice = 28.50;
      sedexTime = 8;
      pacTime = 18;
    }

    // Ajustar preço pelo peso (acima de 1kg)
    if (packageInfo.weight > 1) {
      const extraWeight = packageInfo.weight - 1;
      sedexPrice += extraWeight * 5;
      pacPrice += extraWeight * 3;
    }

    // Valor declarado (seguro)
    if (packageInfo.value > 100) {
      const insurance = (packageInfo.value - 100) * 0.02;
      sedexPrice += insurance;
      pacPrice += insurance;
    }

    const options: ShippingOption[] = [
      {
        service: '40010',
        serviceName: 'SEDEX',
        price: parseFloat(sedexPrice.toFixed(2)),
        deliveryTime: sedexTime,
      },
      {
        service: '41106',
        serviceName: 'PAC',
        price: parseFloat(pacPrice.toFixed(2)),
        deliveryTime: pacTime,
      },
    ];

    return {
      zipCode: cleanZip,
      options,
      freeShipping: packageInfo.value >= AppConstants.FREE_SHIPPING_THRESHOLD,
      freeShippingThreshold: AppConstants.FREE_SHIPPING_THRESHOLD,
    };
  }

  private getTotalPackageInfo(items: CartItemForShipping[]) {
    let totalWeight = 0;
    let totalValue = 0;
    let maxLength = 0;
    let maxWidth = 0;
    let totalHeight = 0;

    items.forEach((item) => {
      const productWeight = item.product.weight || AppConstants.DEFAULT_PRODUCT_WEIGHT_KG;
      const productLength = item.product.dimensions?.length || AppConstants.DEFAULT_PRODUCT_DIMENSION_CM.length;
      const productWidth = item.product.dimensions?.width || AppConstants.DEFAULT_PRODUCT_DIMENSION_CM.width;
      const productHeight = item.product.dimensions?.height || AppConstants.DEFAULT_PRODUCT_DIMENSION_CM.height;

      totalWeight += productWeight * item.quantity;
      totalValue += item.product.price * item.quantity;

      maxLength = Math.max(maxLength, productLength);
      maxWidth = Math.max(maxWidth, productWidth);
      totalHeight += productHeight * item.quantity; // Soma alturas para empilhamento
    });

    return {
      weight: Math.max(totalWeight, AppConstants.MIN_PRODUCT_WEIGHT_KG),
      length: Math.max(maxLength, AppConstants.MIN_CORREIOS_LENGTH_CM),
      width: Math.max(maxWidth, AppConstants.MIN_CORREIOS_WIDTH_CM),
      height: Math.max(totalHeight, AppConstants.MIN_CORREIOS_HEIGHT_CM),
      value: totalValue,
    };
  }
}