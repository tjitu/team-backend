import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { TeamAccessModule } from './team-access/team-access.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [DatabaseModule, TeamAccessModule, ProjectsModule, TasksModule],
  controllers: [HealthController],
})
export class AppModule {}
