import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { MonthlyRevenue, RevenueDataSource, RevenueSummary } from './revenue-data-source';

type RevenueAggregateRow = {
  totalRevenue: string;
  confirmedPayments: string;
  pendingPayments: string;
};

type MonthlyRevenueRow = {
  month: string;
  revenue: string;
  confirmedPayments: string;
};

@Injectable()
export class JituPaymentRevenueSource implements RevenueDataSource, OnModuleDestroy {
  private readonly prisma: PrismaClient | null;

  constructor() {
    const url = process.env.JITU_PURCHASES_DATABASE_URL;
    this.prisma = url ? new PrismaClient({ datasources: { db: { url } } }) : null;
  }

  async getSummary(): Promise<RevenueSummary> {
    if (!this.prisma) return this.emptySummary(false);

    const [aggregates, monthlyRows] = await Promise.all([
      this.prisma.$queryRaw<RevenueAggregateRow[]>(Prisma.sql`
        SELECT
          COALESCE(SUM("amount") FILTER (WHERE "status"::text = 'CONFIRMED'), 0)::text AS "totalRevenue",
          COUNT(*) FILTER (WHERE "status"::text = 'CONFIRMED')::text AS "confirmedPayments",
          COUNT(*) FILTER (WHERE "status"::text = 'PENDING')::text AS "pendingPayments"
        FROM public."Payment"
      `),
      this.prisma.$queryRaw<MonthlyRevenueRow[]>(Prisma.sql`
        SELECT
          TO_CHAR(date_trunc('month', "createdAt"), 'YYYY-MM') AS "month",
          SUM("amount")::text AS "revenue",
          COUNT(*)::text AS "confirmedPayments"
        FROM public."Payment"
        WHERE "status"::text = 'CONFIRMED'
          AND "createdAt" >= date_trunc('month', CURRENT_TIMESTAMP) - INTERVAL '11 months'
        GROUP BY date_trunc('month', "createdAt")
        ORDER BY date_trunc('month', "createdAt") ASC
      `),
    ]);

    const values = new Map(monthlyRows.map((row) => [row.month, row]));
    const monthlyRevenue: MonthlyRevenue[] = [];
    const month = new Date();
    month.setUTCDate(1);
    month.setUTCHours(0, 0, 0, 0);
    for (let offset = 11; offset >= 0; offset -= 1) {
      const date = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - offset, 1));
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      const value = values.get(key);
      monthlyRevenue.push({
        month: key,
        revenue: Number(value?.revenue ?? 0),
        confirmedPayments: Number(value?.confirmedPayments ?? 0),
      });
    }

    const aggregate = aggregates[0];
    return {
      configured: true,
      totalRevenue: Number(aggregate?.totalRevenue ?? 0),
      confirmedPayments: Number(aggregate?.confirmedPayments ?? 0),
      pendingPayments: Number(aggregate?.pendingPayments ?? 0),
      monthlyRevenue,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma?.$disconnect();
  }

  private emptySummary(configured: boolean): RevenueSummary {
    const month = new Date();
    month.setUTCDate(1);
    const monthlyRevenue: MonthlyRevenue[] = [];
    for (let offset = 11; offset >= 0; offset -= 1) {
      const date = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - offset, 1));
      monthlyRevenue.push({
        month: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
        revenue: 0,
        confirmedPayments: 0,
      });
    }
    return { configured, totalRevenue: 0, confirmedPayments: 0, pendingPayments: 0, monthlyRevenue };
  }
}
