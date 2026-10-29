import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/authenticated-user';
import { SessionGuard } from '../auth/session.guard';
import {
  ListMembersQueryDto,
  CreateTeamMemberDto,
  UpdateMemberRoleDto,
  UpdateMemberStatusDto,
} from './team-management.dto';
import { TeamMembersService } from './team-members.service';

@Controller('team/members')
@UseGuards(SessionGuard)
export class TeamMembersController {
  constructor(private readonly members: TeamMembersService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() input: CreateTeamMemberDto) {
    return this.members.create(request.user.id, input);
  }

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
