import { BadRequestException, Global, Injectable, Module, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class AffiliateDatabase implements OnModuleDestroy {
  private readonly client: PrismaClient | null;
  constructor() {
    const url = process.env.JITU_CONTROL_CENTER_DATABASE_URL || process.env.JITU_PURCHASES_DATABASE_URL;
    this.client = url ? new PrismaClient({ datasources: { db: { url } } }) : null;
  }
  database() {
    if (!this.client) throw new ServiceUnavailableException('Main database is not configured for the affiliate program.');
    return this.client;
  }
  async query<T>(sql: Prisma.Sql, client: Prisma.TransactionClient = this.database()): Promise<T[]> {
    try { return await client.$queryRaw<T[]>(sql); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010') {
        const message = String(error.meta?.message || 'Affiliate operation failed.');
        if (String(error.meta?.code) === 'P0001') throw new BadRequestException(message.replace(/^ERROR:\s*/, ''));
      }
      throw error;
    }
  }
  async audit(tx: Prisma.TransactionClient, actorId: string, event: string, entityId: string, before: unknown, after: unknown) {
    await tx.$executeRaw`INSERT INTO "AffiliateAudit" (id,"actorId",event,"entityId",before,after)
      VALUES (gen_random_uuid()::text,${actorId},${event},${entityId},${JSON.stringify(before)}::jsonb,${JSON.stringify(after)}::jsonb)`;
  }
  async onModuleDestroy() { await this.client?.$disconnect(); }
}

@Global()
@Module({ providers: [AffiliateDatabase], exports: [AffiliateDatabase] })
export class AffiliateDatabaseModule {}
