import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { AuthenticatedRequest } from '../auth/authenticated-user';
import { AffiliateService } from './affiliate.service';
import { AffiliateAgreementsService } from './affiliate-agreements.service';
import { AcceptDto, BoostDto, DateRangeDto } from './affiliate.dto';

@Controller('team/affiliate/me')
@UseGuards(SessionGuard)
export class AffiliateSelfController {
  constructor(private readonly affiliate: AffiliateService, private readonly agreements: AffiliateAgreementsService) {}
  @Get()
  overview(@Req() req: AuthenticatedRequest, @Query() query: DateRangeDto) {
    return this.affiliate.overview(req.user.id,query);
  }
  @Post('boosts')
  activate(@Req() req: AuthenticatedRequest, @Body() input: BoostDto) {
    return this.affiliate.activate(req.user.id,input);
  }
  @Get('agreement')
  agreement(@Req() req: AuthenticatedRequest) { return this.agreements.state(req.user.id); }
  @Post('agreement/accept')
  accept(@Req() req: AuthenticatedRequest, @Body() input: AcceptDto) { return this.agreements.accept(req.user.id,input); }
}
