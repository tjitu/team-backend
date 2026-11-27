import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AUTH_PROVIDER } from '../auth/auth-provider';
import type { AuthProvider } from '../auth/auth-provider';
import { PrismaService } from '../database/prisma.service';

/** Default deny for the new role, including all existing operational APIs. */
@Injectable()
export class AffiliatorBoundaryGuard implements CanActivate {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly auth: AuthProvider,
    private readonly prisma: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return true; // Existing controller guards still require sessions.
    const user = await this.auth.getUser(token);
    if (!user) return true;
    const member = await this.prisma.teamMember.findUnique({ where: { userId: user.id }, select: { role: true, isActive: true } });
    if (!member) return true;
    if (!member.isActive) throw new ForbiddenException('Team account is inactive.');
    if (member.role !== 'AFFILIATOR') return true;
    const path = request.path.replace(/^\/api\//, '/');
    const allowed = (request.method === 'GET' && path === '/team/me') ||
      path === '/team/affiliate/me' || path.startsWith('/team/affiliate/me/');
    if (!allowed) throw new ForbiddenException('Affiliator access is limited to your affiliate workspace.');
    return true;
  }
}
