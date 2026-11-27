import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AffiliateDatabase } from './affiliate.database';
import { AffiliateIdentityService } from './affiliate-identity.service';

@Injectable()
export class AffiliateAccessService {
  constructor(private readonly team: PrismaService, private readonly db: AffiliateDatabase, private readonly identities: AffiliateIdentityService) {}
  async member(userId: string) {
    const member = await this.team.teamMember.findUnique({ where: { userId } });
    if (!member?.isActive) throw new ForbiddenException('Active Team membership required.');
    return member;
  }
  async admin(userId: string, owner = false) {
    const member = await this.member(userId);
    if (member.role !== 'SYSTEM_OWNER' && (owner || member.role !== 'SYSTEM_ADMIN')) {
      throw new ForbiddenException(owner ? 'System Owner access required.' : 'Administrator access required.');
    }
    return member;
  }
  async self(userId: string, agreementRequired = true) {
    const member = await this.member(userId);
    if (member.role !== 'AFFILIATOR') throw new ForbiddenException('Affiliator access required.');
    if (agreementRequired) await this.db.query(Prisma.sql`SELECT affiliate_require_accepted(${member.id})::text`);
    return member;
  }
  async target(userId: string, id: string) {
    const actor = await this.admin(userId);
    const target = await this.team.teamMember.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Affiliator not found.');
    if (target.role !== 'AFFILIATOR') {
      const history=await this.db.query<{ id: string }>(Prisma.sql`SELECT id FROM "AffiliateProfile" WHERE id=${target.id}`);
      if (!history.length) throw new NotFoundException('Affiliator not found.');
    }
    return { actor, target };
  }
}
