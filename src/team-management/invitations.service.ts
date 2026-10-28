import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvitationStatus, Prisma, TeamRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../database/prisma.service';
import { TeamAccessService } from '../team-access/team-access.service';
import { CreateInvitationDto } from './team-management.dto';
import { InvitationMailerService } from './invitation-mailer.service';

const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamAccess: TeamAccessService,
    private readonly mailer: InvitationMailerService,
  ) {}

  async list(userId: string) {
    await this.requireAdmin(userId);
    return this.prisma.teamInvitation.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 500,
    });
  }

  async create(userId: string, input: CreateInvitationDto) {
    const actor = await this.requireAdmin(userId);
    this.requireInviteRole(actor.role, input.role);
    const email = input.email.trim().toLowerCase();
    const activeMember = await this.prisma.teamMember.findUnique({ where: { email } });
    if (activeMember?.isActive) throw new ConflictException('This email already belongs to an active Team member.');

    const existing = await this.prisma.teamInvitation.findFirst({
      where: {
        email,
        status: { in: [InvitationStatus.PENDING, InvitationStatus.SENT] },
        expiresAt: { gt: new Date() },
        revokedAt: null,
        acceptedAt: null,
      },
    });
    if (existing) throw new ConflictException('An active invitation already exists for this email.');

    const token = this.newToken();
    const invitation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.teamInvitation.create({
        data: {
          email,
          role: input.role,
          tokenHash: this.hashToken(token),
          status: InvitationStatus.PENDING,
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
          createdByTeamMemberId: actor.id,
        },
      });
      await tx.activityLog.create({
        data: {
          actorTeamMemberId: actor.id,
          eventType: 'TEAM_INVITATION_CREATED',
          entityType: 'TEAM_INVITATION',
          entityId: created.id,
          metadata: { email, role: input.role },
        },
      });
      return created;
    });

    return this.deliver(invitation, token, actor.name);
  }

  async resend(userId: string, invitationId: string) {
    const actor = await this.requireAdmin(userId);
    const current = await this.prisma.teamInvitation.findUnique({ where: { id: invitationId } });
    if (!current) throw new NotFoundException('Invitation not found.');
    if (current.status === InvitationStatus.ACCEPTED || current.status === InvitationStatus.REVOKED) {
      throw new ConflictException('Accepted or revoked invitations cannot be resent.');
    }
    this.requireInviteRole(actor.role, current.role);

    const token = this.newToken();
    const updated = await this.prisma.$transaction(async (tx) => {
      const invitation = await tx.teamInvitation.update({
        where: { id: current.id },
        data: {
          tokenHash: this.hashToken(token),
          status: InvitationStatus.PENDING,
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
          acceptedAt: null,
          revokedAt: null,
        },
      });
      await tx.activityLog.create({
        data: {
          actorTeamMemberId: actor.id,
          eventType: 'TEAM_INVITATION_RESENT',
          entityType: 'TEAM_INVITATION',
          entityId: invitation.id,
          metadata: { email: invitation.email },
        },
      });
      return invitation;
    });

    return this.deliver(updated, token, actor.name);
  }

  async revoke(userId: string, invitationId: string) {
    const actor = await this.requireAdmin(userId);
    const invitation = await this.prisma.teamInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation) throw new NotFoundException('Invitation not found.');
    if (invitation.status === InvitationStatus.ACCEPTED || invitation.status === InvitationStatus.REVOKED) {
      throw new ConflictException('This invitation is already closed.');
    }
    this.requireInviteRole(actor.role, invitation.role);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.teamInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.REVOKED, revokedAt: new Date() },
      });
      await tx.activityLog.create({
        data: {
          actorTeamMemberId: actor.id,
          eventType: 'TEAM_INVITATION_REVOKED',
          entityType: 'TEAM_INVITATION',
          entityId: invitation.id,
          metadata: { email: invitation.email },
        },
      });
      return { id: updated.id, status: updated.status, revokedAt: updated.revokedAt };
    });
  }

  async accept(user: AuthenticatedUser, token: string) {
    if (!user.email || user.emailVerified !== true) {
      throw new ForbiddenException('Sign in with the invited, verified email address to accept this invitation.');
    }
    const userEmail = this.normalizeEmail(user.email);
    const invitation = await this.prisma.teamInvitation.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });
    if (
      !invitation ||
      (invitation.status !== InvitationStatus.PENDING && invitation.status !== InvitationStatus.SENT) ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date()
    ) {
      throw new NotFoundException('Invitation is invalid or expired.');
    }
    if (userEmail !== this.normalizeEmail(invitation.email)) {
      throw new ForbiddenException('Sign in with the invited email address to accept this invitation.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.teamMember.findUnique({ where: { email: invitation.email } });
        if (existing?.isActive) throw new ConflictException('This email already belongs to an active Team member.');
        if (existing && existing.userId !== user.id) {
          throw new ConflictException('This invitation belongs to a different existing Team identity.');
        }

        const accepted = await tx.teamInvitation.updateMany({
          where: {
            id: invitation.id,
            tokenHash: this.hashToken(token),
            status: { in: [InvitationStatus.PENDING, InvitationStatus.SENT] },
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
        });
        if (accepted.count !== 1) throw new ConflictException('This invitation has already been used or closed.');

        const member = existing
          ? await tx.teamMember.update({
              where: { id: existing.id },
              data: { isActive: true, role: invitation.role, userId: user.id },
            })
          : await tx.teamMember.create({
              data: {
                userId: user.id,
                email: userEmail,
                name: user.name?.trim() || userEmail,
                role: invitation.role,
                isActive: true,
              },
            });
        await tx.activityLog.create({
          data: {
            actorTeamMemberId: member.id,
            eventType: 'TEAM_INVITATION_ACCEPTED',
            entityType: 'TEAM_INVITATION',
            entityId: invitation.id,
            metadata: { email: invitation.email, role: invitation.role },
          },
        });
        return this.publicMember(member);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This identity is already linked to a Team member.');
      }
      throw error;
    }
  }

  private async deliver(
    invitation: { id: string; email: string; role: TeamRole; expiresAt: Date },
    token: string,
    inviterName: string,
  ) {
    const origin = process.env.TEAM_FRONTEND_ORIGIN;
    if (!origin) throw new ConflictException('Team frontend origin is not configured.');
    const link = new URL('/invitations/accept', origin);
    link.searchParams.set('token', token);

    let status: InvitationStatus = InvitationStatus.SENT;
    try {
      await this.mailer.sendInvitation(invitation.email, inviterName, link.toString());
    } catch {
      status = InvitationStatus.FAILED;
    }
    await this.prisma.teamInvitation.updateMany({
      where: { id: invitation.id, status: InvitationStatus.PENDING },
      data: { status },
    });
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status,
      expiresAt: invitation.expiresAt,
    };
  }

  private async requireAdmin(userId: string) {
    const actor = await this.teamAccess.getActiveMember(userId);
    if (actor.role !== TeamRole.SYSTEM_OWNER && actor.role !== TeamRole.SYSTEM_ADMIN) {
      throw new ForbiddenException('System Owner or System Admin access is required.');
    }
    return actor;
  }

  private requireInviteRole(actorRole: TeamRole, invitedRole: TeamRole): void {
    if (invitedRole === TeamRole.SYSTEM_OWNER) {
      throw new ForbiddenException('System Owner status is reserved for the bootstrap process.');
    }
    if (invitedRole === TeamRole.SYSTEM_ADMIN && actorRole !== TeamRole.SYSTEM_OWNER) {
      throw new ForbiddenException('Only the System Owner can invite a System Admin.');
    }
  }

  private newToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private publicMember(member: { id: string; userId: string; email: string; name: string; role: TeamRole; isActive: boolean }) {
    return {
      id: member.id,
      userId: member.userId,
      email: member.email,
      name: member.name,
      role: member.role,
      isActive: member.isActive,
    };
  }
}
