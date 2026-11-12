import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BroadcastStatus,
  Prisma,
  ProjectRole,
  TaskPriority,
  TaskStatus,
  TeamRole,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TeamAccessService } from '../team-access/team-access.service';
import {
  CreateMarketingPartnershipDto,
  CreatePartnershipTaskDto,
  ImportMarketingPartnershipsDto,
  ListMarketingPartnershipsQueryDto,
  UpdateMarketingPartnershipDto,
} from './marketing.dto';

const IN_PROGRESS_STATUSES = new Set<BroadcastStatus>([
  BroadcastStatus.CONTACTED,
  BroadcastStatus.NEGOTIATING,
  BroadcastStatus.AWAITING_RESPONSE,
]);

const DEFAULT_CATEGORIES = ['Creator', 'Community', 'School Group', 'Media', 'Other'];
const DEFAULT_PLATFORMS = ['X', 'Instagram', 'TikTok', 'WhatsApp', 'Telegram', 'Discord', 'LINE', 'YouTube', 'Other'];

const partnershipSelect = {
  id: true,
  name: true,
  category: true,
  platform: true,
  totalMembers: true,
  picName: true,
  picContact: true,
  broadcastStatus: true,
  followUpDate: true,
  notes: true,
  departmentId: true,
  projectId: true,
  sortOrder: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true, email: true } },
  updatedBy: { select: { id: true, name: true, email: true } },
  tasks: {
    where: { archivedAt: null },
    select: {
      id: true,
      projectId: true,
      title: true,
      status: true,
      priority: true,
      dueAt: true,
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 3,
  },
} satisfies Prisma.MarketingPartnershipSelect;

