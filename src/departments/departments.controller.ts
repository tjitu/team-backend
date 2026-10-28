import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/authenticated-user';
import { SessionGuard } from '../auth/session.guard';
import {
  AddDepartmentMemberDto,
  CreateDepartmentDto,
  ListDepartmentMembersQueryDto,
  UpdateDepartmentDto,
} from './department.dto';
import { DepartmentsService } from './departments.service';

@Controller('team/departments')
@UseGuards(SessionGuard)
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.departments.list(request.user.id);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() input: CreateDepartmentDto) {
    return this.departments.create(request.user.id, input);
  }

  @Patch(':departmentId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('departmentId') departmentId: string,
    @Body() input: UpdateDepartmentDto,
  ) {
    return this.departments.update(request.user.id, departmentId, input);
  }

  @Get(':departmentId/members')
  listMembers(
    @Req() request: AuthenticatedRequest,
    @Param('departmentId') departmentId: string,
    @Query() query: ListDepartmentMembersQueryDto,
  ) {
    return this.departments.listMembers(request.user.id, departmentId, query);
  }

  @Post(':departmentId/members')
  addMember(
    @Req() request: AuthenticatedRequest,
    @Param('departmentId') departmentId: string,
    @Body() input: AddDepartmentMemberDto,
  ) {
    return this.departments.addMember(request.user.id, departmentId, input);
  }

  @Delete(':departmentId/members/:teamMemberId')
  removeMember(
    @Req() request: AuthenticatedRequest,
    @Param('departmentId') departmentId: string,
    @Param('teamMemberId') teamMemberId: string,
  ) {
    return this.departments.removeMember(request.user.id, departmentId, teamMemberId);
  }
}
