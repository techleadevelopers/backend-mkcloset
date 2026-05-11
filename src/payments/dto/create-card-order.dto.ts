import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateCardOrderDto {
  @IsOptional()
  @IsString()
  orderId?: string;

  @IsString()
  encryptedCard!: string;

  @IsString()
  holderName!: string;

  @IsString()
  holderCpf!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  installments?: number;

  @IsOptional()
  @IsUUID()
  guestId?: string;

  @IsOptional()
  @IsString()
  signature?: string;
}
