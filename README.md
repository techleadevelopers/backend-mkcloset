# MK Closet Backend

API monolítica em NestJS para e-commerce, responsável por catálogo, autenticação, carrinho, checkout, pedidos, pagamentos, frete, notificações e administração.

## Stack

- Node.js 22
- NestJS 11
- Prisma 6
- PostgreSQL
- PagBank/PagSeguro (`orders`, `pix`, `checkout`, `public-keys`)
- Nodemailer

## Responsabilidades

- autenticação JWT e login local
- usuários e endereços
- categorias e produtos
- carrinho de usuário logado e visitante
- wishlist
- cálculo de frete
- criação e rastreio de pedidos
- pagamentos PIX, cartão e redirecionamento PagBank
- webhooks de pagamento
- e-mails transacionais
- antifraude
- rotas administrativas

## Estrutura

```text
src/
  admin/            painel administrativo e reembolsos
  antifraud/        integração antifraude
  auth/             login, JWT, guards, estratégias
  cart/             carrinho logado e visitante
  categories/       catálogo de categorias
  common/           decorators, guards, interceptors
  config/           facade tipada para env vars
  inventory/        ajustes de estoque
  notifications/    e-mails transacionais
  orders/           criação e consulta de pedidos
  payments/         intents, PIX, cartão, webhook, refunds
  prisma/           acesso ao banco
  products/         catálogo de produtos
  shipping/         cálculo de frete
  users/            usuários e endereços
  wishlist/         favoritos
```

## Arquitetura

- `AppModule` agrega os módulos de domínio e infraestrutura.
- `PrismaService` centraliza acesso ao banco.
- `ConfigService` em `src/config` encapsula as variáveis de ambiente usadas pelo projeto.
- `main.ts` aplica:
  - prefixo global `/api`
  - `ValidationPipe` com `whitelist` e `forbidNonWhitelisted`
  - CORS restrito por origem
  - `rawBody` para validação de webhook
  - Swagger opcional em `/api/docs`
- o backend também serve o build do frontend quando a pasta `client/dist` existe.

## Modelo de dados

Entidades principais no Prisma:

- `User`
- `Address`
- `Category`
- `Product`
- `Cart`
- `CartItem`
- `Wishlist`
- `WishlistItem`
- `Order`
- `OrderItem`
- `Transaction`
- `Coupon`
- `PaymentIntent`
- `InstagramIntegration`

Enums principais:

- `OrderStatus`
- `TransactionType`
- `PaymentGateway`
- `PaymentIntentStatus`
- `Role`

### PaymentIntent

`PaymentIntent` é a entidade central do fluxo de pagamento. Ela guarda o estado interno de uma tentativa de cobrança e evita duplicidade por pedido/gateway.

Campos relevantes:

- `gateway`
- `status`
- `externalOrderId`
- `externalChargeId`
- `transactionRef`
- `qrCodeText`
- `qrCodeUrl`
- `expiresAt`
- `lastWebhookPayload`

## Fluxos principais

## Autenticação

- JWT com `passport-jwt`
- login local com `passport-local`
- guards para usuário autenticado, papel e autenticação opcional

## Carrinho visitante

- visitante usa `guestId`
- integridade é reforçada com `x-guest-signature`
- backend rejeita payloads com campos não permitidos

## Checkout

1. frontend cria pedido em `/api/orders`
2. backend valida carrinho, recalcula frete e cria `Order`
3. para PIX/cartão/redirecionamento, o módulo `payments` cria ou reutiliza `PaymentIntent`
4. `Transaction` é sincronizada a partir do `PaymentIntent`
5. webhook atualiza `PaymentIntent`, `Transaction` e `Order`

## PIX

Fluxo esperado:

1. `POST /api/payments/pix-charge/:orderId`
2. backend monta payload do PagBank
3. `PagSeguroService` chama `POST /orders`
4. resposta do PagBank alimenta:
   - `PaymentIntent.qrCodeText`
   - `PaymentIntent.qrCodeUrl`
   - `PaymentIntent.externalOrderId`
5. frontend renderiza QR Code e código copia-e-cola

Detalhes importantes:

- o backend aceita links do PagBank com `QR_CODE_IMAGE` e `QRCODE.PNG`
- se o `PaymentIntent` já existir mas estiver incompleto, o serviço pode reconsultar `getOrderDetails()` para preencher QR
- `orders.service` anexa `qrCodeImage` e `brCode` nas consultas de pedido para consumo do frontend

## Cartão

- frontend gera `public key` e tokeniza cartão
- backend chama o fluxo de cobrança direta
- antifraude roda antes do disparo para o gateway

## Redirect checkout

- backend gera checkout hospedado no PagBank
- webhook atualiza status local

## Variáveis de ambiente

Obrigatórias ou praticamente obrigatórias para produção:

```env
DATABASE_URL=
JWT_SECRET=
JWT_EXPIRES_IN=1h

BACKEND_URL=
FRONTEND_URL=
PORT=3001
SWAGGER_ENABLED=false

PAGSEGURO_API_URL=https://sandbox.api.pagseguro.com
PAGSEGURO_API_TOKEN=
PAGSEGURO_WEBHOOK_SECRET=

GUEST_SIGNING_SECRET=

EMAIL_SERVICE_HOST=
EMAIL_SERVICE_PORT=587
EMAIL_SERVICE_USER=
EMAIL_SERVICE_PASS=
EMAIL_SERVICE_FROM=

ANTIFRAUD_API_URL=
ANTIFRAUD_API_KEY=
```

