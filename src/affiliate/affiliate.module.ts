import { Module } from '@nestjs/common';
import { AffiliateAccessService } from './affiliate-access.service';
import { AffiliateReportsService } from './affiliate-reports.service';
import { AffiliateAgreementsService } from './affiliate-agreements.service';
import { AffiliateService } from './affiliate.service';
import { AffiliateSelfController } from './affiliate-self.controller';
import { AffiliateAdminController } from './affiliate-admin.controller';
import { AffiliateAgreementsController } from './affiliate-agreements.controller';

@Module({
  controllers: [AffiliateSelfController, AffiliateAdminController, AffiliateAgreementsController],
  providers: [AffiliateAccessService, AffiliateReportsService, AffiliateAgreementsService, AffiliateService],
})
export class AffiliateModule {}
