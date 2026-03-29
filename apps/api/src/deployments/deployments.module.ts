import { Module } from '@nestjs/common';
import { DeploymentsController, PublicDeploymentsController } from './deployments.controller';
import { DeploymentsService } from './deployments.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [DeploymentsController, PublicDeploymentsController],
  providers: [DeploymentsService, PrismaService],
  exports: [DeploymentsService],
})
export class DeploymentsModule {}
