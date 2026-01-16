import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHello(): string {
    return 'Bem vindo mmkcloset API';
  }

  @Get('health')
  @HttpCode(HttpStatus.OK)
  getHealth(): { status: string } {
    return { status: 'ok' };
  }
}