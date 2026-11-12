import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TeamRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TeamAccessService } from '../team-access/team-access.service';
import {
  AddDepartmentMemberDto,
  CreateDepartmentDto,
  ListDepartmentMembersQueryDto,
  UpdateDepartmentDto,
} from './department.dto';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamAccess: TeamAccessService,
  ) {}

  async list(userId: string) {
    const member = await this.teamAccess.getActiveMember(userId);
    const isAdmin = this.isAdmin(member.role);
    return this.prisma.department.findMany({
      where: isAdmin ? {} : { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        isActive: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            members: {
              where: { isActive: true, teamMember: { isActive: true } },
            },
            projects: {
              where: { archivedAt: null },
            },
          },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async listMembers(userId: string, departmentId: string, query: ListDepartmentMembersQueryDto) {
    await this.requireAdmin(userId);
    const department = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) throw new NotFoundException('Department not found.');
    return this.prisma.teamMemberDepartment.findMany({
      where: {
        departmentId,
        isActive: true,
        teamMember: { isActive: true },
      },
      select: {
        id: true,
        createdAt: true,
        teamMember: { select: { id: true, email: true, name: true, role: true } },
      },
      orderBy: [{ teamMember: { name: 'asc' } }, { id: 'asc' }],
      take: query.limit,
    });
  }

  async create(userId: string, input: CreateDepartmentDto) {
    const actor = await this.requireAdmin(userId);
    const name = input.name.trim();
    if (name.length < 2) throw new BadRequestException('Department name is required.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const department = await tx.department.create({
          data: {
            name,
            slug: this.toSlug(name),
            description: input.description?.trim() || null,
          },
        });
        await tx.activityLog.create({
          data: {
            actorTeamMemberId: actor.id,
            eventType: 'DEPARTMENT_CREATED',
            entityType: 'DEPARTMENT',
            entityId: department.id,
            metadata: { name: department.name },
          },
        });
        return department;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A department with that name already exists.');
      }
      throw error;
    }
  }

  async update(userId: string, departmentId: string, input: UpdateDepartmentDto) {
    const actor = await this.requireAdmin(userId);
    const current = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!current) throw new NotFoundException('Department not found.');
    const name = input.name?.trim();
    if (name !== undefined && name.length < 2) throw new BadRequestException('Department name is required.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const changed = await tx.department.updateMany({
          where: { id: current.id, version: input.version },
          data: {
            ...(name === undefined ? {} : { name, slug: this.toSlug(name) }),
            ...(input.description === undefined ? {} : { description: input.description?.trim() || null }),
            ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
            version: { increment: 1 },
          },
        });
        if (changed.count === 0) throw new ConflictException('Department changed. Reload and retry.');
        const updated = await tx.department.findUniqueOrThrow({ where: { id: current.id } });
        await tx.activityLog.create({
          data: {
            actorTeamMemberId: actor.id,
            eventType: 'DEPARTMENT_UPDATED',
            entityType: 'DEPARTMENT',
            entityId: current.id,
            metadata: {
              before: { name: current.name, description: current.description, isActive: current.isActive },
              after: { name: updated.name, description: updated.description, isActive: updated.isActive },
            },
          },
        });
        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A department with that name already exists.');
      }
      throw error;
    }
  }

  async addMember(userId: string, departmentId: string, input: AddDepartmentMemberDto) {
    const actor = await this.requireAdmin(userId);
    const department = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!department?.isActive) throw new NotFoundException('Active department not found.');
    const email = input.email.trim().toLowerCase();
    const teamMember = await this.prisma.teamMember.findUnique({ where: { email } });
    if (!teamMember?.isActive) throw new NotFoundException('Active Team member not found.');

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.teamMemberDepartment.findUnique({
        where: { departmentId_teamMemberId: { departmentId, teamMemberId: teamMember.id } },
      });
      if (existing?.isActive) return existing;
      const membership = existing
        ? await tx.teamMemberDepartment.update({
            where: { id: existing.id },
            data: { isActive: true, assignedByTeamMemberId: actor.id },
          })
        : await tx.teamMemberDepartment.create({
            data: {
              departmentId,
              teamMemberId: teamMember.id,
              assignedByTeamMemberId: actor.id,
            },
          });
      await tx.activityLog.create({
        data: {
          actorTeamMemberId: actor.id,
          eventType: existing ? 'DEPARTMENT_MEMBER_REACTIVATED' : 'DEPARTMENT_MEMBER_ADDED',
          entityType: 'DEPARTMENT_MEMBER',
          entityId: membership.id,
          metadata: { departmentId, teamMemberId: teamMember.id, email },
        },
      });
      return membership;
    });
  }

  async removeMember(userId: string, departmentId: string, teamMemberId: string) {
    const actor = await this.requireAdmin(userId);
    const membership = await this.prisma.teamMemberDepartment.findUnique({
      where: { departmentId_teamMemberId: { departmentId, teamMemberId } },
      include: { teamMember: { select: { email: true } } },
    });
    if (!membership) throw new NotFoundException('Department membership not found.');
    if (!membership.isActive) return { id: membership.id, isActive: false };

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.teamMemberDepartment.update({
        where: { id: membership.id },
        data: { isActive: false },
      });
      await tx.activityLog.create({
        data: {
          actorTeamMemberId: actor.id,
          eventType: 'DEPARTMENT_MEMBER_REMOVED',
          entityType: 'DEPARTMENT_MEMBER',
          entityId: membership.id,
          metadata: { departmentId, teamMemberId, email: membership.teamMember.email },
        },
      });
      return { id: updated.id, isActive: updated.isActive };
    });
  }

  async getWorkspace(userId: string, slugOrId: string) {
    const member = await this.teamAccess.getActiveMember(userId);
    const isAdmin = this.isAdmin(member.role);
    const key = slugOrId.trim();
    const department = await this.prisma.department.findFirst({
      where: {
        OR: [{ slug: key }, { id: key }],
      },
      include: {
        _count: {
          select: {
            members: { where: { isActive: true, teamMember: { isActive: true } } },
            projects: { where: { archivedAt: null } },
          },
        },
      },
    });
    if (!department) throw new NotFoundException('Department workspace not found.');

    const memberDept = await this.prisma.teamMemberDepartment.findFirst({
      where: { departmentId: department.id, teamMemberId: member.id, isActive: true },
      select: { id: true },
    });

    const projects = await this.prisma.project.findMany({
      where: {
        departmentId: department.id,
        archivedAt: null,
        ...(isAdmin ? {} : { members: { some: { teamMemberId: member.id, isActive: true } } }),
      },
      include: {
        department: { select: { id: true, name: true, slug: true, isActive: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: {
          select: {
            members: { where: { isActive: true } },
            tasks: { where: { archivedAt: null } },
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });

    const accessibleProjectIds = projects.map((project) => project.id);
    const standaloneDeptWhere: Prisma.TeamTaskWhereInput = {
      projectId: null,
      departmentId: department.id,
      ...(isAdmin || memberDept
        ? {}
        : {
            OR: [
              { createdByTeamMemberId: member.id },
              { assignees: { some: { teamMemberId: member.id } } },
            ],
          }),
    };
    const taskOrFilters: Prisma.TeamTaskWhereInput[] = [standaloneDeptWhere];
    if (accessibleProjectIds.length > 0) {
      taskOrFilters.push({ projectId: { in: accessibleProjectIds } });
    }

    const tasks = await this.prisma.teamTask.findMany({
      where: {
        archivedAt: null,
        OR: taskOrFilters,
      },
      include: {
        project: { select: { id: true, name: true, hasPartnershipSheet: true } },
        assignees: {
          select: { teamMember: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { comments: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: 200,
    });

    const members = await this.prisma.teamMemberDepartment.findMany({
      where: { departmentId: department.id, isActive: true, teamMember: { isActive: true } },
      select: {
        id: true,
        teamMember: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: [{ teamMember: { name: 'asc' } }],
    });

    return {
      department,
      isMember: Boolean(memberDept),
      projects,
      tasks,
      members,
    };
  }

  private async requireAdmin(userId: string) {
    const member = await this.teamAccess.getActiveMember(userId);
    if (!this.isAdmin(member.role)) {
      throw new ForbiddenException('System Owner or System Admin access is required.');
    }
    return member;
  }

  private isAdmin(role: TeamRole): boolean {
    return role === TeamRole.SYSTEM_OWNER || role === TeamRole.SYSTEM_ADMIN;
  }

  private toSlug(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'department';
  }
}
