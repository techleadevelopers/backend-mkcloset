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

    app.setGlobalPrefix('api');

    const configService = app.get(ConfigService);
    const frontendUrl = configService.get<string>('FRONTEND_URL');
    const viteApiUrl = configService.get<string>('VITE_API_URL');
    const allowedOrigins = new Set(
      [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
        'https://www.bymkcloset.com.br',
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

    const swaggerEnabledEnv = configService.get<string>('SWAGGER_ENABLED');
    const swaggerEnabled = swaggerEnabledEnv === 'true';

    if (swaggerEnabled) {
      const swaggerConfig = new DocumentBuilder()
        .setTitle('API Mkcloset')
        .setDescription('Documenta??o da API da Mkcloset')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
      const document = SwaggerModule.createDocument(app, swaggerConfig);

      // Disponibiliza em /api/docs (prefixo global j? aplicado)
      SwaggerModule.setup('docs', app, document);
    }

        const port = configService.get<number>('PORT') || 3001;
    await app.listen(port, '0.0.0.0');

    console.log(
      `Aplicação iniciada com sucesso. Acesse: ${await app.getUrl()}`,
    );
  } catch (error) {
    console.error('Erro fatal durante a inicialização da aplicação:', error);
    process.exit(1);
  }
}

bootstrap();
