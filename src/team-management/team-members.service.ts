import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, ProjectRole, TeamRole } from '@prisma/client';
import { AUTH_USER_ADMIN_PROVIDER, AuthUserAdminProvider } from '../auth/auth-provider';
import { PrismaService } from '../database/prisma.service';
import { TeamAccessService } from '../team-access/team-access.service';
import { CreateTeamMemberDto, ListMembersQueryDto, UpdateMemberRoleDto, UpdateMemberStatusDto } from './team-management.dto';
import { AffiliateIdentityService } from '../affiliate/affiliate-identity.service';

@Injectable()
export class TeamMembersService {
  private readonly logger = new Logger(TeamMembersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly teamAccess: TeamAccessService,
    private readonly affiliates: AffiliateIdentityService,
    @Inject(AUTH_USER_ADMIN_PROVIDER) private readonly authUsers: AuthUserAdminProvider,
  ) {}

  async create(userId: string, input: CreateTeamMemberDto) {
    const actor = await this.requireAdmin(userId);
    if (input.role === TeamRole.SYSTEM_OWNER) {
      throw new ForbiddenException('System Owner access can only be assigned through the bootstrap process.');
    }
    if (input.role === TeamRole.SYSTEM_ADMIN && actor.role !== TeamRole.SYSTEM_OWNER) {
      throw new ForbiddenException('Only the System Owner can create a System Admin account.');
    }
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.teamMember.findUnique({ where: { email } });
    if (existing) throw new ConflictException('A Team member with this email already exists.');
    if (input.username && await this.prisma.teamMember.findUnique({ where: { username: input.username } })) {
      throw new ConflictException('A Team member with this username already exists.');
    }

    const authUser = await this.authUsers.createUser({ email, password: input.password, name: input.name.trim() });
    let affiliateId: string | undefined;
    try {
      const member = await this.prisma.$transaction(async (tx) => {
        const created = await tx.teamMember.create({
          data: {
            userId: authUser.id,
            email: authUser.email.toLowerCase(),
            username: input.username || null,
            name: input.name.trim(),
            role: input.role,
            isActive: true,
          },
        });
        await tx.activityLog.create({
          data: {
            actorTeamMemberId: actor.id,
            eventType: 'TEAM_MEMBER_CREATED',
            entityType: 'TEAM_MEMBER',
            entityId: created.id,
            metadata: { email: created.email, role: created.role },
          },
        });
        if (created.role === TeamRole.AFFILIATOR) { affiliateId=created.id; await this.affiliates.sync(created); }
        return created;
      });
      return this.publicMember(member);
    } catch (error) {
      if (affiliateId) await this.disableAffiliateAfterFailure(affiliateId);
      try {
        await this.authUsers.deleteUser(authUser.id);
      } catch (cleanupError) {
        const stack = cleanupError instanceof Error ? cleanupError.stack : String(cleanupError);
        this.logger.error('Could not remove a Supabase Auth user after Team member creation failed.', stack);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A Team member with this email or username already exists.');
      }
      throw error;
    }
  }

