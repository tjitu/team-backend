import { ForbiddenException, Injectable } from '@nestjs/common';
import type { TeamMember } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/**
 * Every Team API request resolves the caller's membership. The database is a long
 * round trip away, so active memberships are remembered for a few seconds.
 * Any write that changes a member's status or role calls {@link invalidate}.
 */
const MEMBER_CACHE_TTL_MS = 15_000;

@Injectable()
export class TeamAccessService {
  private readonly memberCache = new Map<string, { member: TeamMember; expiresAt: number }>();
  private readonly inFlight = new Map<string, Promise<TeamMember | null>>();

  constructor(private readonly prisma: PrismaService) {}

  /** Forget cached membership for one user, or for everyone when no id is given. */
  invalidate(userId?: string) {
    if (userId) this.memberCache.delete(userId);
    else this.memberCache.clear();
  }

  async getActiveMember(userId: string, profileName?: string) {
    const synchronizedName = profileName?.trim().slice(0, 120);
    const member = await this.findMember(userId);
    if (!member?.isActive) {
      this.memberCache.delete(userId);
      throw new ForbiddenException('This account is not an active Team member.');
    }

    if (!synchronizedName || synchronizedName === member.name) return member;

    const synced = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.teamMember.updateMany({
        where: { id: member.id, name: member.name, isActive: true },
        data: { name: synchronizedName },
      });
      if (updated.count === 0) {
        const current = await tx.teamMember.findUniqueOrThrow({ where: { id: member.id } });
        if (!current.isActive) throw new ForbiddenException('This account is not an active Team member.');
        return current;
      }

      await tx.activityLog.create({
        data: {
          actorTeamMemberId: member.id,
          eventType: 'TEAM_MEMBER_PROFILE_SYNCED',
          entityType: 'TEAM_MEMBER',
          entityId: member.id,
          metadata: { before: { name: member.name }, after: { name: synchronizedName } },
        },
      });

      return tx.teamMember.findUniqueOrThrow({ where: { id: member.id } });
    }).catch((error: unknown) => {
      this.memberCache.delete(userId);
      throw error;
    });

    this.remember(userId, synced);
    return synced;
  }

  private async findMember(userId: string): Promise<TeamMember | null> {
    const cached = this.memberCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.member;

    const pending = this.inFlight.get(userId);
    if (pending) return pending;

    const lookup = this.prisma.teamMember.findUnique({ where: { userId } })
      .then((member) => {
        if (member?.isActive) this.remember(userId, member);
        else this.memberCache.delete(userId);
        return member;
      })
      .finally(() => {
        this.inFlight.delete(userId);
      });
    this.inFlight.set(userId, lookup);
    return lookup;
  }

  private remember(userId: string, member: TeamMember) {
    if (!member.isActive) {
      this.memberCache.delete(userId);
      return;
    }
    this.memberCache.set(userId, { member, expiresAt: Date.now() + MEMBER_CACHE_TTL_MS });
  }
}
