import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AffiliateAccessService } from './affiliate-access.service';
import { AffiliateDatabase } from './affiliate.database';
import { AcceptDto, AgreementDto } from './affiliate.dto';
import type { Acceptance, AffiliateConfig, Agreement } from './affiliate.types';
import { AGREEMENT_VARIABLES, hashContent, renderAgreement } from './agreement-renderer';

@Injectable()
export class AffiliateAgreementsService {
  constructor(private readonly db: AffiliateDatabase, private readonly access: AffiliateAccessService) {}

  async list(userId: string) {
    await this.access.admin(userId, true);
    return this.db.query<Agreement>(Prisma.sql`SELECT * FROM "AffiliateAgreement" ORDER BY version DESC`);
  }
  async create(userId: string, input: AgreementDto) {
    const actor = await this.access.admin(userId, true);
    this.validateVariables(input.content);
    return this.db.database().$transaction(async tx => {
      // Serialize version allocation; never derive a version on the client.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(721562701)`;
      const [row] = await this.db.query<Agreement>(Prisma.sql`INSERT INTO "AffiliateAgreement"
        (id,version,title,content,party,summary,"effectiveAt","requiresAcceptance")
        SELECT gen_random_uuid()::text,COALESCE(max(version),0)+1,${input.title},${input.content},${input.party},${input.summary},
          ${input.effectiveAt ? new Date(input.effectiveAt) : null},${input.requiresAcceptance} FROM "AffiliateAgreement" RETURNING *`, tx);
      await this.db.audit(tx, actor.id, 'AGREEMENT_DRAFT_CREATED', row.id, null, row);
      return row;
    });
  }
  async update(userId: string, id: string, input: AgreementDto) {
    const actor = await this.access.admin(userId, true);
    this.validateVariables(input.content);
    return this.db.database().$transaction(async tx => {
      const [before] = await this.db.query<Agreement>(Prisma.sql`SELECT * FROM "AffiliateAgreement" WHERE id=${id} FOR UPDATE`, tx);
      if (!before) throw new NotFoundException('Agreement not found.');
      if (before.status !== 'DRAFT') throw new ConflictException('Create a new version to change a published agreement.');
      const [after] = await this.db.query<Agreement>(Prisma.sql`UPDATE "AffiliateAgreement" SET title=${input.title},content=${input.content},
        party=${input.party},summary=${input.summary},"effectiveAt"=${input.effectiveAt ? new Date(input.effectiveAt) : null},
        "requiresAcceptance"=${input.requiresAcceptance} WHERE id=${id} RETURNING *`, tx);
      await this.db.audit(tx, actor.id, 'AGREEMENT_DRAFT_UPDATED', id, before, after);
      return after;
    });
  }
  async publish(userId: string, id: string) {
    const actor = await this.access.admin(userId, true);
    return this.db.database().$transaction(async tx => {
      const [before] = await this.db.query<Agreement>(Prisma.sql`SELECT * FROM "AffiliateAgreement" WHERE id=${id} FOR UPDATE`, tx);
      if (!before) throw new NotFoundException('Agreement not found.');
      if (before.status !== 'DRAFT') throw new ConflictException('Agreement is already published.');
      if (!before.party.trim() || !before.effectiveAt || /\[OWNER_REVIEW|\[.*(?:TODO|TBD).*\]/i.test(before.content)) {
        throw new BadRequestException('Complete the contracting party, effective date, and all Owner review placeholders before publishing.');
      }
      this.validateVariables(before.content);
      const [after] = await this.db.query<Agreement>(Prisma.sql`UPDATE "AffiliateAgreement" SET status='PUBLISHED',"publishedAt"=CURRENT_TIMESTAMP
        WHERE id=${id} RETURNING *`, tx);
      await this.db.audit(tx, actor.id, 'AGREEMENT_PUBLISHED', id, before, after);
      return after;
    });
  }
  async state(userId: string) {
    const member = await this.access.self(userId, false);
    const [agreements, history] = await Promise.all([
      this.db.query<Agreement>(Prisma.sql`SELECT * FROM "AffiliateAgreement" WHERE status='PUBLISHED' ORDER BY version DESC`),
      this.db.query<Acceptance>(Prisma.sql`SELECT * FROM "AffiliateAcceptance" WHERE "affiliateId"=${member.id} ORDER BY "acceptedAt" DESC`),
    ]);
    const [{ now }] = await this.db.query<{ now: Date }>(Prisma.sql`SELECT CURRENT_TIMESTAMP AS now`);
    const required = agreements.find(a => a.requiresAcceptance && a.effectiveAt && a.effectiveAt <= now);
    const needsRequired = !required || !history.some(a => a.agreementId===required.id);
    const current = needsRequired && required ? required : agreements.find(a => a.effectiveAt && a.effectiveAt<=now) ?? agreements[0] ?? null;
    const preview = current ? await this.previewFor(member, current) : null;
    return { member: { id: member.id, name: member.name, identifier: member.email }, current, preview,
      required: needsRequired, history,
      upcoming: agreements.filter(a => a.effectiveAt && a.effectiveAt > now), serverTime: now.toISOString() };
  }
  async preview(userId: string, id: string, affiliateId: string) {
    const { target } = await this.access.target(userId, affiliateId);
    const [agreement] = await this.db.query<Agreement>(Prisma.sql`SELECT * FROM "AffiliateAgreement" WHERE id=${id}`);
    if (!agreement) throw new NotFoundException('Agreement not found.');
    return this.previewFor(target, agreement);
  }
  async accept(userId: string, input: AcceptDto) {
    if (!input.acknowledged) throw new BadRequestException('Agreement acknowledgment is required.');
    const member = await this.access.self(userId, false);
    return this.db.database().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "AffiliateProfile" WHERE id=${member.id} AND "isActive" FOR UPDATE`;
      const [existing] = await this.db.query<Acceptance>(Prisma.sql`SELECT * FROM "AffiliateAcceptance"
        WHERE "affiliateId"=${member.id} AND "agreementId"=${input.agreementId}`, tx);
      if (existing) return existing;
      const [agreement] = await this.db.query<Agreement>(Prisma.sql`SELECT * FROM "AffiliateAgreement"
        WHERE id=${input.agreementId} AND status='PUBLISHED' FOR SHARE`, tx);
      if (!agreement) throw new NotFoundException('Published agreement not found.');
      const preview = await this.previewFor(member, agreement, tx);
      if (preview.hash !== input.previewHash) throw new ConflictException('Agreement details changed. Reload and read the updated agreement.');
      const [{ now }] = await this.db.query<{ now: Date }>(Prisma.sql`SELECT CURRENT_TIMESTAMP AS now`, tx);
      const snapshot = renderAgreement(agreement, member, preview.config, now.toISOString());
      const identity = { id: member.id, userId: member.userId, name: member.name, identifier: member.email };
      const [accepted] = await this.db.query<Acceptance>(Prisma.sql`INSERT INTO "AffiliateAcceptance"
        (id,"affiliateId","agreementId",version,snapshot,identity,"contentHash","acceptedAt")
        VALUES (gen_random_uuid()::text,${member.id},${agreement.id},${agreement.version},${snapshot},
          ${JSON.stringify(identity)}::jsonb,${hashContent(snapshot)},${now}) RETURNING *`, tx);
      await this.db.audit(tx, member.id, 'AGREEMENT_ACCEPTED', agreement.id, null, { acceptanceId: accepted.id, hash: accepted.contentHash });
      return accepted;
    });
  }
  private async previewFor(member: { id: string; name: string; email: string }, agreement: Agreement, tx?: Prisma.TransactionClient) {
    const [row] = await this.db.query<{ config: AffiliateConfig }>(Prisma.sql`SELECT COALESCE(
      (SELECT config FROM "AffiliateTerms" WHERE "affiliateId"=${member.id} AND "agreementId"=${agreement.id}
        ORDER BY "createdAt" DESC,id DESC LIMIT 1),affiliate_config(${member.id})) AS config`, tx);
    const content = renderAgreement(agreement, member, row.config);
    return { content, hash: hashContent(content), config: row.config };
  }
  private validateVariables(content: string) {
    const unknown = [...content.matchAll(/\{\{([^}]+)\}\}/g)].map(match => match[1]).filter(key => !AGREEMENT_VARIABLES.includes(key));
    if (unknown.length) throw new BadRequestException(`Unknown agreement variables: ${unknown.join(', ')}`);
  }
}
