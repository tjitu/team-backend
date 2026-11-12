import { Module } from '@nestjs/common';
import { TeamAccessModule } from '../team-access/team-access.module';
import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';

@Module({
  imports: [TeamAccessModule],
  controllers: [MarketingController],
  providers: [MarketingService],
})
export class MarketingModule {}
