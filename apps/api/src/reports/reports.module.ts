import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PrismaService } from '../common/prisma.service';
import { MailerService } from '../common/mailer.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, PrismaService, MailerService],
  exports: [ReportsService],
})
export class ReportsModule {}
