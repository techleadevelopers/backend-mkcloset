import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateHomeContentDto } from './dto/update-home-content.dto';

const HOME_CONTENT_ID = 'default';

@Injectable()
export class HomeContentService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne() {
    return this.prisma.homeContent.upsert({
      where: { id: HOME_CONTENT_ID },
      update: {},
      create: { id: HOME_CONTENT_ID, bannerImages: [] },
    });
  }

  async update(updateHomeContentDto: UpdateHomeContentDto) {
    const bannerImages = (updateHomeContentDto.bannerImages || [])
      .map((item) => item.trim())
      .filter(Boolean);

    return this.prisma.homeContent.upsert({
      where: { id: HOME_CONTENT_ID },
      update: { bannerImages },
      create: { id: HOME_CONTENT_ID, bannerImages },
    });
  }
}
