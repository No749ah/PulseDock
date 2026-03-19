import { Module } from '@nestjs/common'
import { SettingsController } from './settings.controller'
import { SettingsService } from './settings.service'
import { BackupService } from './backup.service'
import { PrismaService } from '../common/prisma.service'

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, BackupService, PrismaService],
  exports: [SettingsService, BackupService],
})
export class SettingsModule {}
