// src/users/users.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { Prisma, User } from '@prisma/client';
import { NotificationsService } from 'src/notifications/notifications.service'; // NOVO: Importe o serviço de notificações

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService, // NOVO: Injete o serviço de notificações
  ) {}

  async create(createUserDto: CreateUserDto) {
    const newUser = await this.prisma.user.create({ data: createUserDto });

    // NOVO: Enviar e-mail de boas-vindas
    try {
        // CORREÇÃO AQUI: Garante que newUser.name seja uma string, usando '' como fallback se for null/undefined
        await this.notificationsService.sendWelcomeEmail(newUser.email, newUser.name || '');
    } catch (emailError) {
        // Certifique-se de que emailError.message existe antes de acessá-lo.
        // Se emailError for um tipo 'unknown', você pode precisar de uma verificação de tipo mais robusta.
        const errorMessage = emailError instanceof Error ? emailError.message : String(emailError);
        this.notificationsService.logger.error(`Falha ao enviar e-mail de boas-vindas para ${newUser.email}: ${errorMessage}`);
        // Não relança o erro para não impedir a criação do usuário
    }

    return newUser;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  // O método findById foi renomeado para findOne
  async findOne(id: string): Promise<Omit<User, 'password'>> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuário com ID "${id}" não encontrado.`);
    }
    const { password, ...result } = user; // Remove a senha antes de retornar
    return result;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id },
      data: updateUserDto,
    });
    const { password, ...result } = user;
    return result;
  }

  async remove(id: string) {
    return this.prisma.user.delete({ where: { id } });
  }

  async addAddress(userId: string, createAddressDto: CreateAddressDto) {
    await this.findOne(userId);

    return this.prisma.address.create({
      data: {
        ...createAddressDto,
        userId: userId,
      },
    });
  }

  async findAddressesByUserId(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }
}