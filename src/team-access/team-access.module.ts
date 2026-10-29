import { Module } from '@nestjs/common';
import { TeamAccessController } from './team-access.controller';
import { TeamAccessService } from './team-access.service';

@Module({
  controllers: [TeamAccessController],
  providers: [TeamAccessService],
  exports: [TeamAccessService],
})
export class TeamAccessModule {}
