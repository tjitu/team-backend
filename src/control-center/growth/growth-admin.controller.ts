import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../auth/session.guard';
import { AuthenticatedRequest } from '../../auth/authenticated-user';
import { GrowthAdminService } from './growth-admin.service';
import { GrowthConfigurationDto, GrowthQueueQuery, GrowthReviewDto } from './growth.dto';

@Controller('team/control-center')
@UseGuards(SessionGuard)
export class GrowthAdminController {
  constructor(private readonly growth: GrowthAdminService) {}
  @Get('tryout-growth/defaults')
  defaults(@Req() r: AuthenticatedRequest) { return this.growth.defaults(r.user.id); }
  @Get('tryouts/:id/growth')
  config(@Req() r: AuthenticatedRequest, @Param('id') id: string) { return this.growth.configuration(r.user.id, id); }
  @Patch('tryouts/:id/growth')
  configure(@Req() r: AuthenticatedRequest, @Param('id') id: string, @Body() body: GrowthConfigurationDto) { return this.growth.configure(r.user.id, id, body); }
  @Get('tryouts/:id/registrations')
  list(@Req() r: AuthenticatedRequest, @Param('id') id: string, @Query() query: GrowthQueueQuery) { return this.growth.list(r.user.id, id, query); }
  @Get('tryouts/:id/registrations/:registrationId')
  detail(@Req() r: AuthenticatedRequest, @Param('id') id: string, @Param('registrationId') registration: string) { return this.growth.detail(r.user.id, id, registration); }
  @Post('tryouts/:id/registrations/:registrationId/review')
  review(@Req() r: AuthenticatedRequest, @Param('id') id: string, @Param('registrationId') registration: string, @Body() body: GrowthReviewDto) {
    return this.growth.review(r.user.id, id, registration, body);
  }
  @Get('tryouts/:id/growth/analytics')
  analytics(@Req() r: AuthenticatedRequest, @Param('id') id: string) { return this.growth.analytics(r.user.id, id); }
}
