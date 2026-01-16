# --- Estágio 1: Build (Ambiente de desenvolvimento) ---
# Usa uma imagem Node.js completa para construir a aplicação.
FROM node:22-alpine AS build

# Define o diretório de trabalho dentro do container.
# O Docker vai copiar o conteúdo da pasta 'backend' para '/app'.
WORKDIR /app

# Copia os arquivos de configuração de dependência (package.json e package-lock.json).
COPY package*.json ./
# Instala todas as dependências do projeto.
RUN npm install

# Copia o restante do código da sua pasta 'backend' para o container.
COPY . .

# Roda o gerador do Prisma.
RUN npx prisma generate

# Compila o projeto NestJS para JavaScript. O resultado estará na pasta 'dist'.
RUN npm run build


# --- Estágio 2: Produção (Imagem otimizada) ---
# Usa uma imagem base mais leve para a produção.
FROM node:22-alpine AS production

# Define o diretório de trabalho.
WORKDIR /app

# Copia apenas os arquivos essenciais do estágio de 'build'.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Copia os arquivos necessários do Prisma para a imagem final.
COPY --from=build /app/node_modules/.prisma/client ./node_modules/.prisma/client
COPY --from=build /app/prisma/schema.prisma ./prisma/schema.prisma

# Adiciona o package.json para que o npm possa ser usado no segundo estágio (se necessário)
COPY --from=build /app/package.json ./package.json

# Define a variável de ambiente PORT. O Cloud Run espera a porta 8080.
ENV PORT 8080 
EXPOSE 8080

# Comando para iniciar a aplicação diretamente a partir do caminho correto.
# O arquivo main.js está na pasta 'src' dentro de 'dist'.
CMD ["node", "dist/src/main.js"]