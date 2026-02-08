// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as process from 'process';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });
    const distPath = join(__dirname, '..', '..', 'client', 'dist');
    app.useStaticAssets(distPath);
    const server = app.getHttpAdapter().getInstance();
    server.get(/^(?!\/api).*/, (req, res, next) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(join(distPath, 'index.html'));
      } else {
        next();
      }
    });

    // 1. Adicione esta linha para definir o prefixo global da API
    app.setGlobalPrefix('api');

    const configService = app.get(ConfigService);
    const frontendUrl = configService.get<string>('FRONTEND_URL');
    const viteApiUrl = configService.get<string>('VITE_API_URL');
    const allowedOrigins = new Set(
      [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5173',
        'https://mk-closet-pdhq9mbtd-d3v-techle4ds-projects.vercel.app',
        'http://127.0.0.1:5174',
        'https://e1688003a97e.ngrok-free.app',
        'https://www.bymkcloset.com.br',
        'https://mk-closet-q5qyrp10e-d3v-techle4ds-projects.vercel.app',
        frontendUrl,
        viteApiUrl,
      ].filter(Boolean) as string[],
    );

    app.enableCors({
      origin: (origin, callback) => {
        if (!origin) {
          return callback(null, true);
        }
        if (!allowedOrigins.has(origin)) {
          if (
            origin.startsWith('http://localhost:') ||
            origin.startsWith('http://127.0.0.1:')
          ) {
            return callback(null, true);
          }
          const msg = `A pol�tica CORS para este site n�o permite acesso da origem especificada: ${origin}.`;
          return callback(new Error(msg), false);
        }
        return callback(null, true);
      },
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      credentials: true,
    });

    app.use(
      json({
        verify: (req: any, res, buf) => {
          req.rawBody = buf;
        },
      }),
    );

    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    const swaggerConfig = new DocumentBuilder()
      .setTitle('API Mkcloset')
      .setDescription('Documenta��o da API da Mkcloset')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);

    // 2. Alinhe a documenta��o do Swagger para a raiz do prefixo global
    // Isso far� com que ela seja acess�vel em /api
    SwaggerModule.setup('', app, document);

    const port = configService.get<number>('PORT') || 3001;
    await app.listen(port, '0.0.0.0');

    console.log(
      `Aplica��o iniciada com sucesso. Acesse: ${await app.getUrl()}`,
    );
  } catch (error) {
    console.error('Erro fatal durante a inicializa��o da aplica��o:', error);
    process.exit(1);
  }
}

bootstrap();
