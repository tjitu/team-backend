import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/authenticated-user';
import { SessionGuard } from '../auth/session.guard';
import { AcceptInvitationDto, CreateInvitationDto } from './team-management.dto';
import { InvitationsService } from './invitations.service';

@Controller('team/invitations')
@UseGuards(SessionGuard)
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.invitations.list(request.user.id);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() input: CreateInvitationDto) {
    return this.invitations.create(request.user.id, input);
  }

  @Post('accept')
  accept(@Req() request: AuthenticatedRequest, @Body() input: AcceptInvitationDto) {
    return this.invitations.accept(request.user, input.token);
  }

  @Post(':invitationId/resend')
  resend(@Req() request: AuthenticatedRequest, @Param('invitationId') invitationId: string) {
    return this.invitations.resend(request.user.id, invitationId);
  }

  @Post(':invitationId/revoke')
  revoke(@Req() request: AuthenticatedRequest, @Param('invitationId') invitationId: string) {
    return this.invitations.revoke(request.user.id, invitationId);
  }
}
