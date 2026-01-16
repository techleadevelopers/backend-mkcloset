import { IsInt, Min } from 'class-validator';

export class UpdateCartItemDto {
  @IsInt()
  @Min(0) // Permite 0 para remover o item
  quantity: number;
}