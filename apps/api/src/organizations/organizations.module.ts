import { Module } from '@nestjs/common'
import { OrganizationsController } from './organizations.controller'
import { OrganizationsService } from './organizations.service'
import { PrismaService } from '../common/prisma.service'

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, PrismaService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
