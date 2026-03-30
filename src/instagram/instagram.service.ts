import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';

const GRAPH_API_VERSION = 'v24.0';
const FACEBOOK_OAUTH_TOKEN_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`;
const INSTAGRAM_ME_URL = `https://graph.instagram.com/${GRAPH_API_VERSION}/me`;
const INSTAGRAM_MEDIA_BASE_URL = `https://graph.instagram.com/${GRAPH_API_VERSION}`;
const FACEBOOK_ME_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}/me`;
const INSTAGRAM_MEDIA_FIELDS =
  'id,caption,media_url,permalink,media_type,thumbnail_url,timestamp';

export type InstagramMedia = {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url: string;
  permalink: string;
  thumbnail_url?: string;
  timestamp?: string;
};

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async exchangeFacebookCode(code: string, shopSlug?: string) {
    const targetSlug = this.normalizeShopSlug(shopSlug);
    const shortLivedToken = await this.obtainShortLivedToken(code);
    const longLivedTokenResult = await this.exchangeForLongLivedToken(
      shortLivedToken,
    );

    const expiresAt = longLivedTokenResult.expiresIn
      ? new Date(Date.now() + longLivedTokenResult.expiresIn * 1000)
      : undefined;

    const businessContext = await this.fetchInstagramBusinessAccount(
      longLivedTokenResult.accessToken,
    );
    const fbProfile = await this.fetchFacebookProfile(
      longLivedTokenResult.accessToken,
    );

    return this.prisma.instagramIntegration.upsert({
      where: { shopSlug: targetSlug },
      create: {
        shopSlug: targetSlug,
        accessToken: longLivedTokenResult.accessToken,
        tokenType: longLivedTokenResult.tokenType,
        expiresAt,
        facebookPageId: businessContext.pageId,
        facebookPageName: businessContext.pageName ?? fbProfile?.name ?? null,
        instagramBusinessAccountId: businessContext.instagramBusinessAccountId,
      },
      update: {
        accessToken: longLivedTokenResult.accessToken,
        tokenType: longLivedTokenResult.tokenType,
        expiresAt,
        facebookPageId: businessContext.pageId,
        facebookPageName: businessContext.pageName ?? fbProfile?.name ?? null,
        instagramBusinessAccountId: businessContext.instagramBusinessAccountId,
      },
    });
  }

  async getLatestMedia(shopSlug?: string, limit = 12): Promise<InstagramMedia[]> {
    const targetSlug = this.normalizeShopSlug(shopSlug);

    const integration = await this.prisma.instagramIntegration.findUnique({
      where: { shopSlug: targetSlug },
    });

    if (
      !integration ||
      !integration.accessToken ||
      !integration.instagramBusinessAccountId
    ) {
      throw new NotFoundException(
        'Integração com o Instagram precisa ser configurada. Execute o fluxo de autenticação.',
      );
    }

    try {
      const response = await axios.get(
        `${INSTAGRAM_MEDIA_BASE_URL}/${integration.instagramBusinessAccountId}/media`,
        {
          params: {
            fields: INSTAGRAM_MEDIA_FIELDS,
            access_token: integration.accessToken,
            limit,
          },
        },
      );

      if (!Array.isArray(response.data?.data)) {
        throw new BadGatewayException(
          'Resposta inesperada ao buscar mídias no Instagram.',
        );
      }

      return response.data.data.slice(0, limit);
    } catch (error) {
      this.logger.error('Falha ao buscar o feed do Instagram:', error);
      throw new BadGatewayException(
        'Não foi possível carregar o feed do Instagram no momento.',
      );
    }
  }

  private async fetchFacebookProfile(accessToken: string) {
    try {
      const res = await axios.get(FACEBOOK_ME_URL, {
        params: { fields: 'id,name', access_token: accessToken },
      });
      return res.data;
    } catch (error) {
      this.logger.warn('Não foi possível obter perfil do Facebook /me', error);
      return null;
    }
  }

  private async obtainShortLivedToken(code: string) {
    try {
      const response = await axios.get(FACEBOOK_OAUTH_TOKEN_URL, {
        params: {
          client_id: this.configService.facebookAppId,
          redirect_uri: this.configService.facebookRedirectUri,
          client_secret: this.configService.facebookAppSecret,
          code,
        },
      });

      return response.data.access_token;
    } catch (error) {
      this.logger.error('Erro ao obter short-lived token do Facebook:', error);
      throw new BadGatewayException(
        'Não foi possível autorizar o Facebook com o código fornecido.',
      );
    }
  }

  private async exchangeForLongLivedToken(shortToken: string) {
    try {
      const response = await axios.get(FACEBOOK_OAUTH_TOKEN_URL, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: this.configService.facebookAppId,
          client_secret: this.configService.facebookAppSecret,
          fb_exchange_token: shortToken,
        },
      });

      return {
        accessToken: response.data.access_token ?? shortToken,
        tokenType: response.data.token_type ?? null,
        expiresIn: response.data.expires_in ?? null,
      };
    } catch (error) {
      this.logger.warn(
        'Falha ao trocar por token de longa duração, mantendo o short-lived:',
        error,
      );
      return {
        accessToken: shortToken,
        tokenType: null,
        expiresIn: null,
      };
    }
  }

  private async fetchInstagramBusinessAccount(longLivedToken: string) {
    try {
      const response = await axios.get(INSTAGRAM_ME_URL, {
        params: {
          access_token: longLivedToken,
          fields: 'id,username,account_type',
        },
      });

      const profile = response.data;

      if (!profile?.id) {
        throw new BadGatewayException(
          'Não foi possível identificar o ID do Instagram profissional.',
        );
      }

      if (
        profile.account_type &&
        !['BUSINESS', 'CREATOR'].includes(profile.account_type)
      ) {
        this.logger.warn(
          `Conta conectada não é profissional: ${profile.account_type}`,
        );
      }

      return {
        pageId: null,
        pageName: null,
        instagramBusinessAccountId: profile.id,
      };
    } catch (error) {
      this.logger.error(
        'Erro ao buscar a conta do Instagram via Graph API:',
        error,
      );
      throw new BadGatewayException(
        'Não foi possível descobrir a conta do Instagram conectada.',
      );
    }
  }

  private normalizeShopSlug(shopSlug?: string) {
    const candidate =
      (shopSlug ?? this.configService.defaultShopSlug).trim() ||
      this.configService.defaultShopSlug;
    return candidate;
  }
}
