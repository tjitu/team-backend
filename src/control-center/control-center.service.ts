import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TeamRole } from '@prisma/client';
import { TeamAccessService } from '../team-access/team-access.service';
import { REVENUE_DATA_SOURCE, RevenueDataSource } from './revenue-data-source';
import { HiringApplicationInput, JITU_MANAGEMENT_DATA_SOURCE, JituManagementDataSource, ManagedUserInput, PackageInput, TryoutInput } from './jitu-management.data-source';

@Injectable()
export class ControlCenterService {
  constructor(
    private readonly teamAccess: TeamAccessService,
    @Inject(REVENUE_DATA_SOURCE) private readonly revenue: RevenueDataSource,
    @Inject(JITU_MANAGEMENT_DATA_SOURCE) private readonly jituManagement: JituManagementDataSource,
  ) {}

  async getRevenue(userId: string) {
    const member = await this.teamAccess.getActiveMember(userId);
    this.assertAdministrator(member.role);
    return this.revenue.getSummary();
  }

  async listTryouts(userId: string) {
    await this.requireAdministrator(userId);
    return this.jituManagement.listTryouts();
  }

  async createTryout(userId: string, input: TryoutInput & Required<Pick<TryoutInput, 'title' | 'solutionPrice' | 'batch' | 'releaseDate' | 'scheduledStart' | 'scheduledEnd'>>) {
    await this.requireAdministrator(userId);
    const start = new Date(input.scheduledStart).getTime();
    const end = new Date(input.scheduledEnd).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      throw new BadRequestException('Tryout end time must be after its start time.');
    }
    return this.jituManagement.createTryout(input);
  }

  async updateTryout(userId: string, id: string, input: TryoutInput) {
    await this.requireAdministrator(userId);
    const result = await this.jituManagement.updateTryout(id, input);
    if (!result) throw new NotFoundException('Tryout not found.');
    return result;
  }

  async listPackages(userId: string) {
    await this.requireAdministrator(userId);
    return this.jituManagement.listPackages();
  }

  async listUsers(userId: string, search = '') {
    await this.requireAdministrator(userId);
    return this.jituManagement.listUsers(search);
  }

  async updateUser(userId: string, targetUserId: string, input: ManagedUserInput) {
    const member = await this.requireAdministrator(userId);
    if (input.role !== undefined && member.role !== TeamRole.SYSTEM_OWNER) {
      throw new ForbiddenException('Only a System Owner can change a Jitu user role.');
    }
    const result = await this.jituManagement.updateUser(targetUserId, input);
    if (!result) throw new NotFoundException('User not found.');
    return result;
  }

  async listHiringApplications(userId: string, search = '') {
    await this.requireAdministrator(userId);
    return this.jituManagement.listHiringApplications(search);
  }

  async updateHiringApplication(userId: string, applicationId: string, input: HiringApplicationInput) {
    await this.requireAdministrator(userId);
    const result = await this.jituManagement.updateHiringApplication(applicationId, input);
    if (!result) throw new NotFoundException('Career application not found.');
    return result;
  }

  async createPackage(userId: string, input: PackageInput & Required<Pick<PackageInput, 'name' | 'tokenAmount' | 'price'>>) {
    await this.requireAdministrator(userId);
    return this.jituManagement.createPackage(input);
  }

  async updatePackage(userId: string, id: string, input: PackageInput) {
    await this.requireAdministrator(userId);
    const result = await this.jituManagement.updatePackage(id, input);
    if (!result) throw new NotFoundException('Package not found.');
    return result;
  }

  private async requireAdministrator(userId: string) {
    const member = await this.teamAccess.getActiveMember(userId);
    this.assertAdministrator(member.role);
    return member;
  }

  private assertAdministrator(role: TeamRole) {
    if (role !== TeamRole.SYSTEM_OWNER && role !== TeamRole.SYSTEM_ADMIN) {
      throw new ForbiddenException('System administrator access is required.');
    }
  }
}
