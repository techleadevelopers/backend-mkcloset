import { IsOptional, IsString, IsEmail, IsPhoneNumber } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

// PartialType torna todas as propriedades de CreateUserDto opcionais
export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  // Não inclua a validação de MinLength aqui para permitir atualizações parciais de outros campos
  password?: string;

  @IsOptional()
  @IsPhoneNumber('BR')
  phone?: string;
}