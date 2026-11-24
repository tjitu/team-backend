import { Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseBoolPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/authenticated-user';
import { SessionGuard } from '../auth/session.guard';
import { CreateTryoutControlDto, UpdateTryoutControlDto } from './control-center.dto';
import { ControlCenterService } from './control-center.service';

@Controller('team/control-center/tryouts')
@UseGuards(SessionGuard)
export class TryoutsController {
  constructor(private readonly controlCenter: ControlCenterService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.controlCenter.listTryouts(request.user.id);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateTryoutControlDto) {
    return this.controlCenter.createTryout(request.user.id, body);
  }

  @Get(':id/participants')
  participants(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.controlCenter.listTryoutParticipants(request.user.id, id);
  }

  @Post(':id/participants/:attemptId/reset')
  resetParticipant(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Param('attemptId') attemptId: string) {
    return this.controlCenter.resetTryoutParticipant(request.user.id, id, attemptId);
  }

  @Patch(':id')
  update(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateTryoutControlDto) {
    return this.controlCenter.updateTryout(request.user.id, id, body);
  }

  @Delete(':id')
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('force', new DefaultValuePipe(false), ParseBoolPipe) force: boolean,
  ) {
    return this.controlCenter.deleteTryout(request.user.id, id, force);
  }
}
