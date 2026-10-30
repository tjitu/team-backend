import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/authenticated-user';
import { SessionGuard } from '../auth/session.guard';
import {
  ArchiveTaskDto,
  CreateTaskCommentDto,
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskDto,
} from './task.dto';
import { TasksService } from './tasks.service';

@Controller('team/projects/:projectId/tasks')
@UseGuards(SessionGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Query() query: ListTasksQueryDto,
  ) {
    return this.tasks.list(request.user.id, projectId, query);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() input: CreateTaskDto,
  ) {
    return this.tasks.create(request.user.id, projectId, input);
  }

  @Get(':taskId')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.tasks.get(request.user.id, projectId, taskId);
  }

  @Patch(':taskId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() input: UpdateTaskDto,
  ) {
    return this.tasks.update(request.user.id, projectId, taskId, input);
  }

  @Post(':taskId/archive')
  archive(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() input: ArchiveTaskDto,
  ) {
    return this.tasks.archive(request.user.id, projectId, taskId, input.version);
  }

  @Post(':taskId/comments')
  addComment(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() input: CreateTaskCommentDto,
  ) {
    return this.tasks.addComment(request.user.id, projectId, taskId, input);
  }
}

@Controller('team/tasks')
@UseGuards(SessionGuard)
export class StandaloneTasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('standalone/assignees')
  listAssignees(@Req() request: AuthenticatedRequest) {
    return this.tasks.listStandaloneAssignees(request.user.id);
  }

  @Get('standalone')
  list(@Req() request: AuthenticatedRequest, @Query() query: ListTasksQueryDto) {
    return this.tasks.listStandalone(request.user.id, query);
  }

  @Post('standalone')
  create(@Req() request: AuthenticatedRequest, @Body() input: CreateTaskDto) {
    return this.tasks.createStandalone(request.user.id, input);
  }

  @Get('standalone/:taskId')
  get(@Req() request: AuthenticatedRequest, @Param('taskId') taskId: string) {
    return this.tasks.getStandalone(request.user.id, taskId);
  }

  @Patch('standalone/:taskId')
  update(@Req() request: AuthenticatedRequest, @Param('taskId') taskId: string, @Body() input: UpdateTaskDto) {
    return this.tasks.updateStandalone(request.user.id, taskId, input);
  }

  @Post('standalone/:taskId/archive')
  archive(@Req() request: AuthenticatedRequest, @Param('taskId') taskId: string, @Body() input: ArchiveTaskDto) {
    return this.tasks.archiveStandalone(request.user.id, taskId, input.version);
  }

  @Post('standalone/:taskId/comments')
  addComment(@Req() request: AuthenticatedRequest, @Param('taskId') taskId: string, @Body() input: CreateTaskCommentDto) {
    return this.tasks.addStandaloneComment(request.user.id, taskId, input);
  }
}
