import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { Role, User } from '@prisma/client';
import { NotificationsService } from 'src/notifications/notifications.service';

const OWNER_ADMIN_EMAIL = 'maiara.mkcloset@gmail.com';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  private normalizeEmail(email?: string | null) {
    return email?.trim().toLowerCase() || '';
  }

  private shouldBeAdmin(email?: string | null) {
    return this.normalizeEmail(email) === OWNER_ADMIN_EMAIL;
  }

  async ensureOwnerAdminRole(user: User): Promise<User> {
    if (!this.shouldBeAdmin(user.email) || user.role === Role.ADMIN) {
      return user;
    }

    return this.prisma.user.update({
      where: { id: user.id },
      data: { role: Role.ADMIN },
    });
  }

  async create(createUserDto: CreateUserDto) {
    const role = this.shouldBeAdmin(createUserDto.email) ? Role.ADMIN : undefined;
    const newUser = await this.prisma.user.create({
      data: {
        ...createUserDto,
        ...(role ? { role } : {}),
      },
    });

    try {
      await this.notificationsService.sendWelcomeEmail(
        newUser.email,
        newUser.name || '',
      );
    } catch (emailError) {
      const errorMessage =
        emailError instanceof Error ? emailError.message : String(emailError);
      this.notificationsService.logger.error(
        `Falha ao enviar e-mail de boas-vindas para ${newUser.email}: ${errorMessage}`,
      );
    }

    return newUser;
  }

  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    return this.ensureOwnerAdminRole(user);
  }

  async findOne(id: string): Promise<Omit<User, 'password'>> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuário com ID "${id}" não encontrado.`);
    }
    const { password, ...result } = await this.ensureOwnerAdminRole(user);
    return result;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id },
      data: updateUserDto,
    });
    const normalized = await this.ensureOwnerAdminRole(user);
    const { password, ...result } = normalized;
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
        userId,
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
