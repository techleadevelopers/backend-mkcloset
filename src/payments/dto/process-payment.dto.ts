// src/payments/dto/process-payment.dto.ts

import { IsEnum, IsOptional, IsString, IsNumber, Min, ValidateIf, IsNotEmpty } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

// Este enum deve ser o mesmo que o seu serviço espera
enum PaymentMethod {
  PIX = 'PIX',
  CREDIT_CARD = 'CREDIT_CARD',
  BOLETO = 'BOLETO',
}

export class ProcessPaymentDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod, {
    message: 'paymentMethod deve ser um dos seguintes valores: PIX, CREDIT_CARD, BOLETO',
  })
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ example: '123.456.789-00' })
  @IsOptional()
  @IsString()
  clientCpf?: string;

  @ApiPropertyOptional({ example: '11999999999' })
  @IsOptional()
  @IsString()
  clientPhone?: string;

  // --- Campos específicos para Cartão de Crédito ---

  @ApiPropertyOptional({ description: 'Token gerado pelo SDK do PagSeguro no frontend', example: 'tok_xxxxxxxxxxxxxxxx' })
  @ValidateIf(o => o.paymentMethod === PaymentMethod.CREDIT_CARD)
  @IsNotEmpty({ message: 'Token do cartão de crédito é obrigatório para pagamento via Cartão de Crédito.' })
  @IsString()
  cardToken?: string;

  @ApiPropertyOptional({ description: 'Nome completo do titular do cartão', example: 'João da Silva' })
  @ValidateIf(o => o.paymentMethod === PaymentMethod.CREDIT_CARD)
  @IsNotEmpty({ message: 'Nome do titular do cartão é obrigatório para pagamento via Cartão de Crédito.' })
  @IsString()
  cardHolderName?: string;

  @ApiPropertyOptional({ description: 'CPF do titular do cartão', example: '000.000.000-00' })
  @ValidateIf(o => o.paymentMethod === PaymentMethod.CREDIT_CARD)
  @IsNotEmpty({ message: 'CPF do titular do cartão é obrigatório para pagamento via Cartão de Crédito.' })
  @IsString()
  cardCpf?: string;

  @ApiPropertyOptional({ description: 'Número de parcelas', example: 1 })
  @ValidateIf(o => o.paymentMethod === PaymentMethod.CREDIT_CARD)
  @IsOptional()
  @IsNumber()
  @Min(1)
  cardInstallments?: number;

  @ApiPropertyOptional({ description: 'Bandeira do cartão (e.g., VISA, MASTERCARD)', example: 'VISA' })
  @ValidateIf(o => o.paymentMethod === PaymentMethod.CREDIT_CARD)
  @IsOptional()
  @IsString()
  cardBrand?: string;
}
