import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/authenticated-user';
import { SessionGuard } from '../auth/session.guard';
import {
  ListMembersQueryDto,
  UpdateMemberRoleDto,
  UpdateMemberStatusDto,
} from './team-management.dto';
import { TeamMembersService } from './team-members.service';

@Controller('team/members')
@UseGuards(SessionGuard)
export class TeamMembersController {
  constructor(private readonly members: TeamMembersService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: ListMembersQueryDto) {
    return this.members.list(request.user.id, query);
  }

  @Patch(':memberId/status')
  updateStatus(
    @Req() request: AuthenticatedRequest,
    @Param('memberId') memberId: string,
    @Body() input: UpdateMemberStatusDto,
  ) {
    return this.members.updateStatus(request.user.id, memberId, input);
  }

  @Patch(':memberId/role')
  updateRole(
    @Req() request: AuthenticatedRequest,
    @Param('memberId') memberId: string,
    @Body() input: UpdateMemberRoleDto,
  ) {
    return this.members.updateRole(request.user.id, memberId, input);
  }
}
