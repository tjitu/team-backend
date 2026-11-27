import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AffiliateIdentityService } from './affiliate-identity.service';

@Injectable()
export class AffiliateReferralService {
  constructor(private readonly team: PrismaService, private readonly identities: AffiliateIdentityService) {}
  async validate(id?: string | null) {
    if (!id) return;
    const member = await this.team.teamMember.findUnique({ where: { id } });
    if (!member?.isActive || member.role !== 'AFFILIATOR') throw new BadRequestException('Assigned member must be an active Affiliator.');
  }
}
