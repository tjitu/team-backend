import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/authenticated-user';
import { SessionGuard } from '../auth/session.guard';
import { TeamAccessService } from './team-access.service';

@Controller('team/me')
@UseGuards(SessionGuard)
export class TeamAccessController {
  constructor(private readonly teamAccess: TeamAccessService) {}

  @Get()
  async getCurrentMember(@Req() request: AuthenticatedRequest) {
    const member = await this.teamAccess.getActiveMember(request.user.id);
    return {
      id: member.id,
      userId: member.userId,
      email: member.email,
      name: member.name,
      role: member.role,
    };
  }
}
