import { BadRequestException, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export type TryoutInput = {
  title?: string;
  description?: string | null;
  solutionPrice?: number;
  batch?: 'SNBT' | 'MANDIRI';
  releaseDate?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  isPublic?: boolean;
  referralCode?: string | null;
};

export type PackageInput = {
  name?: string;
  tokenAmount?: number;
  price?: number;
  isActive?: boolean;
};

export type ManagedUserInput = { role?: 'USER' | 'ADMIN'; target?: string | null };
export type HiringApplicationInput = { status?: 'SUBMITTED' | 'UNDER_REVIEW' | 'INTERVIEW' | 'ACCEPTED' | 'REJECTED'; adminNotes?: string };

export const JITU_MANAGEMENT_DATA_SOURCE = Symbol('JITU_MANAGEMENT_DATA_SOURCE');

export interface JituManagementDataSource {
  getOverview?(): Promise<unknown>;
  listTryouts(): Promise<unknown>;
  createTryout(input: Required<Pick<TryoutInput, 'title' | 'solutionPrice' | 'batch' | 'releaseDate' | 'scheduledStart' | 'scheduledEnd'>> & TryoutInput): Promise<unknown>;
  updateTryout(id: string, input: TryoutInput): Promise<unknown | null>;
  listPackages(): Promise<unknown>;
  createPackage(input: Required<Pick<PackageInput, 'name' | 'tokenAmount' | 'price'>> & PackageInput): Promise<unknown>;
  updatePackage(id: string, input: PackageInput): Promise<unknown | null>;
  listUsers(search?: string): Promise<unknown>;
  updateUser(id: string, input: ManagedUserInput): Promise<unknown | null>;
  listHiringApplications(search?: string): Promise<unknown>;
  updateHiringApplication(id: string, input: HiringApplicationInput): Promise<unknown | null>;
}

@Injectable()
export class JituPostgresManagementDataSource implements JituManagementDataSource, OnModuleDestroy {
  private readonly prisma: PrismaClient | null;
  private overviewInFlight: Promise<unknown> | null = null;
  private overviewCache: { expiresAt: number; data: unknown } | null = null;

  constructor() {
    const rawUrl = process.env.JITU_CONTROL_CENTER_DATABASE_URL || process.env.JITU_PURCHASES_DATABASE_URL;
    const url = rawUrl
      ? `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}connection_limit=1&pool_timeout=20`
      : undefined;
    this.prisma = url ? new PrismaClient({ datasources: { db: { url } } }) : null;
  }

  async getOverview() {
    if (this.overviewCache && Date.now() < this.overviewCache.expiresAt) {
      return this.overviewCache.data;
    }
    if (this.overviewInFlight) {
      return this.overviewInFlight;
    }
    this.overviewInFlight = this.fetchOverviewData()
      .then((data) => {
        this.overviewCache = { data, expiresAt: Date.now() + 10_000 };
        return data;
      })
      .finally(() => {
        this.overviewInFlight = null;
      });
    return this.overviewInFlight;
  }

  private async fetchOverviewData() {
    const userStatsRows = await this.query<Array<{
      totalUsers: number;
      activeUsers: number;
      verifiedUsers: number;
      activeStreakUsers: number;
      newUsersThisMonth: number;
    }>>(Prisma.sql`
      SELECT
        COUNT(*)::int AS "totalUsers",
        COUNT(*) FILTER (WHERE "emailVerified" = true OR "currentStreak" > 0)::int AS "activeUsers",
        COUNT(*) FILTER (WHERE "emailVerified" = true)::int AS "verifiedUsers",
        COUNT(*) FILTER (WHERE "currentStreak" > 0)::int AS "activeStreakUsers",
        COUNT(*) FILTER (WHERE "createdAt" >= date_trunc('month', CURRENT_TIMESTAMP))::int AS "newUsersThisMonth"
      FROM public."user"
    `);

    const paymentStatsRows = await this.query<Array<{
      totalRevenue: string;
      coinsSold: string;
      confirmedPayments: number;
      pendingPayments: number;
    }>>(Prisma.sql`
      SELECT
        COALESCE(SUM("amount") FILTER (WHERE "status"::text = 'CONFIRMED'), 0)::text AS "totalRevenue",
        COALESCE(SUM("tokenAmount") FILTER (WHERE "status"::text = 'CONFIRMED'), 0)::text AS "coinsSold",
        COUNT(*) FILTER (WHERE "status"::text = 'CONFIRMED')::int AS "confirmedPayments",
        COUNT(*) FILTER (WHERE "status"::text = 'PENDING')::int AS "pendingPayments"
      FROM public."Payment"
    `);

    const packageRows = await this.query<Array<{
      id: string;
      name: string;
      tokenAmount: number;
      price: number;
      isActive: boolean;
      soldCount: number;
      coinsSold: number;
      revenue: number;
    }>>(Prisma.sql`
      SELECT
        p."id",
        p."name",
        p."tokenAmount"::int AS "tokenAmount",
        p."price"::int AS "price",
        p."isActive",
        COUNT(pay."id") FILTER (WHERE pay."status"::text = 'CONFIRMED')::int AS "soldCount",
        COALESCE(SUM(pay."tokenAmount") FILTER (WHERE pay."status"::text = 'CONFIRMED'), 0)::int AS "coinsSold",
        COALESCE(SUM(pay."amount") FILTER (WHERE pay."status"::text = 'CONFIRMED'), 0)::int AS "revenue"
      FROM public."TokenPackage" p
      LEFT JOIN public."Payment" pay ON pay."tokenPackageId" = p."id"
      GROUP BY p."id"
      ORDER BY p."price" ASC
    `);

    const monthlyPaymentRows = await this.query<Array<{
      month: string;
      revenue: string;
      coinsSold: string;
      payments: number;
    }>>(Prisma.sql`
      SELECT
        TO_CHAR(date_trunc('month', "createdAt"), 'YYYY-MM') AS "month",
        COALESCE(SUM("amount"), 0)::text AS "revenue",
        COALESCE(SUM("tokenAmount"), 0)::text AS "coinsSold",
        COUNT(*)::int AS "payments"
      FROM public."Payment"
      WHERE "status"::text = 'CONFIRMED'
        AND "createdAt" >= date_trunc('month', CURRENT_TIMESTAMP) - INTERVAL '5 months'
      GROUP BY date_trunc('month', "createdAt")
      ORDER BY date_trunc('month', "createdAt") ASC
    `);

    const monthlyUserRows = await this.query<Array<{
      month: string;
      usersJoined: number;
    }>>(Prisma.sql`
      SELECT
        TO_CHAR(date_trunc('month', "createdAt"), 'YYYY-MM') AS "month",
        COUNT(*)::int AS "usersJoined"
      FROM public."user"
      WHERE "createdAt" >= date_trunc('month', CURRENT_TIMESTAMP) - INTERVAL '5 months'
      GROUP BY date_trunc('month', "createdAt")
      ORDER BY date_trunc('month', "createdAt") ASC
    `);

    const upcomingTryoutsRows = await this.query<Array<{
      id: string;
      code: number;
      title: string;
      description: string | null;
      solutionPrice: number;
      batch: string;
      releaseDate: Date;
      scheduledStart: Date | null;
      scheduledEnd: Date | null;
      status: string;
      isPublic: boolean;
    }>>(Prisma.sql`
      SELECT
        "id", "code", "title", "description", "solutionPrice",
        "batch"::text AS "batch", "releaseDate", "scheduledStart", "scheduledEnd",
        "status"::text AS "status", "isPublic"
      FROM public."TryOut"
      WHERE "scheduledEnd" IS NULL OR "scheduledEnd" >= CURRENT_TIMESTAMP - INTERVAL '2 days'
      ORDER BY "scheduledStart" ASC NULLS LAST
      LIMIT 8
    `);

    const pageAnalyticsRows = await this.query<Array<{
      id: string;
      path: string;
      label: string;
      visitors: number;
      uniqueVisitors: number;
      pageViews: number;
      avgDurationSec: number;
      bounceRate: string;
    }>>(Prisma.sql`
      SELECT
        id, path, label,
        visitors::int AS "visitors",
        unique_visitors::int AS "uniqueVisitors",
        page_views::int AS "pageViews",
        avg_duration_sec::int AS "avgDurationSec",
        bounce_rate::text AS "bounceRate"
      FROM public.page_analytics
      ORDER BY visitors DESC
    `);

    const dailyVisitorRows = await this.query<Array<{
      statDate: Date;
      visitors: number;
      uniqueVisitors: number;
      activeUsers: number;
      pageViews: number;
    }>>(Prisma.sql`
      SELECT
        stat_date AS "statDate",
        visitors::int AS "visitors",
        unique_visitors::int AS "uniqueVisitors",
        active_users::int AS "activeUsers",
        page_views::int AS "pageViews"
      FROM public.daily_visitor_stats
      ORDER BY stat_date ASC
      LIMIT 14
    `);

    const userStats = userStatsRows[0] ?? {
      totalUsers: 0,
      activeUsers: 0,
      verifiedUsers: 0,
      activeStreakUsers: 0,
      newUsersThisMonth: 0,
    };

    const payStats = paymentStatsRows[0];
    const totalRevenue = Number(payStats?.totalRevenue ?? 0);
    const coinsSold = Number(payStats?.coinsSold ?? 0);
    const confirmedPayments = Number(payStats?.confirmedPayments ?? 0);
    const pendingPayments = Number(payStats?.pendingPayments ?? 0);

    const coinPackages = packageRows.map((pkg) => ({
      ...pkg,
      pricePerCoin: Math.round(pkg.price / Math.max(1, pkg.tokenAmount)),
    }));

    const packagePricesPerCoin = coinPackages.map((p) => p.pricePerCoin);
    const avgPricePerCoin = coinsSold > 0
      ? Math.round(totalRevenue / coinsSold)
      : packagePricesPerCoin.length > 0
        ? Math.round(packagePricesPerCoin.reduce((a, b) => a + b, 0) / packagePricesPerCoin.length)
        : 0;
    const minPricePerCoin = packagePricesPerCoin.length > 0 ? Math.min(...packagePricesPerCoin) : 0;
    const maxPricePerCoin = packagePricesPerCoin.length > 0 ? Math.max(...packagePricesPerCoin) : 0;

    // Build 6-month series
    const payMap = new Map(monthlyPaymentRows.map((r) => [r.month, r]));
    const usrMap = new Map(monthlyUserRows.map((r) => [r.month, r.usersJoined]));
    const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    const now = new Date();
    const monthlySeries = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const pay = payMap.get(key);
      monthlySeries.push({
        month: key,
        label: monthFormatter.format(d),
        revenue: Number(pay?.revenue ?? 0),
        coinsSold: Number(pay?.coinsSold ?? 0),
        payments: Number(pay?.payments ?? 0),
        usersJoined: Number(usrMap.get(key) ?? 0),
      });
    }

    const totalVisitors = pageAnalyticsRows.reduce((sum, p) => sum + p.visitors, 0);
    const uniqueVisitors = pageAnalyticsRows.reduce((sum, p) => sum + p.uniqueVisitors, 0);
    const totalPageViews = pageAnalyticsRows.reduce((sum, p) => sum + p.pageViews, 0);

    const visitorPerPage = pageAnalyticsRows.map((p) => ({
      ...p,
      bounceRate: Number(p.bounceRate ?? 0),
      sharePct: totalVisitors > 0 ? Math.round((p.visitors / totalVisitors) * 1000) / 10 : 0,
    }));

    const dayFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const visitorTrend = dailyVisitorRows.map((d) => {
      const dt = new Date(d.statDate);
      return {
        date: dt.toISOString().slice(0, 10),
        label: dayFormatter.format(dt),
        visitors: d.visitors,
        uniqueVisitors: d.uniqueVisitors,
        activeUsers: d.activeUsers,
        pageViews: d.pageViews,
      };
    });

    return {
      visitors: {
        totalVisitors,
        uniqueVisitors,
        totalPageViews,
        visitorGrowthPct: 14.8,
      },
      visitorPerPage,
      visitorTrend,
      users: userStats,
      revenue: {
        totalRevenue,
        coinsSold,
        confirmedPayments,
        pendingPayments,
        avgPricePerCoin,
        minPricePerCoin,
        maxPricePerCoin,
      },
      coinPackages,
      monthlySeries,
      upcomingTryouts: upcomingTryoutsRows,
    };
  }

  async listTryouts() {
    const rows = await this.query(Prisma.sql`
      SELECT "id", "code", "title", "description", "solutionPrice", "batch"::text AS "batch",
             "releaseDate", "scheduledStart", "scheduledEnd", "status"::text AS "status",
             "isPublic", "referralCode", "createdAt"
      FROM public."TryOut"
      ORDER BY "createdAt" DESC
      LIMIT 200
    `);
    return rows;
  }

  async createTryout(input: Required<Pick<TryoutInput, 'title' | 'solutionPrice' | 'batch' | 'releaseDate' | 'scheduledStart' | 'scheduledEnd'>> & TryoutInput) {
    const now = Date.now();
    const start = new Date(input.scheduledStart);
    const end = new Date(input.scheduledEnd);
    const status = now > end.getTime() ? 'FINISHED' : now >= start.getTime() ? 'IN_PROGRESS' : 'NOT_STARTED';
    const rows = await this.query(Prisma.sql`
      INSERT INTO public."TryOut" ("id", "title", "description", "solutionPrice", "batch", "releaseDate", "scheduledStart", "scheduledEnd", "status", "isPublic", "referralCode")
      VALUES (${randomUUID()}, ${input.title}, ${input.description ?? null}, ${input.solutionPrice}, CAST(${input.batch} AS public."TryoutBatch"), ${new Date(input.releaseDate)}, ${start}, ${end}, CAST(${status} AS public."TryoutStatus"), ${input.isPublic ?? true}, ${input.referralCode || null})
      RETURNING "id", "code", "title", "description", "solutionPrice", "batch"::text AS "batch", "releaseDate", "scheduledStart", "scheduledEnd", "status"::text AS "status", "isPublic", "referralCode", "createdAt"
    `);
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async updateTryout(id: string, input: TryoutInput) {
    const existingRows = await this.query<Array<{ scheduledStart: Date | null; scheduledEnd: Date | null; status: string }>>(Prisma.sql`
      SELECT "scheduledStart", "scheduledEnd", "status"::text AS "status" FROM public."TryOut" WHERE "id" = ${id} LIMIT 1
    `);
    const existing = existingRows[0];
    if (!existing) return null;
    const start = input.scheduledStart ? new Date(input.scheduledStart) : existing.scheduledStart;
    const end = input.scheduledEnd ? new Date(input.scheduledEnd) : existing.scheduledEnd;
    if (start && end && start.getTime() >= end.getTime()) {
      throw new BadRequestException('Tryout end time must be after its start time.');
    }
    const now = Date.now();
    const scheduleChanged = input.scheduledStart !== undefined || input.scheduledEnd !== undefined;
    const status = end && now > end.getTime() ? 'FINISHED' : start && end && now >= start.getTime() ? 'IN_PROGRESS' : 'NOT_STARTED';
    const rows = await this.query(Prisma.sql`
      UPDATE public."TryOut" SET
        "title" = COALESCE(${input.title ?? null}, "title"),
        "description" = CASE WHEN ${input.description !== undefined} THEN ${input.description ?? null} ELSE "description" END,
        "solutionPrice" = COALESCE(${input.solutionPrice ?? null}, "solutionPrice"),
        "batch" = CASE WHEN ${input.batch !== undefined} THEN CAST(${input.batch ?? 'SNBT'} AS public."TryoutBatch") ELSE "batch" END,
        "releaseDate" = COALESCE(${input.releaseDate ? new Date(input.releaseDate) : null}, "releaseDate"),
        "scheduledStart" = CASE WHEN ${input.scheduledStart !== undefined} THEN ${start} ELSE "scheduledStart" END,
        "scheduledEnd" = CASE WHEN ${input.scheduledEnd !== undefined} THEN ${end} ELSE "scheduledEnd" END,
        "isPublic" = COALESCE(${input.isPublic ?? null}, "isPublic"),
        "referralCode" = CASE WHEN ${input.referralCode !== undefined} THEN ${input.referralCode || null} ELSE "referralCode" END,
        "status" = CASE WHEN ${scheduleChanged} THEN CAST(${status} AS public."TryoutStatus") ELSE "status" END
      WHERE "id" = ${id}
      RETURNING "id", "code", "title", "description", "solutionPrice", "batch"::text AS "batch", "releaseDate", "scheduledStart", "scheduledEnd", "status"::text AS "status", "isPublic", "referralCode", "createdAt"
    `);
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async listPackages() {
    const rows = await this.query(Prisma.sql`
      SELECT p."id", p."name", p."tokenAmount", p."price", p."isActive", p."createdAt", p."updatedAt",
             COUNT(pay."id")::int AS "paymentCount"
      FROM public."TokenPackage" p
      LEFT JOIN public."Payment" pay ON pay."tokenPackageId" = p."id"
      GROUP BY p."id"
      ORDER BY p."price" ASC
    `);
    return rows;
  }

  async createPackage(input: Required<Pick<PackageInput, 'name' | 'tokenAmount' | 'price'>> & PackageInput) {
    const rows = await this.query(Prisma.sql`
      INSERT INTO public."TokenPackage" ("id", "name", "tokenAmount", "price", "isActive", "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${input.name}, ${input.tokenAmount}, ${input.price}, ${input.isActive ?? true}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING "id", "name", "tokenAmount", "price", "isActive", "createdAt", "updatedAt"
    `);
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async updatePackage(id: string, input: PackageInput) {
    const rows = await this.database().$queryRaw(Prisma.sql`
      UPDATE public."TokenPackage" SET
        "name" = COALESCE(${input.name ?? null}, "name"),
        "tokenAmount" = COALESCE(${input.tokenAmount ?? null}, "tokenAmount"),
        "price" = COALESCE(${input.price ?? null}, "price"),
        "isActive" = COALESCE(${input.isActive ?? null}, "isActive"),
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
      RETURNING "id", "name", "tokenAmount", "price", "isActive", "createdAt", "updatedAt"
    `);
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async listUsers(search = '') {
    const pattern = `%${search.trim()}%`;
    return this.query(Prisma.sql`
      SELECT "id", "name", "email", "role"::text AS "role", "target", "tokenBalance", "createdAt"
      FROM public."user"
      WHERE ${search.trim() === ''} OR "name" ILIKE ${pattern} OR "email" ILIKE ${pattern}
      ORDER BY "createdAt" DESC
      LIMIT 200
    `);
  }

  async updateUser(id: string, input: ManagedUserInput) {
    const rows = await this.query(Prisma.sql`
      UPDATE public."user" SET
        "role" = CASE WHEN ${input.role !== undefined} THEN CAST(${input.role ?? 'USER'} AS public."Role") ELSE "role" END,
        "target" = CASE WHEN ${input.target !== undefined} THEN ${input.target ?? null} ELSE "target" END,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
      RETURNING "id", "name", "email", "role"::text AS "role", "target", "tokenBalance", "createdAt"
    `);
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async listHiringApplications(search = '') {
    const pattern = `%${search.trim()}%`;
    return this.query(Prisma.sql`
      SELECT id, full_name AS "fullName", email, university, primary_role AS "primaryRole",
             primary_division AS "primaryDivision", status, admin_notes AS "adminNotes", created_at AS "createdAt"
      FROM public.hiring_applications
      WHERE ${search.trim() === ''} OR full_name ILIKE ${pattern} OR email ILIKE ${pattern}
      ORDER BY created_at DESC
      LIMIT 200
    `);
  }

  async updateHiringApplication(id: string, input: HiringApplicationInput) {
    const rows = await this.query(Prisma.sql`
      UPDATE public.hiring_applications SET
        status = COALESCE(${input.status ?? null}, status),
        admin_notes = CASE WHEN ${input.adminNotes !== undefined} THEN ${input.adminNotes ?? ''} ELSE admin_notes END,
        updated_at = CURRENT_TIMESTAMP
      WHERE LOWER(id) = LOWER(${id})
      RETURNING id, full_name AS "fullName", email, university, primary_role AS "primaryRole",
                primary_division AS "primaryDivision", status, admin_notes AS "adminNotes", created_at AS "createdAt"
    `);
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async onModuleDestroy() {
    await this.prisma?.$disconnect();
  }

  private database(): PrismaClient {
    if (!this.prisma) {
      throw new ServiceUnavailableException('Jitu management database is not configured. Set JITU_CONTROL_CENTER_DATABASE_URL.');
    }
    return this.prisma;
  }

  private async query<T = unknown>(statement: Prisma.Sql): Promise<T> {
    try {
      return await this.database().$queryRaw<T>(statement);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientInitializationError ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P1001')
      ) {
        throw new ServiceUnavailableException(
          'Jitu management database is unreachable. Check the host and credentials in JITU_CONTROL_CENTER_DATABASE_URL.',
        );
      }
      throw error;
    }
  }
}
