// src/common/guards/optional-jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  /**
   * Sobrescreve o método handleRequest do AuthGuard.
   * Este método é chamado após a estratégia Passport ('jwt' neste caso) ser executada.
   *
   * @param err Qualquer erro lançado pela estratégia (ex: token inválido, expirado).
   * @param user O objeto de usuário retornado pela estratégia se a autenticação for bem-sucedida.
   * @param info Informações adicionais da estratégia.
   * @param context O contexto de execução (ExecutionContext).
   * @returns O objeto de usuário se autenticado, ou null/undefined se não houver token ou for inválido,
   *          permitindo que a requisição prossiga sem lançar um erro 401.
   */
  handleRequest(err, user, info, context) {
    // Se houver um erro (por exemplo, token malformado, expirado, ou inválido),
    // ou se a estratégia não encontrar um usuário (token ausente ou não validado),
    // não lançamos um erro 401 (Unauthorized) aqui.
    // Em vez disso, simplesmente retornamos 'null' para o objeto de usuário.
    // Isso permite que a rota prossiga e o controlador possa verificar se 'req.user' é nulo.
    if (err) {
      // Opcional: Você pode logar o erro para fins de depuração,
      // mas é importante não relançá-lo para manter o comportamento opcional do guarda.
      console.warn('OptionalJwtAuthGuard: Erro na validação do token (não fatal, requisição prossegue):', err);
      return null;
    }

    // Se não houver erro, retornamos o objeto 'user' que foi retornado pela estratégia Passport.
    // Se nenhum token foi fornecido, 'user' será 'false' ou 'undefined' (dependendo da sua estratégia JWT),
    // o que é o comportamento esperado para um guarda opcional.
    // Se um token válido foi fornecido, 'user' será o objeto de usuário autenticado.
    return user;
  }
}