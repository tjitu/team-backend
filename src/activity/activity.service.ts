import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TeamRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TeamAccessService } from '../team-access/team-access.service';
import { ListActivityQueryDto } from './activity.dto';

@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamAccess: TeamAccessService,
  ) {}

  async listProject(userId: string, projectId: string, query: ListActivityQueryDto) {
    const member = await this.teamAccess.getActiveMember(userId);
    const isAdmin = this.isAdmin(member.role);
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        ...(isAdmin ? {} : { members: { some: { teamMemberId: member.id, isActive: true } } }),
      },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found.');
    return this.page({ projectId }, query);
  }

  async listTeam(userId: string, query: ListActivityQueryDto) {
    const member = await this.teamAccess.getActiveMember(userId);
    if (!this.isAdmin(member.role)) {
      throw new ForbiddenException('System Owner or System Admin access is required.');
    }
    return this.page({}, query);
  }

  private async page(baseWhere: Prisma.ActivityLogWhereInput, query: ListActivityQueryDto) {
    const cursor = query.cursor
      ? await this.prisma.activityLog.findFirst({
          where: { id: query.cursor, ...baseWhere },
          select: { id: true, createdAt: true },
        })
      : null;
    if (query.cursor && !cursor) throw new BadRequestException('Activity cursor is invalid for this view.');

    const where: Prisma.ActivityLogWhereInput = {
      ...baseWhere,
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.actorId ? { actorTeamMemberId: query.actorId } : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    };
    const records = await this.prisma.activityLog.findMany({
      where,
      include: {
        actor: { select: { id: true, name: true, email: true, role: true } },
        project: { select: { id: true, name: true, slug: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });

    const hasMore = records.length > query.limit;
    const items = hasMore ? records.slice(0, query.limit) : records;
    return {
      items,
      hasMore,
      nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
    };
  }

  private isAdmin(role: TeamRole): boolean {
    return role === TeamRole.SYSTEM_OWNER || role === TeamRole.SYSTEM_ADMIN;
  }
}
