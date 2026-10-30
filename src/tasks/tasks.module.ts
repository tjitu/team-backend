import { Module } from '@nestjs/common';
import { TeamAccessModule } from '../team-access/team-access.module';
import { StandaloneTasksController, TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [TeamAccessModule],
  controllers: [TasksController, StandaloneTasksController],
  providers: [TasksService],
})
export class TasksModule {}
