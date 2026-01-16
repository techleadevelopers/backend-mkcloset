// No contexto do Prisma, o estoque é uma propriedade do Product.
// Você pode criar uma entidade aqui se quiser um objeto de retorno específico para estoque.

export class StockEntity {
  productId: string;
  stock: number;

  constructor(productId: string, stock: number) {
    this.productId = productId;
    this.stock = stock;
  }
}