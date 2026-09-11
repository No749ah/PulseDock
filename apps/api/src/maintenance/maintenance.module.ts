import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

@Module({
  controllers: [MaintenanceController],
  providers: [MaintenanceService, PrismaService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
