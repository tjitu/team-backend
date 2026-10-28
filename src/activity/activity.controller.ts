import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/authenticated-user';
import { SessionGuard } from '../auth/session.guard';
import { ActivityService } from './activity.service';
import { ListActivityQueryDto } from './activity.dto';

@Controller('team')
@UseGuards(SessionGuard)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get('activity')
  listTeam(@Req() request: AuthenticatedRequest, @Query() query: ListActivityQueryDto) {
    return this.activity.listTeam(request.user.id, query);
  }

  @Get('projects/:projectId/activity')
  listProject(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Query() query: ListActivityQueryDto,
  ) {
    return this.activity.listProject(request.user.id, projectId, query);
  }
}
