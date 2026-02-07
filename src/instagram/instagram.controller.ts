import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { InstagramService } from './instagram.service';
import { ExchangeCodeDto } from './dto/exchange-code.dto';

@Controller('instagram')
export class InstagramController {
  constructor(private readonly instagramService: InstagramService) {}

  @Post('token')
  async exchangeCode(@Body() exchangeCodeDto: ExchangeCodeDto) {
    return this.instagramService.exchangeFacebookCode(
      exchangeCodeDto.code,
      exchangeCodeDto.shopSlug,
    );
  }

  @Get('feed')
  async getFeed(@Query('shopSlug') shopSlug?: string) {
    const media = await this.instagramService.getLatestMedia(shopSlug);
    return { data: media };
  }
}
