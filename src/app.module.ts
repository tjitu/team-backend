import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { TeamAccessModule } from './team-access/team-access.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { TeamManagementModule } from './team-management/team-management.module';
import { TrustedOriginGuard } from './auth/trusted-origin.guard';
import { DepartmentsModule } from './departments/departments.module';
import { ActivityModule } from './activity/activity.module';
import { AuthModule } from './auth/auth.module';
import { ControlCenterModule } from './control-center/control-center.module';

@Module({
  imports: [DatabaseModule, AuthModule, TeamAccessModule, ProjectsModule, TasksModule, TeamManagementModule, DepartmentsModule, ActivityModule, ControlCenterModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: TrustedOriginGuard }],
})
export class AppModule {}
