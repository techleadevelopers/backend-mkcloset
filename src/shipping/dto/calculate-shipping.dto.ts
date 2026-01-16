import { IsNotEmpty, IsString, IsArray, ValidateNested, IsNumber, Min, IsOptional, IsInt } from 'class-validator'; // Adicionado IsInt
import { Type } from 'class-transformer'; // Importado class-transformer

class ProductDimensionsDto {
  @IsNumber()
  @Min(0)
  length: number;

  @IsNumber()
  @Min(0)
  width: number;

  @IsNumber()
  @Min(0)
  height: number;
}

export class ProductForShippingDto {
  @IsNotEmpty()
  @IsString()
  id: string; // ID do produto

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number; // Peso em kg

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductDimensionsDto)
  dimensions?: ProductDimensionsDto; // Dimensões em cm
}

export class CartItemForShipping {
  @IsNotEmpty()
  @IsString()
  id: string; // ID do item no carrinho (não do produto)

  @ValidateNested()
  @Type(() => ProductForShippingDto)
  product: ProductForShippingDto;

  @IsInt() // Corrigido: IsInt importado
  @Min(1)
  quantity: number;
}

export class CalculateShippingDto {
  @IsNotEmpty()
  @IsString()
  zipCode: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemForShipping)
  items: CartItemForShipping[];
}