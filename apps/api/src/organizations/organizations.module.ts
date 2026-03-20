import { Module } from '@nestjs/common'
import { OrganizationsController } from './organizations.controller'
import { OrganizationsService } from './organizations.service'
import { PrismaService } from '../common/prisma.service'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, PrismaService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