@Injectable()
export class MarketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamAccess: TeamAccessService,
  ) {}

  async listPartnerships(userId: string, query: ListMarketingPartnershipsQueryDto) {
    const targetProjectId = query.projectId?.trim() || null;
    await this.requirePartnershipAccess(userId, targetProjectId, false);

    const allActive = await this.prisma.marketingPartnership.findMany({
      where: {
        archivedAt: null,
        ...(targetProjectId ? { projectId: targetProjectId } : {}),
      },
      select: partnershipSelect,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    const summary = this.computeSummary(allActive);
    const categories = this.mergeFacetOptions(DEFAULT_CATEGORIES, allActive.map((item) => item.category));
    const platforms = this.mergeFacetOptions(DEFAULT_PLATFORMS, allActive.map((item) => item.platform));

    const search = query.q?.trim().toLowerCase() ?? '';
    const categoryFilter = query.category?.trim().toLowerCase() ?? '';
    const platformFilter = query.platform?.trim().toLowerCase() ?? '';
    const todayKey = this.utcDateKey(new Date());

    const items = allActive.filter((item) => {
      if (query.status && item.broadcastStatus !== query.status) return false;
      if (categoryFilter && item.category.trim().toLowerCase() !== categoryFilter) return false;
      if (platformFilter && item.platform.trim().toLowerCase() !== platformFilter) return false;
      if (query.followUp && query.followUp !== 'all') {
        const itemDateKey = item.followUpDate ? this.utcDateKey(item.followUpDate) : null;
        if (query.followUp === 'scheduled' && !itemDateKey) return false;
        if (query.followUp === 'overdue' && (!itemDateKey || itemDateKey >= todayKey)) return false;
        if (query.followUp === 'today' && itemDateKey !== todayKey) return false;
        if (query.followUp === 'upcoming' && (!itemDateKey || itemDateKey < todayKey)) return false;
      }
      if (search) {
        const haystack = [
          item.name,
          item.category,
          item.platform,
          item.picName ?? '',
          item.picContact ?? '',
          item.notes ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    return {
      summary,
      items,
      facets: { categories, platforms },
    };
  }

  async createPartnership(userId: string, input: CreateMarketingPartnershipDto) {
    const projectId = input.projectId?.trim() || null;
    const { member: actor, project } = await this.requirePartnershipAccess(userId, projectId, true);
    const name = this.requireName(input.name);
    const category = this.normalizeText(input.category, 'Creator');
    const platform = this.normalizeText(input.platform, 'X');
    const followUpDate = this.parseFollowUpDate(input.followUpDate);
    const departmentId = project?.departmentId ?? (await this.resolveMarketingDepartmentId());

    return this.prisma.$transaction(async (tx) => {
      const aggregate = await tx.marketingPartnership.aggregate({
        _max: { sortOrder: true },
        where: { archivedAt: null, ...(projectId ? { projectId } : {}) },
      });
      const nextSortOrder = (aggregate._max.sortOrder ?? 0) + 1;

      const created = await tx.marketingPartnership.create({
        data: {
          name,
          category,
          platform,
          totalMembers: input.totalMembers ?? 0,
          picName: this.normalizeOptional(input.picName),
          picContact: this.normalizeOptional(input.picContact),
          broadcastStatus: input.broadcastStatus ?? BroadcastStatus.NOT_STARTED,
          followUpDate,
          notes: this.normalizeOptional(input.notes),
          departmentId,
          projectId,
          createdById: actor.id,
          updatedById: actor.id,
          sortOrder: nextSortOrder,
        },
        select: partnershipSelect,
      });

      await tx.activityLog.create({
        data: {
          actorTeamMemberId: actor.id,
          projectId,
          eventType: 'MARKETING_PARTNERSHIP_CREATED',
          entityType: 'MARKETING_PARTNERSHIP',
          entityId: created.id,
          metadata: {
            name: created.name,
            category: created.category,
            platform: created.platform,
            broadcastStatus: created.broadcastStatus,
            projectId,
          },
        },
      });

      return created;
    });
  }

  async updatePartnership(userId: string, partnershipId: string, input: UpdateMarketingPartnershipDto) {
    const current = await this.prisma.marketingPartnership.findFirst({
      where: { id: partnershipId, archivedAt: null },
    });
    if (!current) throw new NotFoundException('Partnership target not found.');
    const { member: actor } = await this.requirePartnershipAccess(userId, current.projectId, true);

    const data: Prisma.MarketingPartnershipUncheckedUpdateManyInput = {
      updatedById: actor.id,
      version: { increment: 1 },
    };
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    if (input.name !== undefined) {
      const name = this.requireName(input.name);
      data.name = name;
      before.name = current.name;
      after.name = name;
    }
    if (input.category !== undefined) {
      const category = this.normalizeText(input.category, 'Creator');
      data.category = category;
      before.category = current.category;
      after.category = category;
    }
    if (input.platform !== undefined) {
      const platform = this.normalizeText(input.platform, 'X');
      data.platform = platform;
      before.platform = current.platform;
      after.platform = platform;
    }
    if (input.totalMembers !== undefined) {
      data.totalMembers = input.totalMembers;
      before.totalMembers = current.totalMembers;
      after.totalMembers = input.totalMembers;
    }
    if (input.picName !== undefined) {
      const picName = this.normalizeOptional(input.picName);
      data.picName = picName;
      before.picName = current.picName;
      after.picName = picName;
    }
    if (input.picContact !== undefined) {
      const picContact = this.normalizeOptional(input.picContact);
      data.picContact = picContact;
      before.picContact = current.picContact;
      after.picContact = picContact;
    }
    if (input.broadcastStatus !== undefined) {
      data.broadcastStatus = input.broadcastStatus;
      before.broadcastStatus = current.broadcastStatus;
      after.broadcastStatus = input.broadcastStatus;
    }
    if (input.followUpDate !== undefined) {
      const followUpDate = this.parseFollowUpDate(input.followUpDate);
      data.followUpDate = followUpDate;
      before.followUpDate = current.followUpDate?.toISOString().slice(0, 10) ?? null;
      after.followUpDate = followUpDate?.toISOString().slice(0, 10) ?? null;
    }
    if (input.notes !== undefined) {
      const notes = this.normalizeOptional(input.notes);
      data.notes = notes;
      before.notes = current.notes;
      after.notes = notes;
    }

    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.marketingPartnership.updateMany({
        where: { id: current.id, version: input.version, archivedAt: null },
        data,
      });
      if (changed.count === 0) {
        throw new ConflictException('Partnership row was updated by someone else. Refresh and try again.');
      }

      const updated = await tx.marketingPartnership.findUniqueOrThrow({
        where: { id: current.id },
        select: partnershipSelect,
      });

      await tx.activityLog.create({
        data: {
          actorTeamMemberId: actor.id,
          projectId: current.projectId,
          eventType: 'MARKETING_PARTNERSHIP_UPDATED',
          entityType: 'MARKETING_PARTNERSHIP',
          entityId: current.id,
          metadata: {
            name: updated.name,
            before: before as Prisma.InputJsonValue,
            after: after as Prisma.InputJsonValue,
          },
        },
      });

      return updated;
    });
  }

  async archivePartnership(userId: string, partnershipId: string) {
    const current = await this.prisma.marketingPartnership.findFirst({
      where: { id: partnershipId, archivedAt: null },
    });
    if (!current) throw new NotFoundException('Partnership target not found.');
    const { member: actor } = await this.requirePartnershipAccess(userId, current.projectId, true);

    return this.prisma.$transaction(async (tx) => {
      await tx.marketingPartnership.update({
        where: { id: current.id },
        data: {
          archivedAt: new Date(),
          updatedById: actor.id,
          version: { increment: 1 },
        },
      });

      await tx.activityLog.create({
        data: {
          actorTeamMemberId: actor.id,
          projectId: current.projectId,
          eventType: 'MARKETING_PARTNERSHIP_ARCHIVED',
          entityType: 'MARKETING_PARTNERSHIP',
          entityId: current.id,
          metadata: { name: current.name, platform: current.platform },
        },
      });

      return { archived: true, id: current.id };
    });
  }

  async importPartnerships(userId: string, input: ImportMarketingPartnershipsDto) {
    const targetProjectId = input.projectId?.trim() || null;
    if (input.rows.some((row) => row.projectId?.trim() && row.projectId.trim() !== targetProjectId)) {
      throw new BadRequestException('All imported rows must belong to the same project.');
    }
    const { member: actor, project } = await this.requirePartnershipAccess(userId, targetProjectId, true);
    const departmentId = project?.departmentId ?? (await this.resolveMarketingDepartmentId());

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.marketingPartnership.findMany({
        where: {
          archivedAt: null,
          ...(targetProjectId ? { projectId: targetProjectId } : {}),
        },
        select: { name: true, platform: true, sortOrder: true },
      });

      const seenKeys = new Set(
        existing.map((item) => this.dedupKey(item.name, item.platform)),
      );
      let nextSortOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder), 0);

      const createdItems = [];
      let skippedCount = 0;

      for (const row of input.rows) {
        const name = row.name?.trim() ?? '';
        if (!name) {
          skippedCount += 1;
          continue;
        }
        const category = this.normalizeText(row.category, 'Creator');
        const platform = this.normalizeText(row.platform, 'X');
        const key = this.dedupKey(name, platform);

        if (seenKeys.has(key)) {
          skippedCount += 1;
          continue;
        }
        seenKeys.add(key);
        nextSortOrder += 1;

        const created = await tx.marketingPartnership.create({
          data: {
            name: name.slice(0, 160),
            category,
            platform,
            totalMembers: row.totalMembers ?? 0,
            picName: this.normalizeOptional(row.picName),
            picContact: this.normalizeOptional(row.picContact),
            broadcastStatus: row.broadcastStatus ?? BroadcastStatus.NOT_STARTED,
            followUpDate: this.parseFollowUpDate(row.followUpDate),
            notes: this.normalizeOptional(row.notes),
            departmentId,
            projectId: targetProjectId,
            createdById: actor.id,
            updatedById: actor.id,
            sortOrder: nextSortOrder,
          },
          select: partnershipSelect,
        });
        createdItems.push(created);
      }

      if (createdItems.length > 0) {
        await tx.activityLog.create({
          data: {
            actorTeamMemberId: actor.id,
            projectId: targetProjectId,
            eventType: 'MARKETING_PARTNERSHIP_IMPORTED',
            entityType: 'MARKETING_PARTNERSHIP',
            entityId: createdItems[0].id,
            metadata: {
              createdCount: createdItems.length,
              skippedCount,
              projectId: targetProjectId,
            },
          },
        });
      }

      return {
        createdCount: createdItems.length,
        skippedCount,
        items: createdItems,
      };
    });
  }

  async createPartnershipTask(userId: string, partnershipId: string, input: CreatePartnershipTaskDto) {
    const current = await this.prisma.marketingPartnership.findFirst({
      where: { id: partnershipId, archivedAt: null },
      include: {
        project: { select: { id: true, departmentId: true, archivedAt: true, hasPartnershipSheet: true } },
      },
    });
    if (!current) throw new NotFoundException('Partnership target not found.');

    const { member: actor } = await this.requirePartnershipAccess(userId, current.projectId, true);
    const title = (input.title?.trim() || `Follow up: ${current.name}`).slice(0, 180);
    if (title.length < 2) {
      throw new BadRequestException('Task title must be at least 2 characters.');
    }

    const defaultLines = [
      `Target: ${current.name} (${current.category} · ${current.platform})`,
      current.picName || current.picContact
        ? `PIC: ${current.picName || '-'}${current.picContact ? ` (${current.picContact})` : ''}`
        : null,
      current.notes ? `Notes: ${current.notes}` : null,
    ].filter(Boolean);
    const description = (input.description?.trim() || defaultLines.join('\n')).slice(0, 10000) || null;
    const dueAt = input.dueAt !== undefined ? this.parseFollowUpDate(input.dueAt) : current.followUpDate;
    const assignedMemberIds = Array.from(
      new Set((input.assignedMemberIds ?? []).map((id) => id.trim()).filter(Boolean)),
    );

    return this.prisma.$transaction(async (tx) => {
      if (assignedMemberIds.length > 0) {
        if (current.projectId) {
          const valid = await tx.projectMember.findMany({
            where: {
              projectId: current.projectId,
              teamMemberId: { in: assignedMemberIds },
              isActive: true,
              teamMember: { isActive: true },
            },
            select: { teamMemberId: true },
          });
          if (valid.length !== assignedMemberIds.length) {
            throw new BadRequestException('Every assignee must be an active member of this project.');
          }
        } else {
          const valid = await tx.teamMember.findMany({
            where: { id: { in: assignedMemberIds }, isActive: true },
            select: { id: true },
          });
          if (valid.length !== assignedMemberIds.length) {
            throw new BadRequestException('Every assignee must be an active Team member.');
          }
        }
      }

      const task = await tx.teamTask.create({
        data: {
          projectId: current.projectId,
          departmentId: current.project?.departmentId ?? current.departmentId ?? null,
          partnershipId: current.id,
          title,
          description,
          status: TaskStatus.TODO,
          priority: input.priority ?? TaskPriority.NORMAL,
          dueAt,
          createdByTeamMemberId: actor.id,
          ...(assignedMemberIds.length > 0
            ? {
                assignees: {
                  create: assignedMemberIds.map((teamMemberId) => ({
                    teamMemberId,
                    assignedByMemberId: actor.id,
                  })),
                },
              }
            : {}),
        },
        include: {
          assignees: { include: { teamMember: { select: { id: true, name: true, email: true } } } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.activityLog.create({
        data: {
          actorTeamMemberId: actor.id,
          projectId: current.projectId,
          eventType: 'TASK_CREATED',
          entityType: 'TASK',
          entityId: task.id,
          metadata: {
            title: task.title,
            priority: task.priority,
            dueAt: task.dueAt?.toISOString() ?? null,
            assigneeIds: assignedMemberIds,
            partnershipId: current.id,
            partnershipName: current.name,
          },
        },
      });

      const partnership = await tx.marketingPartnership.findUniqueOrThrow({
        where: { id: current.id },
        select: partnershipSelect,
      });

      return { task, partnership };
    });
  }

  private async requirePartnershipAccess(userId: string, projectId: string | null, write: boolean) {
    if (!projectId) {
      const member = await this.requireMarketingAccess(userId);
      return { member, project: null };
    }

    const member = await this.teamAccess.getActiveMember(userId);
    const isAdmin = member.role === TeamRole.SYSTEM_OWNER || member.role === TeamRole.SYSTEM_ADMIN;
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        archivedAt: null,
        ...(isAdmin ? {} : { members: { some: { teamMemberId: member.id, isActive: true } } }),
      },
      select: {
        id: true,
        departmentId: true,
        hasPartnershipSheet: true,
        members: { where: { teamMemberId: member.id, isActive: true }, select: { role: true } },
      },
    });
    if (!project) {
      throw new NotFoundException('Project not found.');
    }
    if (!project.hasPartnershipSheet) {
      throw new BadRequestException('Partnership sheet is not enabled for this project.');
    }
    const projectRole = project.members[0]?.role ?? null;
    if (write && !isAdmin && projectRole === ProjectRole.VIEWER) {
      throw new ForbiddenException('Project viewers have read-only access.');
    }
    return { member, project };
  }

  private async requireMarketingAccess(userId: string) {
    const member = await this.teamAccess.getActiveMember(userId);
    if (member.role === TeamRole.SYSTEM_OWNER || member.role === TeamRole.SYSTEM_ADMIN) {
      return member;
    }

    const membership = await this.prisma.teamMemberDepartment.findFirst({
      where: {
        teamMemberId: member.id,
        isActive: true,
        department: {
          isActive: true,
          slug: 'marketing',
        },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException('Marketing department access is required.');
    }
    return member;
  }

  private async resolveMarketingDepartmentId(): Promise<string | null> {
    const department = await this.prisma.department.findFirst({
      where: { slug: 'marketing', isActive: true },
      select: { id: true },
    });
    return department?.id ?? null;
  }

  private computeSummary(items: Array<{ totalMembers: number; broadcastStatus: BroadcastStatus }>) {
    const totalTarget = items.length;
    let totalReach = 0;
    let broadcastPublished = 0;
    let inProgress = 0;

    for (const item of items) {
      totalReach += item.totalMembers;
      if (item.broadcastStatus === BroadcastStatus.PUBLISHED) {
        broadcastPublished += 1;
      } else if (IN_PROGRESS_STATUSES.has(item.broadcastStatus)) {
        inProgress += 1;
      }
    }

    const successRate =
      totalTarget > 0 ? Math.round((broadcastPublished / totalTarget) * 1000) / 10 : 0;

    return {
      totalTarget,
      totalReach,
      broadcastPublished,
      inProgress,
      successRate,
    };
  }

  private mergeFacetOptions(defaults: string[], existing: string[]) {
    const seen = new Map<string, string>();
    for (const option of [...defaults, ...existing]) {
      const cleaned = option.trim();
      if (!cleaned) continue;
      const lower = cleaned.toLowerCase();
      if (!seen.has(lower)) {
        seen.set(lower, cleaned);
      }
    }
    return Array.from(seen.values());
  }

  private requireName(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException('Community / Account Creator name is required.');
    }
    return trimmed;
  }

  private normalizeText(value: string | undefined | null, fallback: string) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : fallback;
  }

  private normalizeOptional(value: string | undefined | null) {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private parseFollowUpDate(value: string | undefined | null): Date | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const datePrefix = trimmed.slice(0, 10);
    const parsed = new Date(`${datePrefix}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Follow-up date is invalid.');
    }
    return parsed;
  }

  private utcDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private dedupKey(name: string, platform: string) {
    return `${name.trim().toLowerCase()}::${platform.trim().toLowerCase()}`;
  }
}
