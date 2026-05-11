import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateHomeContentDto } from './dto/update-home-content.dto';

const HOME_CONTENT_ID = 'default';
const DEFAULT_HOME_CONTENT = {
  id: HOME_CONTENT_ID,
  bannerImages: [],
};

@Injectable()
export class HomeContentService {
  private readonly logger = new Logger(HomeContentService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getHomeContentDelegate() {
    const prisma = this.prisma as any;
    return prisma?.homeContent;
  }

  async findOne() {
    const delegate = this.getHomeContentDelegate();

    if (!delegate?.upsert) {
      this.logger.warn(
        'Prisma delegate homeContent indisponivel no runtime. Retornando conteudo padrao da home.',
      );
      return DEFAULT_HOME_CONTENT;
    }

    try {
      return await delegate.upsert({
        where: { id: HOME_CONTENT_ID },
        update: {},
        create: DEFAULT_HOME_CONTENT,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Falha ao carregar HomeContent. Retornando conteudo padrao. Motivo: ${errorMessage}`,
      );
      return DEFAULT_HOME_CONTENT;
    }
  }

  async update(updateHomeContentDto: UpdateHomeContentDto) {
    const bannerImages = (updateHomeContentDto.bannerImages || [])
      .map((item) => item.trim())
      .filter(Boolean);

    const delegate = this.getHomeContentDelegate();
    const payload = { id: HOME_CONTENT_ID, bannerImages };

    if (!delegate?.upsert) {
      this.logger.warn(
        'Prisma delegate homeContent indisponivel no runtime. Persistencia da home ignorada temporariamente.',
      );
      return payload;
    }

    try {
      return await delegate.upsert({
        where: { id: HOME_CONTENT_ID },
        update: { bannerImages },
        create: payload,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Falha ao salvar HomeContent. Retornando payload sem persistencia. Motivo: ${errorMessage}`,
      );
      return payload;
    }
  }
}
