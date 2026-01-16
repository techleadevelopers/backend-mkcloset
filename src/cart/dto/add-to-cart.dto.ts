import { IsNotEmpty, IsString, IsInt, Min, IsOptional } from 'class-validator';

export class AddToCartDto {
  @IsNotEmpty()
  @IsString()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional() // NOVO: Campo opcional para o ID do convidado
  @IsString()
  guestId?: string;
}