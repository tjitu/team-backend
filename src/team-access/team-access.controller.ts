import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/authenticated-user';
import { SessionGuard } from '../auth/session.guard';
import { TeamAccessService } from './team-access.service';
import { PrismaService } from '../database/prisma.service';

@Controller('team/me')
@UseGuards(SessionGuard)
export class TeamAccessController {
  constructor(
    private readonly teamAccess: TeamAccessService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async getCurrentMember(@Req() request: AuthenticatedRequest) {
    const member = await this.teamAccess.getActiveMember(request.user.id);
    const departments = await this.prisma.teamMemberDepartment.findMany({
      where: { teamMemberId: member.id, isActive: true, department: { isActive: true } },
      select: { department: { select: { id: true, name: true, slug: true } } },
      orderBy: { department: { name: 'asc' } },
    });
    return {
      id: member.id,
      userId: member.userId,
      email: member.email,
      name: member.name,
      role: member.role,
      departments: departments.map(({ department }) => department),
    };
  }
}
