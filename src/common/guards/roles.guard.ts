// src/common/guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator'; // Importe a chave

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  // CORREÇÃO: A assinatura correta é canActivate(context: ExecutionContext)
  canActivate(context: ExecutionContext): boolean {
    // Obtém os papéis necessários da rota usando o Reflector
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Se nenhum papel for especificado na rota, permite o acesso (ou defina sua lógica padrão)
    if (!requiredRoles) {
      return true;
    }

    // Obtém o usuário da requisição (assumindo que o JwtAuthGuard já injetou o usuário)
    const { user } = context.switchToHttp().getRequest();

    // Verifica se o usuário possui algum dos papéis necessários
    // Assumindo que o objeto user tem uma propriedade 'role' (ex: user.role: Role)
    // Se o usuário puder ter múltiplos papéis, 'user.roles: Role[]', ajuste a lógica.
    // Certifique-se de que 'user' e 'user.role' não sejam undefined/null antes de acessar.
    // Uma verificação mais robusta poderia ser:
    // if (!user || !user.role) {
    //   return false;
    // }
    return requiredRoles.some((role) => user.role === role);
  }
}