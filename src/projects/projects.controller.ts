import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/authenticated-user';
import { SessionGuard } from '../auth/session.guard';
import {
  AddProjectMemberDto,
  CreateProjectDto,
  UpdateProjectDto,
  UpdateProjectMemberRoleDto,
} from './project.dto';
import { ProjectsService } from './projects.service';

@Controller('team/projects')
@UseGuards(SessionGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.projects.list(request.user.id);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() input: CreateProjectDto) {
    return this.projects.create(request.user.id, input);
  }

  @Get(':projectId')
  get(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.projects.get(request.user.id, projectId);
  }

  @Patch(':projectId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() input: UpdateProjectDto,
  ) {
    return this.projects.update(request.user.id, projectId, input);
  }

  @Post(':projectId/archive')
  archive(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.projects.archive(request.user.id, projectId);
  }

  @Post(':projectId/members')
  addMember(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() input: AddProjectMemberDto,
  ) {
    return this.projects.addMember(request.user.id, projectId, input);
  }

  @Patch(':projectId/members/:teamMemberId/role')
  updateMemberRole(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('teamMemberId') teamMemberId: string,
    @Body() input: UpdateProjectMemberRoleDto,
  ) {
    return this.projects.updateMemberRole(request.user.id, projectId, teamMemberId, input);
  }

  @Delete(':projectId/members/:teamMemberId')
  removeMember(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('teamMemberId') teamMemberId: string,
  ) {
    return this.projects.removeMember(request.user.id, projectId, teamMemberId);
  }
}
