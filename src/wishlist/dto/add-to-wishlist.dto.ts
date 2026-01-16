import { IsNotEmpty, IsString } from 'class-validator';

export class AddToWishlistDto {
  @IsNotEmpty()
  @IsString()
  productId: string;
}