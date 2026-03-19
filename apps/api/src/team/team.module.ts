import { Module } from '@nestjs/common'
import { TeamController } from './team.controller'
import { TeamService } from './team.service'
import { PrismaService } from '../common/prisma.service'

@Module({
  controllers: [TeamController],
  providers: [TeamService, PrismaService],
  exports: [TeamService],
})
export class TeamModule {}
