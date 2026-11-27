import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AffiliateDatabase } from './affiliate.database';
import { AffiliateAccessService } from './affiliate-access.service';
import { AffiliateReportsService } from './affiliate-reports.service';
import { BonusDto, BoostDto, ConfigDto, DateRangeDto, PayoutDto, PayoutStatusDto } from './affiliate.dto';

@Injectable()
export class AffiliateService {
  constructor(private readonly db: AffiliateDatabase, private readonly access: AffiliateAccessService, private readonly reports: AffiliateReportsService) {}
  async overview(userId: string, query: DateRangeDto) {
    const member = await this.access.self(userId);
    return this.reports.report(member.id, query);
  }
  async activate(userId: string, input: BoostDto) {
    const member = await this.access.self(userId);
    const [row] = await this.db.query<{ result: unknown }>(Prisma.sql`SELECT affiliate_activate(${member.id},${input.type},${input.requestKey}) AS result`);
    return row.result;
  }
  async list(userId: string) {
    await this.access.admin(userId);
    return this.db.query(Prisma.sql`SELECT p.*,affiliate_config(p.id) AS config,
      (SELECT COALESCE(sum(amount),0)::float8 FROM "AffiliateLedger" WHERE "affiliateId"=p.id) AS earned,
      (SELECT COALESCE(sum(amount),0)::float8 FROM "AffiliatePayout" WHERE "affiliateId"=p.id AND status='PAID') AS paid,
      (SELECT count(*)::int FROM "AffiliateCheckout" s JOIN "Payment" x ON x."affiliateCheckoutId"=s.id
        WHERE s."affiliateId"=p.id AND x.status::text='CONFIRMED') AS referrals,
      (SELECT COALESCE(sum(s."paidAmount"),0)::float8 FROM "AffiliateCheckout" s JOIN "Payment" x ON x."affiliateCheckoutId"=s.id
        WHERE s."affiliateId"=p.id AND x.status::text='CONFIRMED') AS sales,
      EXISTS (SELECT 1 FROM "AffiliateAgreement" g JOIN "AffiliateAcceptance" a ON a."agreementId"=g.id AND a."affiliateId"=p.id
        WHERE g.id=(SELECT id FROM "AffiliateAgreement" WHERE status='PUBLISHED' AND "requiresAcceptance"
          AND "effectiveAt"<=CURRENT_TIMESTAMP ORDER BY version DESC LIMIT 1)) AS "agreementAccepted"
      FROM "AffiliateProfile" p ORDER BY name,id`);
  }
  async detail(userId: string, id: string, query: DateRangeDto) {
    await this.access.target(userId, id);
    const result = await this.reports.report(id, query, true);
    const audit = await this.db.query(Prisma.sql`SELECT * FROM "AffiliateAudit" WHERE "entityId"=${id} OR "actorId"=${id}
      OR after->>'affiliateId'=${id} OR before->>'affiliateId'=${id} ORDER BY "createdAt" DESC LIMIT 200`);
    return { ...result, audit };
  }
  async agreementOptions(userId: string) {
    await this.access.admin(userId);
    return this.db.query(Prisma.sql`SELECT id,version,title,"effectiveAt" FROM "AffiliateAgreement"
      WHERE status='PUBLISHED' AND "requiresAcceptance" ORDER BY version DESC`);
  }
  async configure(userId: string, id: string, input: ConfigDto) {
    const { actor } = await this.access.target(userId,id);
    await this.db.query(Prisma.sql`SELECT affiliate_configure(${id},${JSON.stringify(input.config)}::jsonb,
      ${new Date(input.effectiveAt)},${input.agreementId},${actor.id})::text`);
    return { saved: true };
  }
  async bonus(userId: string, id: string, input: BonusDto) {
    const { actor } = await this.access.target(userId,id);
    await this.db.query(Prisma.sql`SELECT affiliate_bonus(${id},${input.type},${input.quantity}::integer,${actor.id},${input.requestKey})::text`);
    return { saved: true };
  }
  async payout(userId: string, id: string, input: PayoutDto) {
    const { actor } = await this.access.target(userId,id);
    const [row] = await this.db.query<{ result: unknown }>(Prisma.sql`SELECT affiliate_payout(${id},${input.amount}::integer,
      ${new Date(input.paidAt)},${input.reference.trim()},${input.status},${input.notes},${input.requestKey},${actor.id}) AS result`);
    return row.result;
  }
  async payoutStatus(userId: string, id: string, input: PayoutStatusDto) {
    const actor = await this.access.admin(userId);
    await this.db.query(Prisma.sql`SELECT affiliate_payout_status(${id},${input.status},${actor.id})::text`);
    return { saved: true };
  }
}
