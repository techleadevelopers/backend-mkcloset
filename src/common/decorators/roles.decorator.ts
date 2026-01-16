// src/common/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client'; // Importe o enum Role do Prisma

/**
 * Chave de metadados usada para armazenar os papéis necessários.
 */
export const ROLES_KEY = 'roles';

/**
 * Decorator para especificar os papéis permitidos para acessar uma rota ou controlador.
 *
 * Exemplo de uso:
 * @Roles(Role.ADMIN, Role.MANAGER)
 * @Get('admin-only')
 * async getAdminData() { ... }
 *
 * @param roles Uma lista de papéis (do enum Role) que têm permissão para acessar o recurso.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);