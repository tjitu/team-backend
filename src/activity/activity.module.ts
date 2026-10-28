import { Module } from '@nestjs/common';
import { TeamAccessModule } from '../team-access/team-access.module';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

@Module({
  imports: [TeamAccessModule],
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
