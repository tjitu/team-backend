import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectRole, TaskPriority, TaskStatus, TeamRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TeamAccessService } from '../team-access/team-access.service';
import {
  CreateTaskCommentDto,
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskDto,
} from './task.dto';

type ProjectAccess = {
  member: Awaited<ReturnType<TeamAccessService['getActiveMember']>>;
  projectRole: ProjectRole | null;
  isAdmin: boolean;
};

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamAccess: TeamAccessService,
  ) {}

  async list(userId: string, projectId: string, query: ListTasksQueryDto) {
    await this.getProjectAccess(userId, projectId);
    const dueFrom = query.dueFrom ? new Date(`${query.dueFrom.slice(0, 10)}T00:00:00.000Z`) : undefined;
    const dueTo = query.dueTo ? new Date(`${query.dueTo.slice(0, 10)}T23:59:59.999Z`) : undefined;
    if (dueFrom && dueTo && dueFrom > dueTo) {
      throw new BadRequestException('The due date range is invalid.');
    }
    const tasks = await this.prisma.teamTask.findMany({
      where: {
        projectId,
        archivedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.priority ? { priority: query.priority } : {}),
        ...(query.assigneeId ? { assignees: { some: { teamMemberId: query.assigneeId } } } : {}),
        ...(query.creatorId ? { createdByTeamMemberId: query.creatorId } : {}),
        ...(dueFrom || dueTo ? { dueAt: { ...(dueFrom ? { gte: dueFrom } : {}), ...(dueTo ? { lte: dueTo } : {}) } } : {}),
        ...(query.q
          ? {
              OR: [
                { title: { contains: query.q.trim(), mode: 'insensitive' } },
                { description: { contains: query.q.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        assignees: {
          select: { teamMember: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { comments: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = tasks.length > query.limit;
    const items = hasMore ? tasks.slice(0, query.limit) : tasks;
    return { items, hasMore, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async listStandalone(userId: string, query: ListTasksQueryDto) {
    const access = await this.getStandaloneAccess(userId);
    const dueFrom = query.dueFrom ? new Date(`${query.dueFrom.slice(0, 10)}T00:00:00.000Z`) : undefined;
    const dueTo = query.dueTo ? new Date(`${query.dueTo.slice(0, 10)}T23:59:59.999Z`) : undefined;
    if (dueFrom && dueTo && dueFrom > dueTo) throw new BadRequestException('The due date range is invalid.');
    const tasks = await this.prisma.teamTask.findMany({
      where: {
        projectId: null,
        archivedAt: null,
        ...this.standaloneVisibilityWhere(access.member.id, access.isAdmin),
        ...(query.status ? { status: query.status } : {}),
        ...(query.priority ? { priority: query.priority } : {}),
        ...(query.assigneeId ? { assignees: { some: { teamMemberId: query.assigneeId } } } : {}),
        ...(query.creatorId ? { createdByTeamMemberId: query.creatorId } : {}),
        ...(dueFrom || dueTo ? { dueAt: { ...(dueFrom ? { gte: dueFrom } : {}), ...(dueTo ? { lte: dueTo } : {}) } } : {}),
        ...(query.q ? { AND: [{ OR: [
          { title: { contains: query.q.trim(), mode: 'insensitive' } },
          { description: { contains: query.q.trim(), mode: 'insensitive' } },
        ] }] } : {}),
      },
      include: {
        assignees: { select: { teamMember: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { comments: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = tasks.length > query.limit;
    const items = hasMore ? tasks.slice(0, query.limit) : tasks;
    return { items, hasMore, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async listStandaloneAssignees(userId: string) {
    await this.getStandaloneAccess(userId);
    return this.prisma.teamMember.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 500,
    });
  }

  async getStandalone(userId: string, taskId: string) {
    const access = await this.getStandaloneAccess(userId);
    const task = await this.prisma.teamTask.findFirst({
      where: {
        id: taskId,
        projectId: null,
        archivedAt: null,
        ...this.standaloneVisibilityWhere(access.member.id, access.isAdmin),
      },
      include: {
        assignees: { include: { teamMember: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } },
        createdBy: { select: { id: true, name: true, email: true } },
        comments: { take: 50, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { author: { select: { id: true, name: true, email: true } } } },
        _count: { select: { comments: true } },
      },
    });
    if (!task) throw new NotFoundException('Standalone task not found.');
    return task;
  }

  async createStandalone(userId: string, input: CreateTaskDto) {
    const access = await this.getStandaloneAccess(userId);
    const title = input.title.trim();
    if (title.length < 2) throw new BadRequestException('Task title is required.');
    const assignedMemberIds = input.assignedMemberIds ?? [];
    return this.prisma.$transaction(async (tx) => {
      await this.assertWorkspaceAssignees(tx, assignedMemberIds);
      const task = await tx.teamTask.create({
        data: {
          projectId: null,
          title,
          description: input.description?.trim() || null,
          attachments: input.attachments ?? [],
          priority: input.priority ?? TaskPriority.NORMAL,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          createdByTeamMemberId: access.member.id,
          assignees: { create: assignedMemberIds.map((teamMemberId) => ({ teamMemberId, assignedByMemberId: access.member.id })) },
        },
        include: {
          assignees: { include: { teamMember: { select: { id: true, name: true, email: true } } } },
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { comments: true } },
        },
      });
      await tx.activityLog.create({
        data: {
          actorTeamMemberId: access.member.id,
          projectId: null,
          eventType: 'STANDALONE_TASK_CREATED',
          entityType: 'TASK',
          entityId: task.id,
          metadata: { title: task.title, assigneeIds: assignedMemberIds },
        },
      });
      return task;
    });
  }

  async updateStandalone(userId: string, taskId: string, input: UpdateTaskDto) {
    const access = await this.getStandaloneAccess(userId);
    const task = await this.prisma.teamTask.findFirst({
      where: { id: taskId, projectId: null, archivedAt: null },
      include: { assignees: { select: { teamMemberId: true } } },
    });
    if (!task) throw new NotFoundException('Standalone task not found.');
    const isCreator = task.createdByTeamMemberId === access.member.id;
    const isAssignee = task.assignees.some(({ teamMemberId }) => teamMemberId === access.member.id);
    if (!access.isAdmin && !isCreator && !isAssignee) {
      throw new ForbiddenException('Only the task creator, an assignee, or a system administrator can update this task.');
    }
    if (input.assignedMemberIds !== undefined && !access.isAdmin && !isCreator) {
      throw new ForbiddenException('Only the task creator or a system administrator can change assignees.');
    }
    const title = input.title?.trim();
    if (title !== undefined && title.length < 2) throw new BadRequestException('Task title is required.');
    return this.prisma.$transaction(async (tx) => {
      if (input.assignedMemberIds !== undefined) await this.assertWorkspaceAssignees(tx, input.assignedMemberIds);
      const changed = await tx.teamTask.updateMany({
        where: { id: task.id, projectId: null, version: input.version, archivedAt: null },
        data: {
          ...(title === undefined ? {} : { title }),
          ...(input.description === undefined ? {} : { description: input.description?.trim() || null }),
          ...(input.attachments === undefined ? {} : { attachments: input.attachments }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.priority === undefined ? {} : { priority: input.priority }),
          ...(input.dueAt === undefined ? {} : { dueAt: input.dueAt ? new Date(input.dueAt) : null }),
          version: { increment: 1 },
        },
      });
      if (changed.count === 0) throw new ConflictException('Task changed. Reload and retry.');
      if (input.assignedMemberIds !== undefined) {
        await tx.taskAssignee.deleteMany({ where: { taskId: task.id } });
        if (input.assignedMemberIds.length) await tx.taskAssignee.createMany({
          data: input.assignedMemberIds.map((teamMemberId) => ({ taskId: task.id, teamMemberId, assignedByMemberId: access.member.id })),
        });
      }
      const updated = await tx.teamTask.findUniqueOrThrow({
        where: { id: task.id },
        include: {
          assignees: { include: { teamMember: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } },
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { comments: true } },
        },
      });
      await tx.activityLog.create({
        data: {
          actorTeamMemberId: access.member.id,
          projectId: null,
          eventType: 'STANDALONE_TASK_UPDATED',
          entityType: 'TASK',
          entityId: task.id,
          metadata: { title: updated.title, status: updated.status, priority: updated.priority },
        },
      });
      return updated;
    });
  }

  async archiveStandalone(userId: string, taskId: string, version: number) {
    const access = await this.getStandaloneAccess(userId);
    const task = await this.prisma.teamTask.findFirst({ where: { id: taskId, projectId: null, archivedAt: null } });
    if (!task) throw new NotFoundException('Standalone task not found.');
    if (!access.isAdmin && task.createdByTeamMemberId !== access.member.id) {
      throw new ForbiddenException('Only the task creator or a system administrator can archive this task.');
    }
    return this.prisma.$transaction(async (tx) => {
      const archivedAt = new Date();
      const result = await tx.teamTask.updateMany({
        where: { id: task.id, projectId: null, version, archivedAt: null },
        data: { archivedAt, version: { increment: 1 } },
      });
      if (!result.count) throw new ConflictException('Task changed. Reload and retry.');
      await tx.activityLog.create({
        data: { actorTeamMemberId: access.member.id, projectId: null, eventType: 'STANDALONE_TASK_ARCHIVED', entityType: 'TASK', entityId: task.id },
      });
      return { id: task.id, archivedAt };
    });
  }

  async addStandaloneComment(userId: string, taskId: string, input: CreateTaskCommentDto) {
    const access = await this.getStandaloneAccess(userId);
    const task = await this.prisma.teamTask.findFirst({
      where: {
        id: taskId,
        projectId: null,
        archivedAt: null,
        ...this.standaloneVisibilityWhere(access.member.id, access.isAdmin),
      },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Standalone task not found.');
    const body = input.body.trim();
    if (!body) throw new BadRequestException('Comment cannot be empty.');
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.taskComment.create({ data: { taskId: task.id, authorMemberId: access.member.id, body }, include: { author: { select: { id: true, name: true, email: true } } } });
      await tx.activityLog.create({
        data: { actorTeamMemberId: access.member.id, projectId: null, eventType: 'STANDALONE_TASK_COMMENT_ADDED', entityType: 'TASK_COMMENT', entityId: comment.id, metadata: { taskId: task.id } },
      });
      return comment;
    });
  }

  async get(userId: string, projectId: string, taskId: string) {
    await this.getProjectAccess(userId, projectId);
    return this.findTask(projectId, taskId, {
      assignees: {
        include: { teamMember: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
      createdBy: { select: { id: true, name: true, email: true } },
      comments: {
        take: 50,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { author: { select: { id: true, name: true, email: true } } },
      },
    });
  }

  async create(userId: string, projectId: string, input: CreateTaskDto) {
    const access = await this.getProjectAccess(userId, projectId);
    this.requireWritableProject(access);
    const title = input.title.trim();
    if (title.length < 2) throw new BadRequestException('Task title is required.');
    const assignedMemberIds = input.assignedMemberIds ?? [];

    return this.prisma.$transaction(async (tx) => {
      await this.assertProjectAssignees(tx, projectId, assignedMemberIds);
      const task = await tx.teamTask.create({
        data: {
          projectId,
          title,
          description: input.description?.trim() || null,
          attachments: input.attachments ?? [],
          priority: input.priority ?? TaskPriority.NORMAL,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          createdByTeamMemberId: access.member.id,
          assignees: {
            create: assignedMemberIds.map((teamMemberId) => ({
              teamMemberId,
              assignedByMemberId: access.member.id,
            })),
          },
        },
      });
      await tx.activityLog.create({
        data: {
          actorTeamMemberId: access.member.id,
          projectId,
          eventType: 'TASK_CREATED',
          entityType: 'TASK',
          entityId: task.id,
          metadata: { title: task.title, assigneeIds: assignedMemberIds },
        },
      });
      return task;
    });
  }

  async update(userId: string, projectId: string, taskId: string, input: UpdateTaskDto) {
    const access = await this.getProjectAccess(userId, projectId);
    this.requireWritableProject(access);
    const task = await this.prisma.teamTask.findFirst({
      where: { id: taskId, projectId, archivedAt: null },
      include: { assignees: { select: { teamMemberId: true } } },
    });
    if (!task) throw new NotFoundException('Task not found.');
    this.requireTaskEditor(access, task);
    if (input.assignedMemberIds !== undefined && !this.canManageProject(access)) {
      throw new ForbiddenException('Only a Project Manager or system administrator can change assignees.');
    }
    const title = input.title?.trim();
    if (title !== undefined && title.length < 2) throw new BadRequestException('Task title is required.');

    return this.prisma.$transaction(async (tx) => {
      if (input.assignedMemberIds !== undefined) {
        await this.assertProjectAssignees(tx, projectId, input.assignedMemberIds);
      }

      const changed = await tx.teamTask.updateMany({
        where: { id: task.id, projectId, version: input.version, archivedAt: null },
        data: {
          ...(title === undefined ? {} : { title }),
          ...(input.description === undefined ? {} : { description: input.description?.trim() || null }),
          ...(input.attachments === undefined ? {} : { attachments: input.attachments }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.priority === undefined ? {} : { priority: input.priority }),
          ...(input.dueAt === undefined ? {} : { dueAt: input.dueAt ? new Date(input.dueAt) : null }),
          version: { increment: 1 },
        },
      });
      if (changed.count === 0) throw new ConflictException('Task changed. Reload and retry.');

      if (input.assignedMemberIds !== undefined) {
        await tx.taskAssignee.deleteMany({ where: { taskId: task.id } });
        if (input.assignedMemberIds.length > 0) {
          await tx.taskAssignee.createMany({
            data: input.assignedMemberIds.map((teamMemberId) => ({
              taskId: task.id,
              teamMemberId,
              assignedByMemberId: access.member.id,
            })),
          });
        }
      }

      const updated = await tx.teamTask.findUniqueOrThrow({
        where: { id: task.id },
        include: {
          assignees: { include: { teamMember: { select: { id: true, name: true, email: true } } } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });
      await tx.activityLog.create({
        data: {
          actorTeamMemberId: access.member.id,
          projectId,
          eventType: 'TASK_UPDATED',
          entityType: 'TASK',
          entityId: task.id,
          metadata: {
            before: {
              title: task.title,
              description: task.description,
              status: task.status,
              priority: task.priority,
              dueAt: task.dueAt?.toISOString() ?? null,
              assigneeIds: task.assignees.map((assignee) => assignee.teamMemberId),
            },
            after: {
              title: updated.title,
              description: updated.description,
              status: updated.status,
              priority: updated.priority,
              dueAt: updated.dueAt?.toISOString() ?? null,
              assigneeIds: updated.assignees.map((assignee) => assignee.teamMemberId),
            },
          },
        },
      });
      return updated;
    });
  }

  async archive(userId: string, projectId: string, taskId: string, version: number) {
    const access = await this.getProjectAccess(userId, projectId);
    if (!this.canManageProject(access)) {
      throw new ForbiddenException('Only a Project Manager or system administrator can archive tasks.');
    }
    const task = await this.findTask(projectId, taskId);
    return this.prisma.$transaction(async (tx) => {
      const archivedAt = new Date();
      const result = await tx.teamTask.updateMany({
        where: { id: task.id, projectId, version, archivedAt: null },
        data: { archivedAt, version: { increment: 1 } },
      });
      if (result.count === 0) throw new ConflictException('Task changed. Reload and retry.');
      await tx.activityLog.create({
        data: {
          actorTeamMemberId: access.member.id,
          projectId,
          eventType: 'TASK_ARCHIVED',
          entityType: 'TASK',
          entityId: task.id,
        },
      });
      return { id: task.id, archivedAt };
    });
  }

  async addComment(userId: string, projectId: string, taskId: string, input: CreateTaskCommentDto) {
    const access = await this.getProjectAccess(userId, projectId);
    this.requireWritableProject(access);
    const task = await this.findTask(projectId, taskId);
    const body = input.body.trim();
    if (!body) throw new BadRequestException('Comment cannot be empty.');

    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.taskComment.create({
        data: { taskId: task.id, authorMemberId: access.member.id, body },
        include: { author: { select: { id: true, name: true, email: true } } },
      });
      await tx.activityLog.create({
        data: {
          actorTeamMemberId: access.member.id,
          projectId,
          eventType: 'TASK_COMMENT_ADDED',
          entityType: 'TASK_COMMENT',
          entityId: comment.id,
          metadata: { taskId: task.id },
        },
      });
      return comment;
    });
  }

  private async getProjectAccess(userId: string, projectId: string): Promise<ProjectAccess> {
    const member = await this.teamAccess.getActiveMember(userId);
    const isAdmin = member.role === TeamRole.SYSTEM_OWNER || member.role === TeamRole.SYSTEM_ADMIN;
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        archivedAt: null,
        ...(isAdmin ? {} : { members: { some: { teamMemberId: member.id, isActive: true } } }),
      },
      include: {
        members: { where: { teamMemberId: member.id, isActive: true }, select: { role: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found.');
    return { member, isAdmin, projectRole: project.members[0]?.role ?? null };
  }

  private async getStandaloneAccess(userId: string) {
    const member = await this.teamAccess.getActiveMember(userId);
    return {
      member,
      isAdmin: member.role === TeamRole.SYSTEM_OWNER || member.role === TeamRole.SYSTEM_ADMIN,
    };
  }

  private standaloneVisibilityWhere(memberId: string, isAdmin: boolean): Prisma.TeamTaskWhereInput {
    return isAdmin
      ? {}
      : {
          OR: [
            { createdByTeamMemberId: memberId },
            { assignees: { some: { teamMemberId: memberId } } },
          ],
        };
  }

  private async assertWorkspaceAssignees(tx: Prisma.TransactionClient, teamMemberIds: string[]): Promise<void> {
    if (new Set(teamMemberIds).size !== teamMemberIds.length) throw new BadRequestException('Assignee list contains duplicates.');
    if (!teamMemberIds.length) return;
    const valid = await tx.teamMember.findMany({ where: { id: { in: teamMemberIds }, isActive: true }, select: { id: true } });
    if (valid.length !== teamMemberIds.length) throw new BadRequestException('Every assignee must be an active Team member.');
  }

  private async findTask<T extends Prisma.TeamTaskInclude | undefined = undefined>(
    projectId: string,
    taskId: string,
    include?: T,
  ) {
    const task = await this.prisma.teamTask.findFirst({
      where: { id: taskId, projectId, archivedAt: null },
      ...(include ? { include } : {}),
    });
    if (!task) throw new NotFoundException('Task not found.');
    return task;
  }

  private async assertProjectAssignees(
    tx: Prisma.TransactionClient,
    projectId: string,
    teamMemberIds: string[],
  ): Promise<void> {
    if (new Set(teamMemberIds).size !== teamMemberIds.length) {
      throw new BadRequestException('Assignee list contains duplicates.');
    }
    if (teamMemberIds.length === 0) return;
    const valid = await tx.projectMember.findMany({
      where: {
        projectId,
        teamMemberId: { in: teamMemberIds },
        isActive: true,
        teamMember: { isActive: true },
      },
      select: { teamMemberId: true },
    });
    if (valid.length !== teamMemberIds.length) {
      throw new BadRequestException('Every assignee must be an active member of this project.');
    }
  }

  private canManageProject(access: ProjectAccess): boolean {
    return access.isAdmin || access.projectRole === ProjectRole.PROJECT_MANAGER;
  }

  private requireWritableProject(access: ProjectAccess): void {
    if (access.projectRole === ProjectRole.VIEWER && !access.isAdmin) {
      throw new ForbiddenException('Project viewers have read-only access.');
    }
  }

  private requireTaskEditor(
    access: ProjectAccess,
    task: Prisma.TeamTaskGetPayload<{ include: { assignees: { select: { teamMemberId: true } } } }>,
  ): void {
    const canEdit =
      this.canManageProject(access) ||
      access.projectRole === ProjectRole.MEMBER ||
      task.createdByTeamMemberId === access.member.id ||
      task.assignees.some((assignee) => assignee.teamMemberId === access.member.id);
    if (!canEdit) throw new ForbiddenException('Only project members or task participants can update this task.');
  }
}
