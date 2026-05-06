import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateHomeContentDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bannerImages?: string[];
}
