// src/users/entities/user.entity.ts

import { User as PrismaUser, Role } from '@prisma/client'; // ADICIONADO: Importe 'Role'

export class UserEntity implements PrismaUser {
  id: string;
  email: string;
  password: string; // Cuidado ao expor a senha! Remova em DTOs de saída.
  name: string | null;
  phone: string | null;
  cpf: string | null; // ADICIONADO: Propriedade 'cpf' para corresponder ao schema.prisma
  createdAt: Date;
  updatedAt: Date;
  role: Role; // CORREÇÃO: Adicionada a propriedade 'role'

  // Construtor para transformar dados (opcional, mas útil)
  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}