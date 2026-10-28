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
