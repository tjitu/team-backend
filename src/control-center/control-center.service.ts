import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TeamRole } from '@prisma/client';
import { TeamAccessService } from '../team-access/team-access.service';
import { REVENUE_DATA_SOURCE, RevenueDataSource } from './revenue-data-source';
import { ArticleInput, DiscountInput, HiringApplicationInput, JITU_MANAGEMENT_DATA_SOURCE, JituManagementDataSource, ManagedUserInput, PackageInput, TryoutInput, VoucherInput } from './jitu-management.data-source';
import { VercelAnalyticsService } from './vercel-analytics.service';

@Injectable()
export class ControlCenterService {
  constructor(
    private readonly teamAccess: TeamAccessService,
    @Inject(REVENUE_DATA_SOURCE) private readonly revenue: RevenueDataSource,
    @Inject(JITU_MANAGEMENT_DATA_SOURCE) private readonly jituManagement: JituManagementDataSource,
    private readonly vercelAnalytics: VercelAnalyticsService,
  ) {}

  async getOverview(userId: string) {
    // Allow any active team member to view the Overview analytics dashboard
    await this.teamAccess.getActiveMember(userId);
    if (!this.jituManagement.getOverview) {
      return null;
    }
    return this.jituManagement.getOverview();
  }

  async getVercelStatus(userId: string) {
    await this.teamAccess.getActiveMember(userId);
    return this.vercelAnalytics.getConfigStatus();
  }

  async updateVercelConfig(userId: string, input: { token?: string; projectId?: string; teamId?: string }) {
    await this.requireAdministrator(userId);
    const result = await this.vercelAnalytics.testAndSaveCredentials(input);
    this.jituManagement.invalidateOverview?.();
    return result;
  }

  async disconnectVercelConfig(userId: string) {
    await this.requireAdministrator(userId);
    const result = await this.vercelAnalytics.disconnectCredentials();
    this.jituManagement.invalidateOverview?.();
    return result;
  }

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

  async deleteTryout(userId: string, id: string) {
    await this.requireAdministrator(userId);
    const result = await this.jituManagement.deleteTryout(id);
    if (!result) throw new NotFoundException('Tryout not found.');
    this.jituManagement.invalidateOverview?.();
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

  async deleteUser(userId: string, targetUserId: string) {
    await this.requireAdministrator(userId);
    const result = await this.jituManagement.deleteUser(targetUserId);
    if (!result) throw new NotFoundException('User not found.');
    return result;
  }

  async listPayments(userId: string, status?: string, search?: string) {
    await this.requireAdministrator(userId);
    const [summary, payments] = await Promise.all([
      this.jituManagement.getPaymentsSummary(),
      this.jituManagement.listPayments(status, search),
    ]);
    return { summary, payments };
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

  async deletePackage(userId: string, id: string) {
    await this.requireAdministrator(userId);
    const result = await this.jituManagement.deletePackage(id);
    if (!result) throw new NotFoundException('Package not found.');
    this.jituManagement.invalidateOverview?.();
    return result;
  }

  async listDiscounts(userId: string) {
    await this.requireAdministrator(userId);
    return this.jituManagement.listDiscounts();
  }

  async createDiscount(userId: string, input: DiscountInput, userMeta?: { name?: string; email?: string }) {
    await this.requireAdministrator(userId);
    const start = new Date(input.startDate).getTime();
    const end = new Date(input.endDate).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      throw new BadRequestException('Discount end date must be after its start date.');
    }
    return this.jituManagement.createDiscount({
      ...input,
      issuedByUserId: input.issuedByUserId || userId,
      issuedByName: input.issuedByName || userMeta?.name || 'Admin',
      issuedByEmail: input.issuedByEmail || userMeta?.email,
    });
  }

  async updateDiscount(userId: string, id: string, input: Partial<DiscountInput>) {
    await this.requireAdministrator(userId);
    if (input.startDate && input.endDate) {
      const start = new Date(input.startDate).getTime();
      const end = new Date(input.endDate).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
        throw new BadRequestException('Discount end date must be after its start date.');
      }
    }
    const result = await this.jituManagement.updateDiscount(id, input);
    if (!result) throw new NotFoundException('Discount not found.');
    return result;
  }

