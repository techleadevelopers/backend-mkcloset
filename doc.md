Documentação da Arquitetura e Lógica de Backend
Este documento descreve a arquitetura e a lógica de negócio de um sistema de e-commerce construído com NestJS, utilizando Prisma ORM para interação com o banco de dados. A aplicação é modular, com cada módulo encapsulando funcionalidades específicas e interagindo através de serviços e controladores.

1. Visão Geral da Arquitetura
A aplicação segue o padrão de arquitetura de módulos do NestJS, onde cada funcionalidade principal (usuários, produtos, pedidos, pagamentos, etc.) é organizada em seu próprio módulo.

main.ts: Ponto de entrada da aplicação, configura CORS, pipes de validação globais e inicia o servidor.
app.module.ts: Módulo raiz que agrega todos os outros módulos da aplicação.
Módulos de Negócio: Cada módulo (AuthModule, UsersModule, ProductsModule, OrdersModule, PaymentsModule, etc.) contém sua própria lógica de negócio, incluindo:
Controladores (.controller.ts): Responsáveis por lidar com as requisições HTTP, rotear para os serviços apropriados e retornar as respostas.
Serviços (.service.ts): Contêm a lógica de negócio principal, interagem com o banco de dados (via PrismaService) e com outros serviços.
DTOs (.dto.ts): Objetos de Transferência de Dados, usados para validação de entrada de dados e tipagem.
Entidades (.entity.ts): Representações tipadas dos modelos de dados, muitas vezes espelhando os modelos do Prisma.
Módulos de Infraestrutura/Compartilhados:
PrismaModule: Encapsula o PrismaService para acesso ao banco de dados.
ConfigModule: Gerencia as configurações da aplicação (variáveis de ambiente).
CommonModule: Contém componentes compartilhados como guards, interceptors, filters e constantes globais.
2. Módulos e Suas Funcionalidades
2.1. AppModule (app.module.ts, app.controller.ts, app.service.ts)
Propósito: Módulo raiz que orquestra todos os outros módulos da aplicação.
Componentes:
AppController: Define rotas básicas como / (mensagem de boas-vindas) e /health (verificação de saúde da API).
AppService: Contém a lógica para as rotas básicas do AppController.
Dependências: Importa e agrega todos os módulos de funcionalidade do e-commerce.
Funcionalidades Chave: Inicialização da aplicação e rotas de saúde/informação.
2.2. PrismaModule (prisma.module.ts, prisma.service.ts)
Propósito: Gerenciar a conexão com o banco de dados via Prisma ORM.
Componentes:
PrismaService: Estende PrismaClient e gerencia a conexão e desconexão do banco de dados (hooks de ciclo de vida onModuleInit).
Dependências: Nenhum módulo importa o PrismaModule diretamente, mas o PrismaService é exportado para ser injetado em outros serviços.
Funcionalidades Chave:
onModuleInit(): Conecta ao banco de dados quando o módulo é inicializado.
enableShutdownHooks(): Garante que a conexão com o banco de dados seja encerrada graciosamente ao desligar a aplicação.
2.3. ConfigModule (config.module.ts, config.service.ts)
Propósito: Gerenciar e fornecer acesso às variáveis de ambiente e configurações da aplicação de forma tipada.
Componentes:
ConfigService: Um serviço personalizado que envolve o NestConfigService para fornecer acesso a variáveis de ambiente específicas (ex: DATABASE_URL, JWT_SECRET, PAGSEGURO_API_TOKEN).
Dependências: Usa o NestConfigModule do NestJS. É importado globalmente no AppModule e exporta o ConfigService para que outros módulos possam usá-lo.
Funcionalidades Chave: Centraliza o acesso às configurações, garantindo que credenciais sensíveis sejam carregadas corretamente e lançando erros se configurações críticas estiverem ausentes.
2.4. CommonModule (common.module.ts, jwt-auth.guard.ts, current-user.decorator.ts, http-exception.filter.ts, transform.interceptor.ts, app.constants.ts)
Propósito: Agrupar componentes reutilizáveis e globais que afetam a infraestrutura da aplicação (autenticação, tratamento de erros, formatação de resposta).
Componentes:
JwtAuthGuard: Um guard de autenticação que utiliza a estratégia JWT do Passport para proteger rotas.
CurrentUser: Um decorator personalizado para extrair o objeto de usuário autenticado da requisição.
HttpExceptionFilter: Um filtro de exceções global que padroniza as respostas de erro HTTP.
TransformInterceptor: Um interceptor global que envolve as respostas de sucesso em um objeto { data: ... }.
AppConstants: Uma classe que define constantes globais para a aplicação (ex: valores mínimos para cálculo de frete, limite para frete grátis).
Dependências: Importa AuthModule (para JwtAuthGuard). Exporta JwtAuthGuard e AppConstants.
Funcionalidades Chave:
Gerenciamento de autenticação JWT em rotas protegidas.
Injeção do usuário autenticado em parâmetros de controlador.
Tratamento consistente de erros HTTP.
Padronização da estrutura de resposta da API.
Centralização de valores constantes.
2.5. AuthModule (auth.module.ts, auth.controller.ts, auth.service.ts, register-user.dto.ts, login-user.dto.ts, optional-jwt-auth.guard.ts, local-auth.guard.ts, jwt-payload.interface.ts, local.strategy.ts, jwt.strategy.ts)
Propósito: Lidar com a autenticação de usuários (registro, login, validação de token).
Componentes:
AuthController: Define endpoints para registro (/auth/register), login (/auth/login) e obtenção do perfil (/auth/profile).
AuthService: Contém a lógica de negócio para autenticação: hashing de senhas (bcrypt), validação de credenciais, geração de tokens JWT.
RegisterUserDto: DTO para validação de dados de registro de usuário.
LoginUserDto: DTO para validação de dados de login de usuário.
LocalAuthGuard: Guard para autenticação baseada em nome de usuário/senha (estratégia local).
JwtAuthGuard (do CommonModule): Guard para autenticação baseada em token JWT.
OptionalJwtAuthGuard: Uma variação do JwtAuthGuard que não lança erro se o token estiver ausente ou inválido, permitindo rotas que podem ser acessadas por usuários logados ou não.
LocalStrategy: Estratégia do Passport para autenticação local, valida email e senha.
JwtStrategy: Estratégia do Passport para autenticação JWT, valida o token e busca o usuário.
Dependências: Importa UsersModule (para UsersService), PassportModule, JwtModule, ConfigModule. Exporta AuthService e JwtModule.
Funcionalidades Chave:
Registro: Cria um novo usuário com senha hashed.
Login: Valida credenciais e retorna um token JWT.
Proteção de Rotas: Garante que apenas usuários autenticados (ou opcionalmente autenticados) possam acessar certas rotas.
JwtPayload: Interface para a estrutura do payload do token JWT.
2.6. UsersModule (users.module.ts, users.controller.ts, users.service.ts, create-user.dto.ts, update-user.dto.ts, create-address.dto.ts, user.entity.ts)
Propósito: Gerenciar as operações relacionadas a usuários (CRUD, endereços).
Componentes:
UsersController: Define endpoints para criação de usuário (/users), obtenção e atualização do perfil do usuário logado (/users/me), e gerenciamento de endereços (/users/me/addresses).
UsersService: Contém a lógica de negócio para usuários: criação, busca por email/ID, atualização, remoção (comentada), adição e busca de endereços. Remove a senha do objeto de usuário antes de retornar.
CreateUserDto: DTO para criação de usuário.
UpdateUserDto: DTO para atualização parcial de usuário.
CreateAddressDto: DTO para criação de endereço.
UserEntity: Entidade que representa um usuário.
Dependências: Importa PrismaModule. Exporta UsersService para ser usado em outros módulos (ex: AuthModule, OrdersModule).
Funcionalidades Chave:
Criação de novos usuários.
Gestão de perfis de usuário (visualização e edição).
Gerenciamento de múltiplos endereços por usuário.
2.7. CategoriesModule (categories.module.ts, categories.controller.ts, categories.service.ts, create-category.dto.ts, update-category.dto.ts, category.entity.ts)
Propósito: Gerenciar as operações relacionadas a categorias de produtos.
Componentes:
CategoriesController: Define endpoints para CRUD de categorias (/categories).
CategoriesService: Lógica de negócio para categorias: criação, busca (todos/por ID), atualização, remoção.
CreateCategoryDto: DTO para criação de categoria.
UpdateCategoryDto: DTO para atualização parcial de categoria.
CategoryEntity: Entidade que representa uma categoria.
Dependências: Importa PrismaModule. Exporta CategoriesService para ProductsModule.
Funcionalidades Chave:
Criação, listagem, busca por ID, atualização e remoção de categorias.
2.8. ProductsModule (products.module.ts, products.controller.ts, products.service.ts, create-product.dto.ts, update-product.dto.ts, product-query.dto.ts, product.entity.ts)
Propósito: Gerenciar as operações relacionadas a produtos.
Componentes:
ProductsController: Define endpoints para CRUD de produtos (/products), busca de produtos em destaque (/products/featured) e busca com filtros (/products).
ProductsService: Lógica de negócio para produtos: busca (todos com filtros, em destaque, por ID), atualização e remoção. A criação e atualização estão marcadas como "ainda não implementadas" no código fornecido.
CreateProductDto: DTO para criação de produto, incluindo informações como nome, preço, imagem, categoria, estoque, peso e dimensões.
UpdateProductDto: DTO para atualização parcial de produto.
ProductQueryDto: DTO para filtros e paginação em listagens de produtos.
ProductEntity: Entidade que representa um produto, com conversão de tipos Prisma.Decimal para number.
Dependências: Importa PrismaModule e CategoriesModule. Exporta ProductsService para CartModule, OrdersModule, WishlistModule, InventoryModule.
Funcionalidades Chave:
Listagem de produtos com filtros de pesquisa, categoria, cor, tamanho, ordenação e paginação.
Busca de produtos em destaque.
Busca de um produto específico por ID.
Gestão de estoque (embora a atualização seja feita pelo InventoryService).
2.9. CartModule (cart.module.ts, cart.controller.ts, cart.service.ts, add-to-cart.dto.ts, update-cart-item.dto.ts, cart.entity.ts)
Propósito: Gerenciar o carrinho de compras de usuários logados e convidados.
Componentes:
CartController: Define endpoints para obter o carrinho (/cart), adicionar itens (/cart/items), atualizar quantidade de itens (/cart/items/:productId) e remover itens (/cart/items/:productId).
CartService: Lógica de negócio para o carrinho: obter/criar carrinho para usuário/convidado, adicionar/atualizar/remover itens, calcular total e quantidade de itens.
AddToCartDto: DTO para adicionar um produto ao carrinho.
UpdateCartItemDto: DTO para atualizar a quantidade de um item no carrinho.
CartEntity, CartItemEntity: Entidades que representam o carrinho e seus itens.
Dependências: Importa PrismaModule e ProductsModule (para ProductsService). Exporta CartService para OrdersModule.
Funcionalidades Chave:
Criação e recuperação de carrinhos para usuários autenticados e convidados.
Adição de produtos ao carrinho, com validação de estoque e preço.
Atualização da quantidade de itens no carrinho.
Remoção de itens do carrinho.
Cálculo dinâmico do total e contagem de itens no carrinho.
2.10. WishlistModule (wishlist.module.ts, wishlist.controller.ts, wishlist.service.ts, add-to-wishlist.dto.ts, wishlist.entity.ts)
Propósito: Gerenciar a lista de desejos dos usuários.
Componentes:
WishlistController: Define endpoints para obter a lista de desejos (/wishlist), adicionar itens (/wishlist/items) e remover itens (/wishlist/items/:productId).
WishlistService: Lógica de negócio para a lista de desejos: obter/criar lista, adicionar/remover itens, com validação para evitar duplicatas.
AddToWishlistDto: DTO para adicionar um produto à lista de desejos.
WishlistEntity, WishlistItemEntity: Entidades que representam a lista de desejos e seus itens.
Dependências: Importa PrismaModule e ProductsModule (para ProductsService).
Funcionalidades Chave:
Criação e recuperação da lista de desejos para usuários autenticados.
Adição de produtos à lista de desejos, prevenindo duplicação.
Remoção de produtos da lista de desejos.
2.11. OrdersModule (orders.module.ts, orders.controller.ts, orders.service.ts, create-order.dto.ts, order.entity.ts)
Propósito: Gerenciar a criação e visualização de pedidos.
Componentes:
OrdersController: Define endpoints para criar um pedido (/orders), listar todos os pedidos do usuário (/orders) e obter um pedido específico por ID (/orders/:id). Utiliza OptionalJwtAuthGuard para permitir criação de pedidos por convidados e JwtAuthGuard para listagem/visualização de pedidos de usuários logados.
OrdersService: Lógica de negócio para pedidos:
create(): O método mais complexo. Lida com a criação de pedidos para usuários logados e convidados, valida o carrinho, verifica estoque, calcula o valor total, define o endereço de entrega (usando endereço salvo para usuários ou dados do DTO para convidados), e opcionalmente cria uma conta para convidados. Tudo isso é feito dentro de uma transação Prisma para garantir atomicidade.
findAllByUserId(): Lista todos os pedidos de um usuário.
findOneByUserId(): Busca um pedido específico para um usuário.
findOneByGuestId(): Busca um pedido específico para um convidado.
CreateOrderDto: DTO para criação de pedido, incluindo informações de pagamento, frete, e dados de contato/endereço para convidados.
OrderEntity, OrderItemEntity: Entidades que representam o pedido e seus itens.
Dependências: Importa PrismaModule, CartModule, UsersModule, ProductsModule. Exporta OrdersService para PaymentsModule.
Funcionalidades Chave:
Processo de checkout unificado para usuários logados e convidados.
Validação de carrinho e estoque antes da criação do pedido.
Integração com UsersService para endereços e criação de conta.
Atualização do estoque dos produtos após a criação do pedido.
Limpeza do carrinho após a criação bem-sucedida do pedido.
Transações de banco de dados para garantir a integridade dos dados.
2.12. PaymentsModule (payments.module.ts, payments.controller.ts, payments.service.ts, process-payment.dto.ts, create-pix-charge.dto.ts, pagseguro.service.ts)
Propósito: Gerenciar o processamento de pagamentos e a integração com gateways de pagamento (PagSeguro, Stripe - webhook).
Componentes:
PaymentsController: Define endpoints para processar pagamentos (/payments/process/:orderId), iniciar checkout PagSeguro (/payments/pagseguro/:orderId/checkout) e lidar com webhooks do Stripe (/payments/webhook/stripe).
PaymentsService: Lógica de negócio para pagamentos:
processPayment(): Orquestra o processamento de pagamentos para um pedido. Valida o status do pedido, coleta dados do cliente (usuário logado ou convidado), e chama o serviço de gateway de pagamento apropriado (PagSeguro para PIX/Boleto). Cria uma transação no banco de dados e atualiza o status do pedido.
createPagSeguroCheckout(): Prepara e inicia o processo de checkout com PagSeguro (PIX ou Boleto), retornando a URL do QR Code ou Boleto.
handlePagSeguroNotification(): Processa notificações de webhook do PagSeguro, buscando detalhes da transação e atualizando o status do pedido e da transação no banco de dados.
mapPagSeguroStatusToOrderStatus(): Mapeia os status de pagamento do PagSeguro para os status de pedido internos.
PagSeguroService: Serviço dedicado à integração com a API do PagSeguro:
processCreditCardPayment(): Simulação de pagamento com cartão de crédito (foco no PIX).
generatePixPayment(): Gera uma cobrança PIX via API de Pedidos do PagSeguro, retornando o BR Code, imagem do QR Code e ID da transação.
generateBoletoPayment(): Simulação de geração de boleto.
getNotificationDetails(): Busca detalhes de um pedido no PagSeguro para processar webhooks.
ProcessPaymentDto: DTO para processar um pagamento, especificando o método e dados adicionais (CPF, telefone para PIX).
CreatePixChargeDto, PixChargeResponseDto: DTOs relacionados à criação e resposta de cobranças PIX (embora CreatePixChargeDto não seja usado diretamente no PaymentsController ou PaymentsService no código fornecido, ele define a estrutura esperada para uma cobrança PIX).
Dependências: Importa PrismaModule, OrdersModule, ConfigModule.
Funcionalidades Chave:
Integração com PagSeguro para pagamentos PIX e Boleto.
Atualização do status do pedido e criação de transações no banco de dados.
Tratamento de webhooks para atualização assíncrona do status de pagamento.
2.13. ShippingModule (shipping.module.ts, shipping.controller.ts, shipping.service.ts, calculate-shipping.dto.ts, correios.interface.ts)
Propósito: Calcular opções de frete com base no CEP de destino e nos itens do carrinho.
Componentes:
ShippingController: Define um endpoint para calcular o frete (/shipping/calculate).
ShippingService: Lógica de negócio para cálculo de frete:
calculateShipping(): Valida o CEP, simula uma chamada a uma API de CEP (ViaCEP), calcula informações totais do pacote (peso, dimensões, valor) e aplica uma lógica de cálculo de frete regionalizada (simulando Correios) com base no CEP e peso/valor dos itens.
getTotalPackageInfo(): Função auxiliar para agregar peso, valor e dimensões dos itens do carrinho.
CalculateShippingDto: DTO para a requisição de cálculo de frete, incluindo CEP e itens do carrinho com detalhes do produto.
CorreiosResponse, ShippingOption: Interfaces para tipar a resposta do cálculo de frete.
Dependências: Importa ConfigModule e ProductsModule.
Funcionalidades Chave:
Validação de CEP.
Cálculo de frete simulado com base em regras regionais e características do pacote.
Determinação de frete grátis com base em um limite de valor.
2.14. InventoryModule (inventory.module.ts, inventory.controller.ts, inventory.service.ts, update-stock.dto.ts, stock.entity.ts)
Propósito: Gerenciar o estoque de produtos.
Componentes:
InventoryController: Define endpoints para obter o estoque de um produto (/inventory/:productId) e atualizar o estoque (/inventory/:productId/stock). Protegido por JwtAuthGuard.
InventoryService: Lógica de negócio para estoque:
getStock(): Retorna o estoque atual de um produto.
updateStock(): Atualiza o estoque de um produto para uma quantidade específica.
decrementStock(): Decrementa o estoque de um produto (usado pelo OrdersService). Inclui validação de estoque insuficiente.
incrementStock(): Incrementa o estoque de um produto.
UpdateStockDto: DTO para atualizar a quantidade de estoque.
StockEntity: Entidade que representa o estoque de um produto.
Dependências: Importa PrismaModule e ProductsModule (para ProductsService). Exporta InventoryService para ser usado por outros módulos (ex: OrdersModule).
Funcionalidades Chave:
Consulta e atualização do estoque de produtos.
Funções para decrementar e incrementar o estoque de forma segura, com validação de disponibilidade.
3. Fluxos de Negócio Chave
3.1. Autenticação e Autorização
Registro: AuthController.register -> AuthService.register -> UsersService.create. A senha é hashed antes de ser salva.
Login: AuthController.login (via LocalAuthGuard) -> AuthService.validateUser (valida email e senha) -> AuthService.login (gera JWT).
Acesso Protegido: Rotas com @UseGuards(JwtAuthGuard) exigem um token JWT válido no cabeçalho Authorization. O JwtAuthGuard usa o JwtStrategy para validar o token e injetar o objeto de usuário (req.user) na requisição, que pode ser acessado via @CurrentUser decorator.
Acesso Opcional: Rotas com @UseGuards(OptionalJwtAuthGuard) tentam autenticar o usuário, mas permitem que a requisição prossiga mesmo se o token for inválido ou ausente, injetando null no lugar do usuário.
3.2. Gestão de Produtos e Categorias
Criação de Categoria: CategoriesController.create -> CategoriesService.create.
Listagem de Produtos: ProductsController.findAll -> ProductsService.findAll. Permite filtros complexos (busca, categoria, cores, tamanhos) e paginação.
Detalhes do Produto: ProductsController.findOne -> ProductsService.findOne.
Produtos em Destaque: ProductsController.findFeatured -> ProductsService.findFeatured.
3.3. Carrinho de Compras
Adicionar ao Carrinho: CartController.addItem -> CartService.addItemToCart. Lida com usuários logados (userId) ou convidados (guestId). Verifica a existência do produto e o estoque. Se o item já existe, atualiza a quantidade.
Atualizar Quantidade: CartController.updateItemQuantity -> CartService.updateItemQuantity. Permite alterar a quantidade de um item existente ou removê-lo se a quantidade for zero.
Remover do Carrinho: CartController.removeItem -> CartService.removeItemFromCart.
Obter Carrinho: CartController.getCart -> CartService.getCartForUser (para logados) ou CartService.getCartForGuest (para convidados).
3.4. Criação de Pedidos (Checkout)
Início do Pedido: OrdersController.create -> OrdersService.create.
Lógica de OrdersService.create:
Obtenção do Carrinho: Identifica se é um usuário logado ou convidado e recupera o carrinho correspondente.
Validação de Estoque e Preço: Itera sobre os itens do carrinho, verifica a disponibilidade de estoque para cada produto e calcula o totalAmount com base nos preços atuais. Lança exceções se o estoque for insuficiente ou o produto não for encontrado.
Endereço de Entrega:
Para usuários logados: Requer shippingAddressId e busca o endereço salvo.
Para convidados: Requer guestShippingAddress e guestContactInfo no DTO.
Criação de Conta para Convidado (Opcional): Se shouldCreateAccount for true, cria um novo usuário usando UsersService.create e associa o pedido a este novo usuário.
Transação Prisma: Todas as operações (criação do pedido, adição de itens, decremento de estoque, limpeza do carrinho) são encapsuladas em uma transação para garantir que, se qualquer passo falhar, todas as alterações sejam revertidas.
Criação do Pedido e Itens: Persiste o Order e OrderItem no banco de dados.
Decremento de Estoque: Atualiza o estoque de cada produto no banco de dados.
Limpeza do Carrinho: Remove todos os itens do carrinho que deu origem ao pedido.
3.5. Processamento de Pagamentos
Processar Pagamento: PaymentsController.processPayment -> PaymentsService.processPayment.
Lógica de PaymentsService.processPayment:
Obter Pedido: Busca o pedido pelo ID e verifica seu status (PENDING).
Validação de Dados: Para PIX, exige CPF e telefone do cliente.
Dados do Cliente: Extrai email e nome completo do usuário logado (order.user) ou do convidado (order.guestEmail, order.guestName).
Chamar Gateway: Dependendo do paymentMethod (PIX, BOLETO), chama o método correspondente no PagSeguroService.
Criação de Transação e Atualização de Pedido: Em uma transação Prisma, cria um registro de Transaction e atualiza o status do Order para PROCESSING.
Início de Checkout PagSeguro: PaymentsController.createPagSeguroCheckout -> PaymentsService.createPagSeguroCheckout. Prepara os dados do pedido e cliente para o PagSeguro e chama generatePixPayment ou generateBoletoPayment, retornando a URL do QR Code ou Boleto.
Webhook PagSeguro: PaymentsService.handlePagSeguroNotification (chamado por um endpoint de webhook externo, não diretamente no controller fornecido). Busca detalhes da transação no PagSeguro, mapeia o status e atualiza o status da transação e do pedido no banco de dados.
3.6. Cálculo de Frete
Calcular Frete: ShippingController.calculateShipping -> ShippingService.calculateShipping.
Lógica de ShippingService.calculateShipping:
Validação de CEP: Garante que o CEP seja válido (formato e existência via ViaCEP simulado).
Informações do Pacote: Agrega peso, valor e dimensões de todos os itens no carrinho.
Simulação Correios: Aplica regras de preço e prazo de entrega baseadas na região do CEP e nas características do pacote.
Frete Grátis: Verifica se o valor total do pedido atinge o limite para frete grátis (AppConstants.FREE_SHIPPING_THRESHOLD).
3.7. Gestão de Estoque
Obter Estoque: InventoryController.getStock -> InventoryService.getStock.
Atualizar Estoque: InventoryController.updateStock -> InventoryService.updateStock.
Decremento/Incremento (Interno): InventoryService.decrementStock e InventoryService.incrementStock são usados por outros serviços (principalmente OrdersService) para gerenciar o estoque de forma transacional e segura.
4. Interações e Dependências Chave
PrismaService: É a base de dados, injetado em quase todos os serviços para operações de persistência.
ConfigService: Usado por serviços como PagSeguroService e ShippingService para acessar variáveis de ambiente (tokens de API, URLs).
UsersService: Usado por AuthService (registro, validação de usuário) e OrdersService (criação de conta para convidado, busca de endereços).
ProductsService: Fundamental para CartService, WishlistService, OrdersService e InventoryService para obter detalhes de produtos, validar estoque e preços.
CartService: Crucial para OrdersService, que consome o carrinho para criar um pedido.
OrdersService: Consumido por PaymentsService para obter detalhes do pedido antes de processar o pagamento e para atualizar o status do pedido.
PagSeguroService: Injetado em PaymentsService para lidar com a comunicação com o gateway de pagamento.
Transações de Banco de Dados: O uso de this.prisma.$transaction em OrdersService.create e PaymentsService.processPayment é vital para garantir a consistência dos dados em operações que envolvem múltiplas etapas de banco de dados (ex: criar pedido, criar itens, decrementar estoque, limpar carrinho).
5. Considerações para Manutenção
Modularidade: A separação em módulos facilita a compreensão e o isolamento de funcionalidades. Alterações em um módulo tendem a ter impacto limitado em outros, desde que as interfaces (DTOs, retornos de serviço) sejam mantidas.
Validação de Dados (DTOs): O uso extensivo de class-validator e class-transformer em DTOs garante que os dados de entrada da API sejam sempre válidos e tipados, reduzindo erros e facilitando a depuração.
Tratamento de Erros Global (HttpExceptionFilter): Centraliza a forma como os erros são apresentados ao cliente, proporcionando uma experiência de API consistente.
Interceptors (TransformInterceptor): Padroniza a estrutura de resposta da API, facilitando o consumo pelo frontend.
Tipagem Forte: O uso de TypeScript em todo o projeto, incluindo entidades e interfaces, melhora a legibilidade, o autocompletar e a detecção de erros em tempo de desenvolvimento.
Constantes Globais (AppConstants): Centraliza valores mágicos, tornando-os fáceis de encontrar e modificar.
Simulações de Gateway: As simulações para PagSeguro (cartão/boleto) e Correios indicam pontos onde integrações reais com APIs externas seriam implementadas. Para manutenção, estas seriam as primeiras áreas a serem substituídas por implementações reais.
Comentários e Logs: O código contém comentários explicativos e logs (Logger) em pontos estratégicos, o que é crucial para entender o fluxo e depurar problemas em produção.
Esta documentação serve como um guia abrangente para entender a estrutura, o fluxo e a lógica de cada componente do sistema de e-commerce, facilitando a manutenção, a depuração e o desenvolvimento de novas funcionalidades.

