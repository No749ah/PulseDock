import { Module } from '@nestjs/common'
import { TeamController } from './team.controller'
import { TeamService } from './team.service'
import { PrismaService } from '../common/prisma.service'
import { MailerService } from '../common/mailer.service'

@Module({
  controllers: [TeamController],
  providers: [TeamService, PrismaService, MailerService],
  exports: [TeamService],
})
export class TeamModule {}
