import { Module } from '@nestjs/common';
import { TeamAccessModule } from '../team-access/team-access.module';
import { InvitationsController } from './invitations.controller';
import { InvitationMailerService } from './invitation-mailer.service';
import { InvitationsService } from './invitations.service';
import { TeamMembersController } from './team-members.controller';
import { TeamMembersService } from './team-members.service';

@Module({
  imports: [TeamAccessModule],
  controllers: [InvitationsController, TeamMembersController],
  providers: [InvitationMailerService, InvitationsService, TeamMembersService],
})
export class TeamManagementModule {}
