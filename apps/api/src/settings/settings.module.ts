import { Module } from '@nestjs/common'
import { SettingsController } from './settings.controller'
import { SettingsService } from './settings.service'
import { BackupService } from './backup.service'
import { PlanController } from './plan.controller'
import { PlanService } from './plan.service'
import { PrismaService } from '../common/prisma.service'

@Module({
  controllers: [SettingsController, PlanController],
  providers: [SettingsService, BackupService, PlanService, PrismaService],
  exports: [SettingsService, BackupService, PlanService],
})
export class SettingsModule {}
