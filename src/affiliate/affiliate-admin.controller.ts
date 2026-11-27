import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { AuthenticatedRequest } from '../auth/authenticated-user';
import { AffiliateService } from './affiliate.service';
import { BonusDto, ConfigDto, DateRangeDto, PayoutDto, PayoutStatusDto } from './affiliate.dto';

@Controller('team/affiliate/admin')
@UseGuards(SessionGuard)
export class AffiliateAdminController {
  constructor(private readonly affiliate: AffiliateService) {}
  @Get()
  list(@Req() req: AuthenticatedRequest) { return this.affiliate.list(req.user.id); }
  @Get('agreement-options')
  agreements(@Req() req: AuthenticatedRequest) { return this.affiliate.agreementOptions(req.user.id); }
  @Get(':id')
  detail(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query() query: DateRangeDto) {
    return this.affiliate.detail(req.user.id,id,query);
  }
  @Post(':id/config')
  configure(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: ConfigDto) {
    return this.affiliate.configure(req.user.id,id,input);
  }
  @Post(':id/bonus')
  bonus(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: BonusDto) {
    return this.affiliate.bonus(req.user.id,id,input);
  }
  @Post(':id/payouts')
  payout(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: PayoutDto) {
    return this.affiliate.payout(req.user.id,id,input);
  }
  @Patch('payouts/:id/status')
  payoutStatus(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: PayoutStatusDto) {
    return this.affiliate.payoutStatus(req.user.id,id,input);
  }
}