  async deleteDiscount(userId: string, id: string) {
    await this.requireAdministrator(userId);
    const result = await this.jituManagement.deleteDiscount(id);
    if (!result) throw new NotFoundException('Discount not found.');
    return result;
  }

  async listVouchers(userId: string) {
    await this.requireAdministrator(userId);
    return this.jituManagement.listVouchers();
  }

  async createVoucher(userId: string, input: VoucherInput, userMeta?: { name?: string; email?: string }) {
    await this.requireAdministrator(userId);
    return this.jituManagement.createVoucher({
      ...input,
      issuedByUserId: input.issuedByUserId || userId,
      issuedByName: input.issuedByName || userMeta?.name || 'Admin',
      issuedByEmail: input.issuedByEmail || userMeta?.email,
    });
  }

  async updateVoucher(userId: string, id: string, input: Partial<VoucherInput>) {
    await this.requireAdministrator(userId);
    const result = await this.jituManagement.updateVoucher(id, input);
    if (!result) throw new NotFoundException('Voucher not found.');
    return result;
  }

  async deleteVoucher(userId: string, id: string) {
    await this.requireAdministrator(userId);
    const result = await this.jituManagement.deleteVoucher(id);
    if (!result) throw new NotFoundException('Voucher not found.');
    return result;
  }

  async listArticles(userId: string, search = '', status = '') {
    await this.requireAdministrator(userId);
    return this.jituManagement.listArticles(search, status);
  }

  async getArticle(userId: string, id: string) {
    await this.requireAdministrator(userId);
    const result = await this.jituManagement.getArticle(id);
    if (!result) throw new NotFoundException('Article not found.');
    return result;
  }

  async createArticle(userId: string, input: ArticleInput) {
    await this.requireAdministrator(userId);
    return this.jituManagement.createArticle(input);
  }

  async updateArticle(userId: string, id: string, input: ArticleInput) {
    await this.requireAdministrator(userId);
    const result = await this.jituManagement.updateArticle(id, input);
    if (!result) throw new NotFoundException('Article not found.');
    return result;
  }

  async deleteArticle(userId: string, id: string) {
    await this.requireAdministrator(userId);
    return this.jituManagement.deleteArticle(id);
  }

  async listTopics(userId: string) {
    await this.requireAdministrator(userId);
    return this.jituManagement.listTopics();
  }

  async createTopic(userId: string, input: any) {
    await this.requireAdministrator(userId);
    return this.jituManagement.createTopic(input);
  }

  async updateTopic(userId: string, id: string, input: any) {
    await this.requireAdministrator(userId);
    return this.jituManagement.updateTopic(id, input);
  }

  async deleteTopic(userId: string, id: string) {
    await this.requireAdministrator(userId);
    return this.jituManagement.deleteTopic(id);
  }

  async createSubtopic(userId: string, input: any) {
    await this.requireAdministrator(userId);
    return this.jituManagement.createSubtopic(input);
  }

  async updateSubtopic(userId: string, id: string, input: any) {
    await this.requireAdministrator(userId);
    return this.jituManagement.updateSubtopic(id, input);
  }

  async deleteSubtopic(userId: string, id: string) {
    await this.requireAdministrator(userId);
    return this.jituManagement.deleteSubtopic(id);
  }

  async listQuestions(userId: string, search = '', subtest = '', target = '') {
    await this.requireAdministrator(userId);
    return this.jituManagement.listQuestions(search, subtest, target);
  }

  async createQuestion(userId: string, input: any) {
    await this.requireAdministrator(userId);
    return this.jituManagement.createQuestion(input);
  }

  async updateQuestion(userId: string, id: string, input: any) {
    await this.requireAdministrator(userId);
    const result = await this.jituManagement.updateQuestion(id, input);
    if (!result) throw new NotFoundException('Question not found.');
    return result;
  }

  async deleteQuestion(userId: string, id: string) {
    await this.requireAdministrator(userId);
    const result = await this.jituManagement.deleteQuestion(id);
    if (!result) throw new NotFoundException('Question not found.');
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
