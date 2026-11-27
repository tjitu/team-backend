import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { AuthenticatedRequest } from '../auth/authenticated-user';
import { AffiliateAgreementsService } from './affiliate-agreements.service';
import { AgreementDto } from './affiliate.dto';

@Controller('team/affiliate/agreements')
@UseGuards(SessionGuard)
export class AffiliateAgreementsController {
  constructor(private readonly agreements: AffiliateAgreementsService) {}
  @Get()
  list(@Req() req: AuthenticatedRequest) { return this.agreements.list(req.user.id); }
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() input: AgreementDto) { return this.agreements.create(req.user.id,input); }
  @Patch(':id')
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: AgreementDto) {
    return this.agreements.update(req.user.id,id,input);
  }
  @Post(':id/publish')
  publish(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.agreements.publish(req.user.id,id); }
  @Get(':id/preview')
  preview(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query('affiliateId') affiliateId: string) {
    return this.agreements.preview(req.user.id,id,affiliateId);
  }
}
