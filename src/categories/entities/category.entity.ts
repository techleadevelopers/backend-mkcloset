// src/categories/entities/category.entity.ts
import { Category as PrismaCategory } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class CategoryEntity implements PrismaCategory {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ required: false, nullable: true })
  description: string | null;

  @ApiProperty({ required: false, nullable: true })
  imageUrl: string | null;

  @ApiProperty()
  createdAt: Date;
  
  @ApiProperty()
  updatedAt: Date;

  constructor(partial: Partial<CategoryEntity>) {
    Object.assign(this, partial);
  }
}