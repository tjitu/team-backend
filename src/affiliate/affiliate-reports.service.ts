import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AffiliateDatabase } from './affiliate.database';
import { DateRangeDto } from './affiliate.dto';
import type { AffiliateConfig } from './affiliate.types';

@Injectable()
export class AffiliateReportsService {
  constructor(private readonly db: AffiliateDatabase) {}
  async report(id: string, range: DateRangeDto, admin = false) {
    const from = range.from ? new Date(range.from) : new Date('2000-01-01T00:00:00Z');
    const to = range.to ? new Date(range.to) : new Date('2200-01-01T00:00:00Z');
    if (from >= to) throw new BadRequestException('End date must follow start date.');
    await this.db.query(Prisma.sql`SELECT affiliate_ensure_quota(${id})::text`);
    const [profile] = await this.db.query<{ config: AffiliateConfig } & Record<string, unknown>>(Prisma.sql`
      SELECT id,name,identifier,"isActive",affiliate_config(id) AS config,CURRENT_TIMESTAMP AS "serverTime",
        ((date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta') + interval '1 month') AT TIME ZONE 'Asia/Jakarta') AS "nextReset"
      FROM "AffiliateProfile" WHERE id=${id}`);
    const [totals, transactions, codes, quotas, boosts, payouts, trend, terms, agreementStatus] = await Promise.all([
      this.db.query<Record<string, number>>(Prisma.sql`SELECT
        (SELECT count(*)::int FROM "AffiliateCheckout" s JOIN "Payment" p ON p."affiliateCheckoutId"=s.id
          WHERE s."affiliateId"=${id} AND p.status::text='CONFIRMED' AND s."createdAt">=${from} AND s."createdAt"<${to}) AS "successfulReferrals",
        (SELECT COALESCE(sum(s."paidAmount"),0)::float8 FROM "AffiliateCheckout" s JOIN "Payment" p ON p."affiliateCheckoutId"=s.id
          WHERE s."affiliateId"=${id} AND p.status::text='CONFIRMED' AND s."createdAt">=${from} AND s."createdAt"<${to}) AS "generatedSales",
        (SELECT COALESCE(sum(amount),0)::float8 FROM "AffiliateLedger" WHERE "affiliateId"=${id} AND "createdAt">=${from} AND "createdAt"<${to}) AS earned,
        (SELECT COALESCE(sum(s.commission),0)::float8 FROM "AffiliateCheckout" s JOIN "Payment" p ON p."affiliateCheckoutId"=s.id
          WHERE s."affiliateId"=${id} AND p.status::text='PENDING' AND s."expiresAt">CURRENT_TIMESTAMP AND s."createdAt">=${from} AND s."createdAt"<${to}) AS pending,
        (SELECT COALESCE(sum(amount),0)::float8 FROM "AffiliatePayout" WHERE "affiliateId"=${id} AND status='PAID') AS paid,
        (SELECT COALESCE(sum(amount),0)::float8 FROM "AffiliatePayout" WHERE "affiliateId"=${id} AND status='PENDING') AS "reservedPayout",
        (SELECT COALESCE(sum(amount),0)::float8 FROM "AffiliateLedger" WHERE "affiliateId"=${id}) -
        (SELECT COALESCE(sum(amount),0)::float8 FROM "AffiliatePayout" WHERE "affiliateId"=${id} AND status IN ('PAID','PENDING')) AS outstanding`),
      this.db.query(Prisma.sql`SELECT s.*,p."orderId" AS reference,p.status::text AS "paymentStatus",pkg.name AS product,
        COALESCE((SELECT sum(amount) FROM "AffiliateLedger" WHERE "checkoutId"=s.id),0)::float8 AS earned,
        COALESCE((SELECT max("refundTotal") FROM "AffiliateLedger" WHERE "checkoutId"=s.id),0) AS "refundTotal",
        CASE WHEN p.status::text='CONFIRMED' THEN 'EARNED' WHEN p.status::text='PENDING' AND s."expiresAt">CURRENT_TIMESTAMP
          THEN 'PENDING' ELSE 'INELIGIBLE' END AS "commissionStatus"
        FROM "AffiliateCheckout" s JOIN "Payment" p ON p."affiliateCheckoutId"=s.id JOIN "TokenPackage" pkg ON pkg.id=p."tokenPackageId"
        WHERE s."affiliateId"=${id} AND s."createdAt">=${from} AND s."createdAt"<${to}
        ORDER BY s."createdAt" DESC,s.id DESC LIMIT ${range.limit ?? 100} OFFSET ${range.offset ?? 0}`),
      this.db.query(Prisma.sql`SELECT v.id,v.code,v."isActive",v."expiresAt",v."maxUsage",v."usedCount",v."maxDiscount",
        (SELECT count(*)::int FROM "AffiliateCheckout" s JOIN "Payment" p ON p."affiliateCheckoutId"=s.id
          WHERE s."affiliateId"=${id} AND s."voucherId"=v.id AND p.status::text='CONFIRMED') AS "successfulUsage",
        (SELECT COALESCE(sum(s."paidAmount"),0)::float8 FROM "AffiliateCheckout" s JOIN "Payment" p ON p."affiliateCheckoutId"=s.id
          WHERE s."affiliateId"=${id} AND s."voucherId"=v.id AND p.status::text='CONFIRMED') AS sales,
        (SELECT COALESCE(sum(l.amount),0)::float8 FROM "AffiliateLedger" l JOIN "AffiliateCheckout" s ON s.id=l."checkoutId"
          WHERE s."affiliateId"=${id} AND s."voucherId"=v.id) AS earnings
        FROM "Voucher" v WHERE v."affiliateId"=${id} ORDER BY v.code`),
      this.db.query(Prisma.sql`SELECT * FROM "AffiliateQuota" WHERE "affiliateId"=${id}
        AND month=to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta','YYYY-MM') ORDER BY type`),
      this.db.query(Prisma.sql`SELECT b.*,
        (SELECT count(*)::int FROM "AffiliateCheckout" s JOIN "Payment" p ON p."affiliateCheckoutId"=s.id
          WHERE s."boostIds" @> ARRAY[b.id] AND p.status::text='CONFIRMED') AS "successfulTransactions",
        (SELECT count(*)::int FROM "AffiliateCheckout" s LEFT JOIN "Payment" p ON p."affiliateCheckoutId"=s.id
          WHERE s."boostIds" @> ARRAY[b.id] AND (p.status::text='CONFIRMED' OR
            (p.id IS NULL AND s."expiresAt">CURRENT_TIMESTAMP) OR
            (p.id IS NOT NULL AND COALESCE(p.metadata->>'affiliate_terminal','false')<>'true'))) AS "reservedTransactions",
        (SELECT COALESCE(sum(CASE WHEN b."group"='COMMISSION' THEN
          s.commission-round(s."paidAmount"::numeric*s."baseCommission"/10000)::int
          ELSE greatest(0,s."discountAmount"-round(s."originalAmount"::numeric*s."baseDiscount"/10000)::int) END),0)::float8
          FROM "AffiliateCheckout" s JOIN "Payment" p ON p."affiliateCheckoutId"=s.id
          WHERE s."boostIds" @> ARRAY[b.id] AND p.status::text='CONFIRMED') AS impact
        FROM "AffiliateBoost" b WHERE b."affiliateId"=${id} ORDER BY b."activatedAt" DESC LIMIT 200`),
      this.db.query(Prisma.sql`SELECT id,amount,"paidAt",reference,status,"createdAt"${admin ? Prisma.sql`,notes` : Prisma.empty}
        FROM "AffiliatePayout" WHERE "affiliateId"=${id} ORDER BY "paidAt" DESC LIMIT 200`),
      this.db.query(Prisma.sql`SELECT to_char("createdAt" AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD') AS day,
        sum(amount)::float8 AS commission FROM "AffiliateLedger" WHERE "affiliateId"=${id} AND "createdAt">=${from} AND "createdAt"<${to}
        GROUP BY 1 ORDER BY 1`),
      admin ? this.db.query(Prisma.sql`SELECT * FROM "AffiliateTerms" WHERE "affiliateId"=${id} ORDER BY "effectiveAt" DESC`) : Promise.resolve([]),
      this.db.query(Prisma.sql`SELECT g.id,g.version,g."effectiveAt",g.summary,a."acceptedAt",a."contentHash",a.snapshot
        FROM "AffiliateAgreement" g LEFT JOIN "AffiliateAcceptance" a ON a."agreementId"=g.id AND a."affiliateId"=${id}
        WHERE g.status='PUBLISHED' AND (g."requiresAcceptance" OR a.id IS NOT NULL) ORDER BY g.version DESC`),
    ]);
    return { profile, totals: totals[0], transactions, codes, quotas, boosts, payouts, trend, terms, agreementStatus,
      pagination: { limit: range.limit ?? 100, offset: range.offset ?? 0, hasMore: transactions.length === (range.limit ?? 100) } };
  }
}
