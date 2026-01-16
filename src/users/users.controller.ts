import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { User } from '@prisma/client'; // Importa o tipo User do Prisma

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Rota para criar usuário (geralmente via registro)
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  // Obter perfil do usuário logado
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser() user: User) {
    // CORRIGIDO: Chamando findOne em vez de findById
    return this.usersService.findOne(user.id);
  }

  // Atualizar perfil do usuário logado
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateProfile(@CurrentUser() user: User, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(user.id, updateUserDto);
  }

  // Gerenciar endereços do usuário logado
  @UseGuards(JwtAuthGuard)
  @Post('me/addresses')
  addAddress(@CurrentUser() user: User, @Body() createAddressDto: CreateAddressDto) {
    return this.usersService.addAddress(user.id, createAddressDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/addresses')
  getAddresses(@CurrentUser() user: User) {
    return this.usersService.findAddressesByUserId(user.id);
  }

  // Rotas de CRUD para admin (opcional)
  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.usersService.findOne(id); // Se você reativar, use findOne
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.usersService.remove(id);
  // }
}