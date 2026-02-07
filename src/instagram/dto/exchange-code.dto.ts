import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ExchangeCodeDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsString()
  shopSlug?: string;
}
