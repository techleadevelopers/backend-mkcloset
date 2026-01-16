// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as process from 'process';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    // 1. Adicione esta linha para definir o prefixo global da API
    app.setGlobalPrefix('api');

    const configService = app.get(ConfigService);
    const allowedOrigins = [
      'http://localhost:5173',
      'https://e1688003a97e.ngrok-free.app',
      'https://www.bymkcloset.com.br'
    ];

    app.enableCors({
      origin: (origin, callback) => {
        if (!origin) {
          return callback(null, true);
        }
        if (allowedOrigins.indexOf(origin) === -1) {
          const msg = `A política CORS para este site não permite acesso da origem especificada: ${origin}.`;
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
      .setDescription('Documentação da API da Mkcloset')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);

    // 2. Alinhe a documentação do Swagger para a raiz do prefixo global
    // Isso fará com que ela seja acessível em /api
    SwaggerModule.setup('', app, document);

    const port = configService.get<number>('PORT') || 3001;
    await app.listen(port, '0.0.0.0');

    console.log(`Aplicação iniciada com sucesso. Acesse: ${await app.getUrl()}`);
  } catch (error) {
    console.error('Erro fatal durante a inicialização da aplicação:', error);
    process.exit(1);
  }
}

bootstrap();