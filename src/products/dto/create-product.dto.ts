import { IsNotEmpty, IsString, IsNumber, IsOptional, IsUrl, IsArray, ArrayMinSize, IsInt, Min, IsJSON, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer'; // Importado class-transformer

class DimensionsDto {
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

export class CreateProductDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  originalPrice?: number;

  @IsNotEmpty()
  @IsUrl()
  imageUrl: string;

  @IsNotEmpty()
  @IsString()
  categoryId: string; // ID da categoria

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sizes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  colors?: string[];

  @IsOptional()
  isNew?: boolean;

  @IsOptional()
  isFeatured?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  discount?: number;

  @IsInt()
  @Min(0)
  stock: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number; // Peso em kg

  @IsOptional()
  @ValidateNested()
  @Type(() => DimensionsDto)
  dimensions?: DimensionsDto; // Dimensões em cm
}