Variáveis auxiliares ou opcionais conforme módulos habilitados:

```env
CORREIOS_API_URL=
SHOP_SLUG=mkcloset

FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_REDIRECT_URI=
```

## Ambientes PagBank

Sandbox:

```env
PAGSEGURO_API_URL=https://sandbox.api.pagseguro.com
```

Produção:

```env
PAGSEGURO_API_URL=https://api.pagseguro.com
```

Observações operacionais:

- `public key` de produção não substitui `PAGSEGURO_API_TOKEN`
- PIX em produção pode exigir whitelist/liberação do PagBank
- QR de sandbox pode não ser pagável por app bancário real
- a conta PagBank precisa de chave Pix cadastrada

## Instalação

```bash
npm install
```

## Desenvolvimento

```bash
npm run start:dev
```

API local padrão:

```text
http://localhost:3001/api
```

Swagger, se habilitado:

```text
http://localhost:3001/api/docs
```

## Build

```bash
npm run build
```

## Produção

```bash
npm run start:prod
```

## Prisma

Gerar client:

```bash
npx prisma generate
```

Aplicar migrations em desenvolvimento:

```bash
npx prisma migrate dev
```

Abrir studio:

```bash
npx prisma studio
```

Seed:

```bash
npx prisma db seed
```

## Docker

O `Dockerfile`:

- usa `node:22-alpine`
- instala dependências completas
- executa `prisma generate`
- executa `npm run build`
- inicia `dist/src/main.js`

Build local:

```bash
docker build -t mkcloset-backend .
```

## Endpoints principais

Autenticação:

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/profile`

Usuários:

- `GET /api/users/me`
- `GET /api/users/me/addresses`

Catálogo:

- `GET /api/categories`
- `GET /api/products`
- `GET /api/products/featured`
- `GET /api/products/:id`

Carrinho:

- `GET /api/cart`
- `GET /api/cart/guest`
- `POST /api/cart/items`
- `PATCH /api/cart/items/:itemId`
- `DELETE /api/cart/items/:itemId`

Pedidos:

- `POST /api/orders`
- `GET /api/orders/:id`
- `GET /api/orders/track/:orderId`

Pagamentos:

- `POST /api/payments/pix-charge/:orderId`
- `POST /api/payments/process-card/:orderId`
- `POST /api/payments/initiate-checkout/:orderId`
- `POST /api/payments/webhook/pagseguro`
- `GET /api/payments/card/public-key`

Admin:

- rotas protegidas em `/api/admin`

## Segurança

- JWT para usuário autenticado
- assinatura HMAC para `guestId`
- validação de payload com `class-validator`
- webhook do PagBank validado com HMAC e `rawBody`
- CORS com allowlist

## Observabilidade

O projeto usa `Logger` do Nest nos serviços críticos, especialmente:

- pagamentos
- antifraude
- notificações
- webhooks

Pontos recomendados para acompanhar em produção:

- falhas em `POST /payments/pix-charge/:orderId`
- `ACCESS_DENIED` / whitelist no PagBank
- inconsistência entre `PaymentIntent`, `Transaction` e `Order`
- erros de CORS
- falhas de SMTP

## Troubleshooting

## PIX gera 500

Verificar:

- `PAGSEGURO_API_URL`
- `PAGSEGURO_API_TOKEN`
- `PAGSEGURO_WEBHOOK_SECRET`
- `BACKEND_URL`
- existência da tabela `PaymentIntent`
- enums `PaymentGateway` e `PaymentIntentStatus`

## QR aparece vazio

Verificar:

- resposta de `POST /api/payments/pix-charge/:orderId`
- se `qrCodeImage` e `brCode` vieram no JSON
- se `PaymentIntent.qrCodeUrl` e `PaymentIntent.qrCodeText` foram persistidos
- se `/api/orders/:id` ou `/api/orders/track/:id` retornam `qrCodeImage` e `brCode`

## Produção responde `whitelist access required`

Isso não é bug do código. Indica bloqueio do PagBank para a API de produção. Solicitar liberação da conta/whitelist ao suporte.

## Build falha no CI

Rodar localmente:

```bash
npm run build
```

Se falhar, corrigir primeiro TypeScript e Prisma antes de redeployar.

## Convenções

- rotas públicas e privadas compartilham o prefixo `/api`
- convidado usa `guestId` e `x-guest-signature`
- dados monetários usam `Decimal` no Prisma
- `Order` é a fonte de verdade do pedido
- `PaymentIntent` é a fonte de verdade do estado de pagamento
- `Transaction` representa a visão financeira/auditável

## Estado atual conhecido

- o backend já suporta fluxo visitante e logado
- o QR do PIX depende da resposta do PagBank e da persistência em `PaymentIntent`
- em produção PagBank pode exigir whitelist adicional mesmo com token e public key válidos
