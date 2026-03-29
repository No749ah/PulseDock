import { Module } from '@nestjs/common';
import { DependenciesController } from './dependencies.controller';
import { DependenciesService } from './dependencies.service';

@Module({
  controllers: [DependenciesController],
  providers: [DependenciesService],
  exports: [DependenciesService],
})
export class DependenciesModule {}
