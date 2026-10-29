import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TeamAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveMember(userId: string, profileName?: string) {
    const member = await this.prisma.teamMember.findUnique({ where: { userId } });
    if (!member?.isActive) {
      throw new ForbiddenException('This account is not an active Team member.');
    }

    const synchronizedName = profileName?.trim().slice(0, 120);
    if (!synchronizedName || synchronizedName === member.name) return member;

    return this.prisma.$transaction(async (tx) => {
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
    });
  }
}
