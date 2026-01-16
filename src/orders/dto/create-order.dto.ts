// src/orders/dto/create-order.dto.ts

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber, 
  IsBoolean,
  ValidateNested,
  IsEmail,
  IsPhoneNumber,
  Min,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

// DTO para informações de contato do convidado
export class GuestContactInfoDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsPhoneNumber('BR') // Assumindo formato de telefone brasileiro
  @IsOptional()
  phone?: string;
  
  // NOVO: Adicionado campo CPF para pagamentos.
  @IsString()
  @IsOptional()
  cpf?: string;
}

// DTO para endereço de entrega do convidado
export class GuestShippingAddressDto {
  @IsString()
  @IsNotEmpty()
  street: string;

  @IsString()
  @IsNotEmpty()
  number: string;

  @IsString()
  @IsOptional()
  complement?: string; // Pode ser string ou undefined

  @IsString()
  @IsNotEmpty()
  neighborhood: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  zipCode: string;
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  paymentMethod: string;

  @IsObject()
  @IsOptional()
  paymentDetails?: Record<string, any>;

  @IsString()
  @IsNotEmpty()
  shippingService: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  shippingPrice: number;

  @IsUUID()
  @IsOptional()
  shippingAddressId?: string; 

  @IsUUID()
  @IsOptional()
  guestId?: string;

  @ValidateNested()
  @Type(() => GuestContactInfoDto)
  @IsOptional()
  guestContactInfo?: GuestContactInfoDto;

  @ValidateNested()
  @Type(() => GuestShippingAddressDto)
  @IsOptional()
  guestShippingAddress?: GuestShippingAddressDto;
  
  // NOVO: Adicionado os campos para criar conta do convidado
  @IsBoolean()
  @IsOptional()
  shouldCreateAccount?: boolean;

  @IsString()
  @IsOptional()
  guestPassword?: string;
}