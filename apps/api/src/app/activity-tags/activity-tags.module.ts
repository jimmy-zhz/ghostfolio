import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';

import { Module } from '@nestjs/common';

import { ActivityTagsController } from './activity-tags.controller';
import { ActivityTagsService } from './activity-tags.service';

@Module({
  controllers: [ActivityTagsController],
  imports: [PrismaModule],
  providers: [ActivityTagsService]
})
export class ActivityTagsModule {}
