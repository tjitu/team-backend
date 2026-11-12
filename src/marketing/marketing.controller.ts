import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/authenticated-user';
import { SessionGuard } from '../auth/session.guard';
import {
  CreateMarketingPartnershipDto,
  CreatePartnershipTaskDto,
  ImportMarketingPartnershipsDto,
  ListMarketingPartnershipsQueryDto,
  UpdateMarketingPartnershipDto,
} from './marketing.dto';
import { MarketingService } from './marketing.service';

@Controller('team/marketing/partnerships')
@UseGuards(SessionGuard)
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListMarketingPartnershipsQueryDto,
  ) {
    return this.marketing.listPartnerships(request.user.id, query);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateMarketingPartnershipDto,
  ) {
    return this.marketing.createPartnership(request.user.id, body);
  }

  @Post('import')
  importRows(
    @Req() request: AuthenticatedRequest,
    @Body() body: ImportMarketingPartnershipsDto,
  ) {
    return this.marketing.importPartnerships(request.user.id, body);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateMarketingPartnershipDto,
  ) {
    return this.marketing.updatePartnership(request.user.id, id, body);
  }

  @Delete(':id')
  archive(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.marketing.archivePartnership(request.user.id, id);
  }

  @Post(':id/task')
  createTask(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: CreatePartnershipTaskDto,
  ) {
    return this.marketing.createPartnershipTask(request.user.id, id, body);
  }
}
