import { Module } from '@nestjs/common';
import { TeamAccessModule } from '../team-access/team-access.module';
import { ControlCenterController } from './control-center.controller';
import { ControlCenterService } from './control-center.service';
import { JituPaymentRevenueSource } from './jitu-payment-revenue-source';
import { REVENUE_DATA_SOURCE } from './revenue-data-source';
import { JITU_MANAGEMENT_DATA_SOURCE, JituPostgresManagementDataSource } from './jitu-management.data-source';

@Module({
  imports: [TeamAccessModule],
  controllers: [ControlCenterController],
  providers: [
    ControlCenterService,
    JituPaymentRevenueSource,
    JituPostgresManagementDataSource,
    { provide: JITU_MANAGEMENT_DATA_SOURCE, useExisting: JituPostgresManagementDataSource },
    { provide: REVENUE_DATA_SOURCE, useExisting: JituPaymentRevenueSource },
  ],
})
export class ControlCenterModule {}
