import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UpdateHomeContentDto } from './dto/update-home-content.dto';
import { HomeContentService } from './home-content.service';

@Controller('home-content')
export class HomeContentController {
  constructor(private readonly homeContentService: HomeContentService) {}

  @Get()
  findOne() {
    return this.homeContentService.findOne();
  }

  @Patch()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  update(@Body() updateHomeContentDto: UpdateHomeContentDto) {
    return this.homeContentService.update(updateHomeContentDto);
  }
}