  async list(userId: string, query: ListMembersQueryDto) {
    await this.requireAdmin(userId);
    return this.prisma.teamMember.findMany({
      where: {
        ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q.trim(), mode: 'insensitive' } },
                { email: { contains: query.q.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        userId: true,
        email: true,
        username: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        departments: {
          where: { isActive: true, department: { isActive: true } },
          select: { department: { select: { id: true, name: true, slug: true } } },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 500,
    });
  }

  async updateStatus(userId: string, memberId: string, input: UpdateMemberStatusDto) {
    const actor = await this.requireAdmin(userId);
    const target = await this.prisma.teamMember.findUnique({ where: { id: memberId } });
    if (!target) throw new NotFoundException('Team member not found.');
    if (target.role === TeamRole.SYSTEM_OWNER) {
      throw new ForbiddenException('The System Owner cannot be disabled through this endpoint.');
    }
    if (target.role === TeamRole.SYSTEM_ADMIN && actor.role !== TeamRole.SYSTEM_OWNER) {
      throw new ForbiddenException('Only the System Owner can disable a System Admin.');
    }
    if (target.id === actor.id && !input.isActive) {
      throw new ForbiddenException('You cannot disable your own account.');
    }
    if (target.isActive === input.isActive && target.role !== TeamRole.AFFILIATOR) return this.publicMember(target);
    let affiliateSyncAttempted=false;

    const result = await this.prisma.$transaction(async (tx) => {
      if (!input.isActive) {
        const managedProjects = await tx.projectMember.findMany({
          where: {
            teamMemberId: target.id,
            isActive: true,
            role: ProjectRole.PROJECT_MANAGER,
            project: { archivedAt: null },
          },
          select: { projectId: true },
          orderBy: { projectId: 'asc' },
        });
        for (const { projectId } of managedProjects) {
          await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "public"."projects" WHERE "id" = ${projectId} FOR UPDATE
          `;
          const remainingManagers = await tx.projectMember.count({
            where: {
              projectId,
              teamMemberId: { not: target.id },
              isActive: true,
              role: ProjectRole.PROJECT_MANAGER,
              teamMember: { isActive: true },
            },
          });
          if (remainingManagers === 0) {
            throw new ConflictException('This member is the last active Project Manager for an active project.');
          }
        }
      }
      const updated = await tx.teamMember.update({
        where: { id: target.id },
        data: { isActive: input.isActive },
      });
      if (target.role === TeamRole.AFFILIATOR) { affiliateSyncAttempted=true; await this.affiliates.sync(updated); }
      await tx.activityLog.create({
        data: {
          actorTeamMemberId: actor.id,
          eventType: input.isActive ? 'TEAM_MEMBER_ACTIVATED' : 'TEAM_MEMBER_DEACTIVATED',
          entityType: 'TEAM_MEMBER',
          entityId: target.id,
          metadata: { email: target.email },
        },
      });
      return this.publicMember(updated);
    }).catch(async (error: unknown) => {
      if (affiliateSyncAttempted) await this.disableAffiliateAfterFailure(target.id);
      throw error;
    });
    this.teamAccess.invalidate(target.userId);
    return result;
  }

  async updateRole(userId: string, memberId: string, input: UpdateMemberRoleDto) {
    const actor = await this.requireOwner(userId);
    if (input.role === TeamRole.SYSTEM_OWNER) {
      throw new ForbiddenException('System Owner status is reserved for the bootstrap process.');
    }
    const target = await this.prisma.teamMember.findUnique({ where: { id: memberId } });
    if (!target) throw new NotFoundException('Team member not found.');
    if (target.role === TeamRole.SYSTEM_OWNER) {
      throw new ForbiddenException('The System Owner role cannot be changed through this endpoint.');
    }
    if (target.role === input.role && target.role !== TeamRole.AFFILIATOR) return this.publicMember(target);
    let affiliateSyncAttempted=false;

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.teamMember.update({ where: { id: target.id }, data: { role: input.role } });
      if (target.role === TeamRole.AFFILIATOR || updated.role === TeamRole.AFFILIATOR) { affiliateSyncAttempted=true; await this.affiliates.sync(updated); }
      await tx.activityLog.create({
        data: {
          actorTeamMemberId: actor.id,
          eventType: 'TEAM_MEMBER_ROLE_CHANGED',
          entityType: 'TEAM_MEMBER',
          entityId: target.id,
          metadata: { before: target.role, after: updated.role, email: target.email },
        },
      });
      return this.publicMember(updated);
    }).catch(async (error: unknown) => {
      if (affiliateSyncAttempted) await this.disableAffiliateAfterFailure(target.id);
      throw error;
    });
    this.teamAccess.invalidate(target.userId);
    return result;
  }

  private async requireAdmin(userId: string) {
    const actor = await this.teamAccess.getActiveMember(userId);
    if (actor.role !== TeamRole.SYSTEM_OWNER && actor.role !== TeamRole.SYSTEM_ADMIN) {
      throw new ForbiddenException('System Owner or System Admin access is required.');
    }
    return actor;
  }

  private async disableAffiliateAfterFailure(id: string) {
    try { await this.affiliates.disable(id); }
    catch { this.logger.error(`Affiliate identity reconciliation required for Team member ${id}.`); }
  }

  private async requireOwner(userId: string) {
    const actor = await this.teamAccess.getActiveMember(userId);
    if (actor.role !== TeamRole.SYSTEM_OWNER) {
      throw new ForbiddenException('System Owner access is required to change Team roles.');
    }
    return actor;
  }

  private publicMember(member: { id: string; userId: string; email: string; name: string; role: TeamRole; isActive: boolean }) {
    return {
      id: member.id,
      userId: member.userId,
      email: member.email,
      name: member.name,
      role: member.role,
      isActive: member.isActive,
    };
  }
}
