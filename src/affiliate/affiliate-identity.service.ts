import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AffiliateDatabase } from './affiliate.database';
import type { AffiliateIdentity } from './affiliate.types';

@Injectable()
export class AffiliateIdentityService {
  constructor(private readonly db: AffiliateDatabase) {}
  async disable(id: string) {
    await this.db.query(Prisma.sql`UPDATE "AffiliateProfile" SET "isActive"=false WHERE id=${id} RETURNING id`);
  }
  async sync(member: AffiliateIdentity) {
    const active = member.isActive && member.role === 'AFFILIATOR';
    // Only affiliates have a Main DB identity. Preserve historical profiles when
    // a role is changed; disabling never deletes earnings or accepted documents.
    if (member.role !== 'AFFILIATOR') {
      await this.db.query(Prisma.sql`UPDATE "AffiliateProfile" SET "isActive" = false WHERE id = ${member.id} RETURNING id`);
      return;
    }
    await this.db.database().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${member.id},721562702))`;
      await tx.$executeRaw`INSERT INTO "AffiliateProfile" (id,"userId",name,identifier,"isActive")
        VALUES (${member.id},${member.userId},${member.name},${member.email},${active})
        ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,identifier=EXCLUDED.identifier,"isActive"=EXCLUDED."isActive"`;
      await tx.$executeRaw`INSERT INTO "AffiliateTerms" (id,"affiliateId",config,"effectiveAt")
        SELECT gen_random_uuid()::text,${member.id},config,CURRENT_TIMESTAMP FROM "AffiliateDefaults"
        WHERE id='default' AND NOT EXISTS (SELECT 1 FROM "AffiliateTerms" WHERE "affiliateId"=${member.id})`;
    });
  }
}

@Global()
@Module({ providers: [AffiliateIdentityService], exports: [AffiliateIdentityService] })
export class AffiliateIdentityModule {}
