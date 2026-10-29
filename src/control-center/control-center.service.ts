import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { TeamRole } from '@prisma/client';
import { TeamAccessService } from '../team-access/team-access.service';
import { REVENUE_DATA_SOURCE, RevenueDataSource } from './revenue-data-source';

@Injectable()
export class ControlCenterService {
  constructor(
    private readonly teamAccess: TeamAccessService,
    @Inject(REVENUE_DATA_SOURCE) private readonly revenue: RevenueDataSource,
  ) {}

  async getRevenue(userId: string) {
    const member = await this.teamAccess.getActiveMember(userId);
    if (member.role !== TeamRole.SYSTEM_OWNER && member.role !== TeamRole.SYSTEM_ADMIN) {
      throw new ForbiddenException('System administrator access is required.');
    }
    return this.revenue.getSummary();
  }
}
