import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { InstagramService } from './instagram.service';
import { ConfigService } from '../config/config.service';

@Controller('auth/facebook')
export class FacebookAuthController {
  constructor(
    private readonly instagramService: InstagramService,
    private readonly configService: ConfigService,
  ) {}

  @Get('callback')
  async handleCallback(
    @Query('code') code: string,
    @Res() res: Response,
    @Query('shopSlug') shopSlug?: string,
    @Query('state') state?: string,
  ) {
    if (!code) {
      throw new BadRequestException('Código do Facebook é obrigatório.');
    }

    const targetSlug = shopSlug ?? state;
    await this.instagramService.exchangeFacebookCode(code, targetSlug);

    const safeFrontend = this.configService.frontendUrl.replace(/\/$/, '');
    const redirectUrn = safeFrontend ? `${safeFrontend}/admin` : '/admin';

    return res.redirect(redirectUrn);
  }
}
