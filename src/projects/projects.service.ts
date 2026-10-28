import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectRole, TeamRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TeamAccessService } from '../team-access/team-access.service';
import { AddProjectMemberDto, CreateProjectDto, UpdateProjectDto } from './project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamAccess: TeamAccessService,
  ) {}

  async list(userId: string) {
    const member = await this.teamAccess.getActiveMember(userId);
    const isAdmin = member.role === TeamRole.SYSTEM_OWNER || member.role === TeamRole.SYSTEM_ADMIN;
    return this.prisma.project.findMany({
      where: {
        archivedAt: null,
        ...(isAdmin ? {} : { members: { some: { teamMemberId: member.id, isActive: true } } }),
      },
      include: { _count: { select: { members: { where: { isActive: true } } } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
  }

  async create(userId: string, input: CreateProjectDto) {
    const member = await this.teamAccess.getActiveMember(userId);
    this.requireAdmin(member.role);
    const baseSlug = this.toSlug(input.name);
    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: input.name.trim(),
          slug: `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`,
          description: input.description?.trim() || null,
          createdById: member.id,
          members: { create: { teamMemberId: member.id, role: ProjectRole.PROJECT_MANAGER } },
        },
      });
      await tx.activityLog.create({
        data: {
          actorTeamMemberId: member.id,
          projectId: created.id,
          eventType: 'PROJECT_CREATED',
          entityType: 'PROJECT',
          entityId: created.id,
          metadata: { name: created.name },
        },
      });
      return created;
    });
    return project;
  }

  async get(userId: string, projectId: string) {
    const member = await this.teamAccess.getActiveMember(userId);
    const isAdmin = member.role === TeamRole.SYSTEM_OWNER || member.role === TeamRole.SYSTEM_ADMIN;
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        archivedAt: null,
        ...(isAdmin ? {} : { members: { some: { teamMemberId: member.id, isActive: true } } }),
      },
      include: {
        members: {
          where: { isActive: true, teamMember: { isActive: true } },
          select: {
            id: true,
            role: true,
            teamMember: { select: { id: true, email: true, name: true } },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found.');
    return project;
  }

  async update(userId: string, projectId: string, input: UpdateProjectDto) {
    const { member, project } = await this.requireProjectManager(userId, projectId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.project.updateMany({
        where: { id: project.id, version: project.version, archivedAt: null },
        data: {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(input.description === undefined ? {} : { description: input.description?.trim() || null }),
          version: { increment: 1 },
        },
      });
      if (result.count === 0) throw new ConflictException('Project changed. Reload and retry.');
      const fresh = await tx.project.findUniqueOrThrow({ where: { id: project.id } });
      await tx.activityLog.create({
        data: {
          actorTeamMemberId: member.id,
          projectId: project.id,
          eventType: 'PROJECT_UPDATED',
          entityType: 'PROJECT',
          entityId: project.id,
          metadata: {
            before: { name: project.name, description: project.description },
            after: { name: fresh.name, description: fresh.description },
          },
        },
      });
      return fresh;
    });
    return updated;
  }

  async archive(userId: string, projectId: string) {
    const { member, project } = await this.requireProjectManager(userId, projectId, true);
    if (project.archivedAt) return { id: project.id, archivedAt: project.archivedAt };
    return this.prisma.$transaction(async (tx) => {
      const archivedAt = new Date();
      const result = await tx.project.updateMany({
        where: { id: project.id, version: project.version, archivedAt: null },
        data: { archivedAt, version: { increment: 1 } },
      });
      if (result.count === 0) throw new ConflictException('Project changed. Reload and retry.');
      await tx.activityLog.create({
        data: {
          actorTeamMemberId: member.id,
          projectId: project.id,
          eventType: 'PROJECT_ARCHIVED',
          entityType: 'PROJECT',
          entityId: project.id,
        },
      });
      return { id: project.id, archivedAt };
    });
  }

  async addMember(userId: string, projectId: string, input: AddProjectMemberDto) {
    const { member: actor, project } = await this.requireProjectManager(userId, projectId);
    const email = input.email.trim().toLowerCase();
    if (input.role === ProjectRole.PROJECT_MANAGER && actor.role !== TeamRole.SYSTEM_OWNER && actor.role !== TeamRole.SYSTEM_ADMIN) {
      throw new ForbiddenException('Only a system administrator can assign another project manager.');
    }
    const target = await this.prisma.teamMember.findUnique({ where: { email } });
    if (!target?.isActive) throw new NotFoundException('Active Team member not found.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const membership = await tx.projectMember.upsert({
          where: { projectId_teamMemberId: { projectId: project.id, teamMemberId: target.id } },
          create: {
            projectId: project.id,
            teamMemberId: target.id,
            role: input.role,
            isActive: true,
          },
          update: { role: input.role, isActive: true },
        });
        await tx.activityLog.create({
          data: {
            actorTeamMemberId: actor.id,
            projectId: project.id,
            eventType: 'PROJECT_MEMBER_ADDED',
            entityType: 'PROJECT_MEMBER',
            entityId: membership.id,
            metadata: { teamMemberId: target.id, role: input.role },
          },
        });
        return membership;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException('Project membership could not be saved.');
      }
      throw error;
    }
  }

  private async requireProjectManager(userId: string, projectId: string, includeArchived = false) {
    const member = await this.teamAccess.getActiveMember(userId);
    const isAdmin = member.role === TeamRole.SYSTEM_OWNER || member.role === TeamRole.SYSTEM_ADMIN;
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        ...(includeArchived ? {} : { archivedAt: null }),
        ...(isAdmin ? {} : { members: { some: { teamMemberId: member.id, role: ProjectRole.PROJECT_MANAGER, isActive: true } } }),
      },
    });
    if (!project) throw new NotFoundException('Project not found.');
    return { member, project };
  }

  private requireAdmin(role: TeamRole): void {
    if (role !== TeamRole.SYSTEM_OWNER && role !== TeamRole.SYSTEM_ADMIN) {
      throw new ForbiddenException('Only a system administrator can create projects.');
    }
  }

  private toSlug(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 72) || 'project';
  }
}
