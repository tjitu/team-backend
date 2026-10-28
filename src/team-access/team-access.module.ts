import { Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { TeamAccessController } from './team-access.controller';
import { TeamAccessService } from './team-access.service';

@Module({
  controllers: [TeamAccessController],
  providers: [SessionGuard, TeamAccessService],
  exports: [TeamAccessService],
})
export class TeamAccessModule {}
