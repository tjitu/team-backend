import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/authenticated-user';
import { SessionGuard } from '../auth/session.guard';
import { ControlCenterService } from './control-center.service';

@Controller('team/control-center')
@UseGuards(SessionGuard)
export class ControlCenterController {
  constructor(private readonly controlCenter: ControlCenterService) {}

  @Get('revenue')
  getRevenue(@Req() request: AuthenticatedRequest) {
    return this.controlCenter.getRevenue(request.user.id);
  }
}
