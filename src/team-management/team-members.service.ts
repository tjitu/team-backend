import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TeamRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TeamAccessService } from '../team-access/team-access.service';
import { ListMembersQueryDto, UpdateMemberRoleDto, UpdateMemberStatusDto } from './team-management.dto';

@Injectable()
export class TeamMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamAccess: TeamAccessService,
  ) {}

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
      select: { id: true, userId: true, email: true, name: true, role: true, isActive: true, createdAt: true },
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
    if (target.isActive === input.isActive) return this.publicMember(target);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.teamMember.update({
        where: { id: target.id },
        data: { isActive: input.isActive },
      });
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
    });
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
    if (target.role === input.role) return this.publicMember(target);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.teamMember.update({ where: { id: target.id }, data: { role: input.role } });
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
    });
  }

  private async requireAdmin(userId: string) {
    const actor = await this.teamAccess.getActiveMember(userId);
    if (actor.role !== TeamRole.SYSTEM_OWNER && actor.role !== TeamRole.SYSTEM_ADMIN) {
      throw new ForbiddenException('System Owner or System Admin access is required.');
    }
    return actor;
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
