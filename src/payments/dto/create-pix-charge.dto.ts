import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsString, IsNotEmpty, IsOptional, IsUUID, Min, IsEnum } from 'class-validator';

// O DTO de entrada para criar uma cobrança PIX para um PEDIDO
export class CreatePixChargeDto {
  @ApiProperty({ description: 'ID do pedido relacionado a esta cobrança', example: 'uuid-do-pedido' })
  @IsUUID()
  @IsNotEmpty()
  orderId: string; // Alterado de bookingId para orderId

  @ApiPropertyOptional({ description: 'ID do convidado, se a compra for de um usuário não autenticado', example: 'uuid-do-convidado' })
  @IsUUID()
  @IsOptional()
  guestId?: string; // NOVO: Adicionado para permitir que o guestId seja passado
}

// DTO de resposta para a criação de uma cobrança PIX
export class PixChargeResponseDto {
  @ApiProperty({ description: 'ID da transação gerada', example: 'uuid-da-transacao' })
  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @ApiProperty({
    enum: ['PENDING', 'COMPLETED', 'CANCELED', 'EXPIRED', 'FAILED'], // Adicionado FAILED
    description: 'Status da transação. Reflete o estado inicial da cobrança.',
    example: 'PENDING',
  })
  @IsEnum(['PENDING', 'COMPLETED', 'CANCELED', 'EXPIRED', 'FAILED'])
  @IsNotEmpty()
  status: 'PENDING' | 'COMPLETED' | 'CANCELED' | 'EXPIRED' | 'FAILED';

  @ApiProperty({ description: 'Código PIX Copia e Cola (BR Code)', example: '00020126580014BR.GOV.BCB.PIX0136...' })
  @IsString()
  @IsNotEmpty()
  brCode: string;

  @ApiProperty({ description: 'URL da imagem do QR Code PIX', example: 'https://api.example.com/pix/qrcode/uuid-da-transacao.png' })
  @IsString()
  @IsNotEmpty()
  qrCodeImage: string;

  @ApiProperty({
    description: 'Data e hora de expiração da cobrança no formato ISO 8601.',
    example: '2025-06-01T10:30:00.000Z',
  })
  @IsString()
  @IsNotEmpty()
  expiresAt: string;

  @ApiProperty({ description: 'Valor da cobrança PIX', example: 150.75 })
  @IsNumber()
  @Min(0.01)
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ description: 'Descrição da cobrança PIX', example: 'Pagamento do pedido X' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'ID do pedido relacionado a esta cobrança', example: 'uuid-do-pedido' })
  @IsUUID()
  @IsNotEmpty()
  orderId: string; // Alterado de bookingId para orderId

  @ApiPropertyOptional({ description: 'Mensagem de erro do BR Code (se houver, para depuração/exibição)', example: 'Código PIX inválido' })
  @IsOptional()
  @IsString()
  brCodeError?: string;

  @ApiPropertyOptional({ description: 'Data de expiração em formato alternativo (se usado internamente)', example: '2025-06-01T10:30:00.000Z' })
  @IsOptional()
  @IsString()
  expirationDate?: string;
}