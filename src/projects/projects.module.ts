import { Module } from '@nestjs/common';
import { TeamAccessModule } from '../team-access/team-access.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [TeamAccessModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
