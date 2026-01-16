// src/auth/guards/jwt-auth.guard.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  /**
   * Sobrescreve o método handleRequest do AuthGuard.
   * Este método é chamado após a estratégia Passport ('jwt' neste caso) ser executada.
   *
   * @param err Qualquer erro lançado pela estratégia (ex: token inválido, expirado).
   * @param user O objeto de usuário retornado pela estratégia se a autenticação for bem-sucedida.
   * @param info Informações adicionais da estratégia.
   * @returns O objeto de usuário se autenticado.
   * @throws UnauthorizedException Se a autenticação falhar, lança um erro 401.
   */
  handleRequest(err, user, info) {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }
}