Relatório de Integrações e Modificações no Backend NestJS
Este relatório descreve as principais alterações e adições feitas na estrutura do seu projeto NestJS para incluir funcionalidades de administração, controle de acesso baseado em papéis (RBAC), manipulação de rawBody para webhooks e atualizações no esquema do banco de dados.

1. Configuração da Aplicação Principal (src/main.ts)
O arquivo main.ts, que é o ponto de entrada da sua aplicação, foi aprimorado com as seguintes configurações:

Habilitação de CORS: Mantida a configuração para permitir requisições do frontend (http://localhost:5173), essencial para o desenvolvimento. É crucial ajustar origin para o domínio de produção quando a aplicação for para o ambiente real.
Validação Global de DTOs (ValidationPipe): Mantida a configuração do ValidationPipe global. Isso garante que todos os Data Transfer Objects (DTOs) usados nos seus controladores sejam automaticamente validados, transformados e que propriedades não esperadas sejam removidas ou causem erro, aumentando a segurança e robustez da API.
Middleware para rawBody: Esta foi uma adição crucial. Um middleware json do express foi configurado com uma função verify para capturar o rawBody (corpo bruto da requisição). Isso é fundamental para processar webhooks de gateways de pagamento (como PagSeguro, Stripe, etc.) que exigem a verificação da assinatura do payload original para garantir a autenticidade da requisição. Este middleware deve ser aplicado antes de qualquer outro parser de corpo.
2. Módulo Principal da Aplicação (src/app.module.ts)
O módulo raiz AppModule foi atualizado para orquestrar as novas funcionalidades:

ServeStaticModule: Configurado para servir arquivos estáticos, especificamente uploads (como imagens de produtos), através da rota /images.
ConfigModule (NestJS): Mantida a configuração global para carregar e gerenciar variáveis de ambiente.
ConfigModule (Customizado): Mantida a importação do seu módulo de configuração customizado, se ele existir e for usado para configurações específicas da aplicação.
Módulos Existentes: Todos os módulos de funcionalidades principais (Prisma, Auth, Users, Categories, Products, Cart, Wishlist, Orders, Payments, Shipping, Inventory, Common) foram mantidos.
Novos Módulos Integrados:
NotificationsModule: Adicionado para gerenciar o envio de notificações (e-mails, SMS, etc.).
AntifraudModule: Adicionado para integrar com serviços de análise antifraude.
AdminModule: Adicionado para encapsular as funcionalidades de administração da plataforma.
3. Módulo Administrativo (src/admin/)
O AdminModule foi estruturado para centralizar as operações administrativas:

AdminService (Novo):
Foi criado o src/admin/admin.service.ts para conter a lógica de negócios das operações administrativas.
Ele injeta e utiliza outros serviços como RefundsService, AntifraudService, OrdersService e PrismaService para realizar suas tarefas.
Métodos como processRefund, updateTransactionAntifraudStatus e getAllOrdersForAdmin foram definidos para demonstrar as capacidades.
AdminController (Atualizado):
O src/admin/admin.controller.ts foi atualizado para injetar o AdminService e delegar as chamadas de API a ele.
Proteção de Rotas: Todas as rotas do AdminController foram protegidas com JwtAuthGuard (para autenticação) e RolesGuard (para autorização).
@Roles(Role.ADMIN): O decorator @Roles foi aplicado para garantir que apenas usuários com o papel ADMIN possam acessar os endpoints administrativos.
AdminModule (Atualizado):
O src/admin/admin.module.ts foi configurado para importar os módulos necessários (PrismaModule, PaymentsModule, OrdersModule, AntifraudModule) e para fornecer o AdminService e o AdminController.
4. Controle de Acesso Baseado em Papéis (RBAC)
Foi implementado um sistema básico de RBAC:

Roles Decorator (src/common/decorators/roles.decorator.ts):
Criado o decorator @Roles que utiliza SetMetadata para anexar uma lista de papéis permitidos a métodos ou classes de controladores.
Define a constante ROLES_KEY para identificar esses metadados.
RolesGuard (src/common/guards/roles.guard.ts):
Implementado o RolesGuard que, usando o Reflector do NestJS, lê os papéis definidos pelo @Roles decorator na rota.
Compara os papéis requeridos com o papel do usuário autenticado (assumindo que o JwtAuthGuard já anexou o objeto user à requisição).
Garante que apenas usuários com os papéis apropriados possam acessar as rotas protegidas.
5. Atualizações no Esquema do Banco de Dados (schema.prisma)
O arquivo schema.prisma foi significativamente atualizado para suportar as novas funcionalidades e corrigir a omissão do Role enum:

enum Role (NOVO):
Definido o enum Role com valores como USER e ADMIN. Este enum é fundamental para o sistema de RBAC.
Campo role no User (NOVO):
Adicionado o campo role ao modelo User, do tipo Role e com um valor padrão de USER. Isso permite atribuir papéis aos usuários.
antifraudStatus na Transaction (NOVO):
Adicionado o campo antifraudStatus ao modelo Transaction. Este campo do tipo String pode ser usado para armazenar o status da análise antifraude (ex: "PENDING_REVIEW", "ACCEPTED", "DENIED"), permitindo o acompanhamento e a gestão dessas análises.
Campos de Convidado (guestCpf, etc.) e boletoUrl:
Mantidos e confirmados os campos guestCpf no modelo Order e boletoUrl no modelo Transaction, que foram discutidos anteriormente para suportar pedidos de convidados e pagamentos via boleto.
Próximos Passos Essenciais:
Para que todas essas mudanças entrem em vigor no seu ambiente de desenvolvimento e produção:

Executar Migrações do Prisma:

bash

Copiar
npx prisma migrate dev --name add_user_role_and_antifraud_status
Este comando criará e aplicará uma nova migração ao seu banco de dados, adicionando o enum Role, o campo role na tabela User e o campo antifraudStatus na tabela Transaction.

Gerar o Cliente Prisma:

bash

Copiar
npx prisma generate
Isso é crucial para atualizar o cliente Prisma em seu projeto, garantindo que as tipagens TypeScript para os novos campos e enums (especialmente o Role) estejam disponíveis e corretas, resolvendo quaisquer erros de compilação relacionados a tipos não encontrados.

Com essas integrações, sua aplicação NestJS está mais robusta, segura e preparada para gerenciar usuários com diferentes níveis de acesso e lidar com a complexidade de transações financeiras, incluindo aspectos antifraude.