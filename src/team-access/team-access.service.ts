import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TeamAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveMember(userId: string) {
    const member = await this.prisma.teamMember.findUnique({ where: { userId } });
    if (!member?.isActive) {
      throw new ForbiddenException('This account is not an active Team member.');
    }
    return member;
  }
}
