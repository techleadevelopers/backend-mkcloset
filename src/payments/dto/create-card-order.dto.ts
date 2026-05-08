// src/payments/dto/create-card-order.dto.ts

export class CreateCardOrderDto {
  orderId!: string;
  encryptedCard!: string;
  holderName!: string;
  holderCpf!: string;
  installments?: number;
  guestId?: string;
  signature?: string;
}