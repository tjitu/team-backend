import { Module } from '@nestjs/common';
import { TeamAccessModule } from '../team-access/team-access.module';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';

@Module({
  imports: [TeamAccessModule],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
})
export class DepartmentsModule {}
