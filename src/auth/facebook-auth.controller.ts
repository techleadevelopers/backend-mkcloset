import {
  BadRequestException,
  Controller,
  Get,
  Query,
} from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from 'src/config/config.service';
import { PrismaService } from 'src/prisma/prisma.service';

type TokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

type AccountsResponse = {
  data: Array<{
    id: string;
    name: string;
    instagram_business_account?: {
      id: string;
      username?: string;
    };
  }>;
};

@Controller('auth/facebook')
export class FacebookAuthController {
  private readonly graphBaseUrl = 'https://graph.facebook.com/v19.0';

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('callback')
  async handleCallback(
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
    @Query('error_description') errorDescription?: string,
  ) {
    if (error) {
      throw new BadRequestException(
        errorDescription || 'Login do Facebook/Instagram cancelado.',
      );
    }

    if (!code) {
      throw new BadRequestException('Parâmetro "code" é obrigatório.');
    }

    const shopSlug = state || this.configService.defaultShopSlug;
    const redirectUri = this.configService.facebookRedirectUri;
    const clientId = this.configService.facebookAppId;
    const clientSecret = this.configService.facebookAppSecret;

    // 1) Troca code por access token de curta duração
    const shortToken = await this.exchangeCodeForShortToken(
      code,
      clientId,
      clientSecret,
      redirectUri,
    );

    // 2) Troca por token de longa duração (≈60 dias)
    const longToken = await this.exchangeForLongLivedToken(
      shortToken.access_token,
      clientId,
      clientSecret,
    );

    // 3) Busca a conta de Instagram Business vinculada a uma Página
    const accounts = await this.fetchUserPagesWithInstagram(longToken.access_token);
    const match = accounts.data.find(
      (page) => page.instagram_business_account?.id,
    );

    if (!match || !match.instagram_business_account?.id) {
      throw new BadRequestException(
        'Nenhuma conta do Instagram Business foi encontrada nas páginas vinculadas.',
      );
    }

    const expiresAt = longToken.expires_in
      ? new Date(Date.now() + longToken.expires_in * 1000)
      : undefined;

    const integration = await this.prisma.instagramIntegration.upsert({
      where: { shopSlug },
      update: {
        accessToken: longToken.access_token,
        tokenType: longToken.token_type,
        scope:
          'instagram_basic,instagram_manage_comments,instagram_manage_insights,instagram_manage_messages',
        expiresAt,
        facebookPageId: match.id,
        facebookPageName: match.name,
        instagramBusinessAccountId: match.instagram_business_account.id,
      },
      create: {
        shopSlug,
        accessToken: longToken.access_token,
        tokenType: longToken.token_type,
        scope:
          'instagram_basic,instagram_manage_comments,instagram_manage_insights,instagram_manage_messages',
        expiresAt,
        facebookPageId: match.id,
        facebookPageName: match.name,
        instagramBusinessAccountId: match.instagram_business_account.id,
      },
    });

    return {
      shopSlug: integration.shopSlug,
      instagramBusinessAccountId: integration.instagramBusinessAccountId,
      facebookPageId: integration.facebookPageId,
      facebookPageName: integration.facebookPageName,
      expiresAt: integration.expiresAt,
    };
  }

  private async exchangeCodeForShortToken(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ): Promise<TokenResponse> {
    const url = `${this.graphBaseUrl}/oauth/access_token`;
    const response = await axios.get<TokenResponse>(url, {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      },
    });
    return response.data;
  }

  private async exchangeForLongLivedToken(
    shortToken: string,
    clientId: string,
    clientSecret: string,
  ): Promise<TokenResponse> {
    const url = `${this.graphBaseUrl}/oauth/access_token`;
    const response = await axios.get<TokenResponse>(url, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: clientId,
        client_secret: clientSecret,
        fb_exchange_token: shortToken,
      },
    });
    return response.data;
  }

  private async fetchUserPagesWithInstagram(
    accessToken: string,
  ): Promise<AccountsResponse> {
    const url = `${this.graphBaseUrl}/me/accounts`;
    const response = await axios.get<AccountsResponse>(url, {
      params: {
        fields: 'id,name,instagram_business_account{id,username}',
        access_token: accessToken,
      },
    });
    return response.data;
  }
}
