import { Module } from '@nestjs/common';
import { TeamAccessModule } from '../team-access/team-access.module';
import { ControlCenterController } from './control-center.controller';
import { TryoutsController } from './tryouts.controller';
import { PublicArticlesController } from './public-articles.controller';
import { ControlCenterService } from './control-center.service';
import { JituPaymentRevenueSource } from './jitu-payment-revenue-source';
import { REVENUE_DATA_SOURCE } from './revenue-data-source';
import { JITU_MANAGEMENT_DATA_SOURCE, JituPostgresManagementDataSource } from './jitu-management.data-source';
import { VercelAnalyticsService } from './vercel-analytics.service';
import { AffiliateReferralService } from '../affiliate/affiliate-referral.service';
import { GrowthAdminController } from './growth/growth-admin.controller';
import { GrowthAdminService } from './growth/growth-admin.service';

@Module({
  imports: [TeamAccessModule],
  controllers: [ControlCenterController, TryoutsController, PublicArticlesController, GrowthAdminController],
  providers: [
    ControlCenterService,
    GrowthAdminService,
    AffiliateReferralService,
    VercelAnalyticsService,
    JituPaymentRevenueSource,
    JituPostgresManagementDataSource,
    { provide: JITU_MANAGEMENT_DATA_SOURCE, useExisting: JituPostgresManagementDataSource },
    { provide: REVENUE_DATA_SOURCE, useExisting: JituPaymentRevenueSource },
  ],
})
export class ControlCenterModule {}
