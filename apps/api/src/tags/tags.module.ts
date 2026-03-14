import { Module } from '@nestjs/common';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [TagsController],
  providers: [TagsService, PrismaService],
  exports: [TagsService],
})
export class TagsModule {}
