import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectRole, TeamRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TeamAccessService } from '../team-access/team-access.service';
import {
  AddProjectMemberDto,
  CreateProjectDto,
  UpdateProjectDto,
  UpdateProjectMemberRoleDto,
} from './project.dto';

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
      include: {
        department: { select: { id: true, name: true, slug: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { members: { where: { isActive: true } } } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
  }

  async listArchived(userId: string) {
    const member = await this.teamAccess.getActiveMember(userId);
    const isAdmin = member.role === TeamRole.SYSTEM_OWNER || member.role === TeamRole.SYSTEM_ADMIN;
    return this.prisma.project.findMany({
      where: {
        archivedAt: { not: null },
        ...(isAdmin ? {} : { members: { some: { teamMemberId: member.id, role: ProjectRole.PROJECT_MANAGER, isActive: true } } }),
      },
      include: {
        department: { select: { id: true, name: true, slug: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { members: { where: { isActive: true } } } },
      },
      orderBy: [{ archivedAt: 'desc' }, { id: 'asc' }],
    });
  }

  async create(userId: string, input: CreateProjectDto) {
    const member = await this.teamAccess.getActiveMember(userId);
    this.validateProjectPeriod(input.startsAt, input.endsAt);
    await this.requireActiveDepartment(input.departmentId);
    const baseSlug = this.toSlug(input.name);
    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: input.name.trim(),
          slug: `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`,
          description: input.description?.trim() || null,
          departmentId: input.departmentId,
          startsAt: this.toDate(input.startsAt),
          endsAt: this.toDate(input.endsAt),
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
          metadata: {
            name: created.name,
            departmentId: created.departmentId,
            startsAt: created.startsAt?.toISOString() ?? null,
            endsAt: created.endsAt?.toISOString() ?? null,
          },
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
        department: { select: { id: true, name: true, slug: true, isActive: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found.');
    return project;
  }

  async update(userId: string, projectId: string, input: UpdateProjectDto) {
    const { member, project } = await this.requireProjectManager(userId, projectId);
    const startsAt = input.startsAt === undefined ? project.startsAt : this.toDate(input.startsAt);
    const endsAt = input.endsAt === undefined ? project.endsAt : this.toDate(input.endsAt);
    this.validateProjectPeriod(startsAt?.toISOString(), endsAt?.toISOString());
    if (input.departmentId !== undefined && input.departmentId !== project.departmentId) {
      await this.requireActiveDepartment(input.departmentId);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.project.updateMany({
        where: { id: project.id, version: project.version, archivedAt: null },
        data: {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(input.description === undefined ? {} : { description: input.description?.trim() || null }),
          ...(input.departmentId === undefined ? {} : { departmentId: input.departmentId }),
          ...(input.startsAt === undefined ? {} : { startsAt: this.toDate(input.startsAt) }),
          ...(input.endsAt === undefined ? {} : { endsAt: this.toDate(input.endsAt) }),
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
            before: {
              name: project.name,
              description: project.description,
              departmentId: project.departmentId,
              startsAt: project.startsAt?.toISOString() ?? null,
              endsAt: project.endsAt?.toISOString() ?? null,
            },
            after: {
              name: fresh.name,
              description: fresh.description,
              departmentId: fresh.departmentId,
              startsAt: fresh.startsAt?.toISOString() ?? null,
              endsAt: fresh.endsAt?.toISOString() ?? null,
            },
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

  async restore(userId: string, projectId: string) {
    const { member, project } = await this.requireProjectManager(userId, projectId, true);
    if (!project.archivedAt) throw new BadRequestException('Project is not archived.');
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.project.updateMany({
        where: { id: project.id, version: project.version, archivedAt: { not: null } },
        data: { archivedAt: null, version: { increment: 1 } },
      });
      if (result.count === 0) throw new ConflictException('Project changed. Reload and retry.');
      const restored = await tx.project.findUniqueOrThrow({
        where: { id: project.id },
        include: {
          department: { select: { id: true, name: true, slug: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { members: { where: { isActive: true } } } },
        },
      });
      await tx.activityLog.create({
        data: {
          actorTeamMemberId: member.id,
          projectId: project.id,
          eventType: 'PROJECT_RESTORED',
          entityType: 'PROJECT',
          entityId: project.id,
        },
      });
      return restored;
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
    if (target.id === actor.id) {
      throw new ForbiddenException('You cannot add yourself to a project or change your own project role.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.projectMember.findUnique({
          where: { projectId_teamMemberId: { projectId: project.id, teamMemberId: target.id } },
        });
        if (existing?.isActive) {
          if (existing.role !== input.role) {
            throw new ConflictException('Member is already assigned. Use the project role endpoint to change their role.');
          }
          return existing;
        }
        const membership = existing
          ? await tx.projectMember.update({
              where: { id: existing.id },
              data: { role: input.role, isActive: true },
            })
          : await tx.projectMember.create({
              data: {
                projectId: project.id,
                teamMemberId: target.id,
                role: input.role,
                isActive: true,
              },
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

  async updateMemberRole(
    userId: string,
    projectId: string,
    teamMemberId: string,
    input: UpdateProjectMemberRoleDto,
  ) {
    const { member: actor, project } = await this.requireProjectManager(userId, projectId);
    if (
      input.role === ProjectRole.PROJECT_MANAGER &&
      actor.role !== TeamRole.SYSTEM_OWNER &&
      actor.role !== TeamRole.SYSTEM_ADMIN
    ) {
      throw new ForbiddenException('Only a system administrator can assign another project manager.');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockProject(tx, project.id);
      const membership = await tx.projectMember.findUnique({
        where: { projectId_teamMemberId: { projectId: project.id, teamMemberId } },
      });
      if (!membership?.isActive) throw new NotFoundException('Active project membership not found.');
      if (teamMemberId === actor.id) {
        throw new ForbiddenException('You cannot change your own project role.');
      }
      if (membership.role === input.role) return membership;

      if (
        membership.role === ProjectRole.PROJECT_MANAGER &&
        input.role !== ProjectRole.PROJECT_MANAGER
      ) {
        await this.requireAnotherProjectManager(tx, project.id, membership.id);
      }

      const updated = await tx.projectMember.update({
        where: { id: membership.id },
        data: { role: input.role },
      });
      await tx.activityLog.create({
        data: {
          actorTeamMemberId: actor.id,
          projectId: project.id,
          eventType: 'PROJECT_MEMBER_ROLE_CHANGED',
          entityType: 'PROJECT_MEMBER',
          entityId: membership.id,
          metadata: { teamMemberId, before: membership.role, after: updated.role },
        },
      });
      return updated;
    });
  }

  async removeMember(userId: string, projectId: string, teamMemberId: string) {
    const { member: actor, project } = await this.requireProjectManager(userId, projectId);
    return this.prisma.$transaction(async (tx) => {
      await this.lockProject(tx, project.id);
      const membership = await tx.projectMember.findUnique({
        where: { projectId_teamMemberId: { projectId: project.id, teamMemberId } },
        include: { teamMember: { select: { email: true } } },
      });
      if (!membership?.isActive) throw new NotFoundException('Active project membership not found.');
      if (teamMemberId === actor.id) {
        throw new ForbiddenException('You cannot remove yourself from a project.');
      }
      if (membership.role === ProjectRole.PROJECT_MANAGER) {
        await this.requireAnotherProjectManager(tx, project.id, membership.id);
      }

      const removed = await tx.projectMember.update({
        where: { id: membership.id },
        data: { isActive: false },
      });
      await tx.activityLog.create({
        data: {
          actorTeamMemberId: actor.id,
          projectId: project.id,
          eventType: 'PROJECT_MEMBER_REMOVED',
          entityType: 'PROJECT_MEMBER',
          entityId: membership.id,
          metadata: { teamMemberId, email: membership.teamMember.email, role: membership.role },
        },
      });
      return { id: removed.id, teamMemberId, isActive: removed.isActive };
    });
  }

  private async lockProject(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "team_platform"."projects" WHERE "id" = ${projectId} FOR UPDATE
    `;
  }

  private async requireAnotherProjectManager(
    tx: Prisma.TransactionClient,
    projectId: string,
    currentMembershipId: string,
  ): Promise<void> {
    const otherManagers = await tx.projectMember.count({
      where: {
        projectId,
        id: { not: currentMembershipId },
        isActive: true,
        role: ProjectRole.PROJECT_MANAGER,
        teamMember: { isActive: true },
      },
    });
    if (otherManagers === 0) {
      throw new ConflictException('A project must keep at least one active Project Manager.');
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

  private async requireActiveDepartment(departmentId: string): Promise<void> {
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, isActive: true },
      select: { id: true },
    });
    if (!department) throw new NotFoundException('Active department not found.');
  }

  private validateProjectPeriod(startsAt?: string | null, endsAt?: string | null): void {
    if (startsAt && endsAt && new Date(startsAt).getTime() > new Date(endsAt).getTime()) {
      throw new BadRequestException('The project end date must be on or after the start date.');
    }
  }

  private toDate(value?: string | null): Date | null {
    return value ? new Date(value) : null;
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
