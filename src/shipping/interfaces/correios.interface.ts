// Baseado na estrutura de retorno do frontend
export interface ShippingOption {
  service: string;
  serviceName: string;
  price: number;
  deliveryTime: number; // em dias úteis
  error?: string; // Se houver um erro específico para essa opção
}

export interface CorreiosResponse {
  zipCode: string;
  options: ShippingOption[];
  freeShipping: boolean;
  freeShippingThreshold: number;
}

// Exemplo de como seria uma resposta real dos Correios (simplificado)
// export interface CorreiosApiResult {
//   Codigo: string;
//   Valor: string; // "R$ XX,YY"
//   PrazoEntrega: string; // "N" dias
//   ValorSemAdicionais: string;
//   ValorMaoPropria: string;
//   ValorAvisoRecebimento: string;
//   ValorValorDeclarado: string;
//   Erro: string; // Código de erro
//   MsgErro: string; // Mensagem de erro
//   // ... outros campos
// }