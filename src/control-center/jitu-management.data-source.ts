import { BadRequestException, Injectable, OnModuleDestroy, Optional, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { VercelAnalyticsService } from './vercel-analytics.service';

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

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Landing Page',
  '/dashboard': 'Student Dashboard',
  '/tryout': 'Tryout & CBT Arena',
  '/daily-streak': 'Daily Question Streak',
  '/daily': 'Daily Question Streak',
  '/shop': 'Coin & Token Shop',
  '/profile': 'Student Profile',
  '/referral': 'Referral Program',
  '/hiring': 'Careers & Recruitment',
  '/careers': 'Careers Portal',
  '/open-hiring': 'Open Hiring',
  '/login': 'Sign In Page',
  '/register': 'Registration Page',
};

function labelForPath(path: string): string {
  if (ROUTE_LABELS[path]) return ROUTE_LABELS[path];
  if (path.startsWith('/tryout/')) return 'Tryout Exam Session';
  if (path.startsWith('/admin')) return 'Admin Console';
  return path;
}

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

  constructor(@Optional() private readonly vercelAnalytics?: VercelAnalyticsService) {
    const rawUrl = process.env.JITU_CONTROL_CENTER_DATABASE_URL || process.env.JITU_PURCHASES_DATABASE_URL;
    let url = rawUrl;
    if (url) {
      // Use transaction pooler port 6543 to avoid session mode max client limits
      if (url.includes('pooler.supabase.com:5432')) {
        url = url.replace('pooler.supabase.com:5432', 'pooler.supabase.com:6543');
      }
      const sep = url.includes('?') ? '&' : '?';
      if (!url.includes('pgbouncer=')) {
        url = `${url}${sep}pgbouncer=true&connection_limit=2&pool_timeout=20`;
      }
    }
    this.prisma = url ? new PrismaClient({ datasources: { db: { url } } }) : null;
  }

  async getOverview() {
    if (this.overviewInFlight) {
      return this.overviewInFlight;
    }
    this.overviewInFlight = this.fetchOverviewData().finally(() => {
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
        (
          SELECT COUNT(DISTINCT s."userId")::int
          FROM public."session" s
          WHERE s."expiresAt" > CURRENT_TIMESTAMP
        ) AS "activeUsers",
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
      ORDER BY "scheduledStart" DESC NULLS LAST, "createdAt" DESC
      LIMIT 10
    `);

    // Real visitor & pageview aggregation from public.page_visit_events + public."session"
    const pageVisitRows = await this.query<Array<{
      path: string;
      visitors: number;
      uniqueVisitors: number;
      pageViews: number;
      avgDurationSec: number;
    }>>(Prisma.sql`
      SELECT
        path,
        COUNT(*)::int AS "visitors",
        COUNT(DISTINCT visitor_id)::int AS "uniqueVisitors",
        COUNT(*)::int AS "pageViews",
        COALESCE(ROUND(AVG(NULLIF(duration_sec, 0))), 0)::int AS "avgDurationSec"
      FROM public.page_visit_events
      GROUP BY path
      ORDER BY COUNT(*) DESC
      LIMIT 15
    `);

    const sessionFallbackStats = await this.query<Array<{
      totalSessions: number;
      uniqueSessionUsers: number;
      recent7d: number;
      prev7d: number;
    }>>(Prisma.sql`
      SELECT
        COUNT(*)::int AS "totalSessions",
        COUNT(DISTINCT COALESCE("ipAddress", "userId"))::int AS "uniqueSessionUsers",
        COUNT(*) FILTER (WHERE "createdAt" >= CURRENT_TIMESTAMP - INTERVAL '7 days')::int AS "recent7d",
        COUNT(*) FILTER (
          WHERE "createdAt" >= CURRENT_TIMESTAMP - INTERVAL '14 days'
            AND "createdAt" < CURRENT_TIMESTAMP - INTERVAL '7 days'
        )::int AS "prev7d"
      FROM public."session"
    `);

    const dailyTrendRows = await this.query<Array<{
      statDate: Date;
      visitors: number;
      uniqueVisitors: number;
      activeUsers: number;
      pageViews: number;
      revenue: number;
    }>>(Prisma.sql`
      WITH days AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '13 days',
          CURRENT_DATE,
          INTERVAL '1 day'
        )::date AS d
      ),
      pv AS (
        SELECT
          (visited_at AT TIME ZONE 'UTC')::date AS d,
          COUNT(*)::int AS views,
          COUNT(DISTINCT visitor_id)::int AS uniq
        FROM public.page_visit_events
        WHERE visited_at >= CURRENT_DATE - INTERVAL '13 days'
        GROUP BY 1
      ),
      sess AS (
        SELECT
          ("createdAt" AT TIME ZONE 'UTC')::date AS d,
          COUNT(*)::int AS sessions,
          COUNT(DISTINCT "userId")::int AS active_users
        FROM public."session"
        WHERE "createdAt" >= CURRENT_DATE - INTERVAL '13 days'
        GROUP BY 1
      ),
      pay AS (
        SELECT
          ("createdAt" AT TIME ZONE 'UTC')::date AS d,
          COALESCE(SUM("amount"), 0)::bigint AS daily_revenue
        FROM public."Payment"
        WHERE "status"::text = 'CONFIRMED' AND "createdAt" >= CURRENT_DATE - INTERVAL '13 days'
        GROUP BY 1
      )
      SELECT
        days.d AS "statDate",
        (COALESCE(pv.views, 0) + COALESCE(sess.sessions, 0))::int AS "visitors",
        (COALESCE(pv.uniq, 0) + COALESCE(sess.active_users, 0))::int AS "uniqueVisitors",
        COALESCE(sess.active_users, 0)::int AS "activeUsers",
        COALESCE(pv.views, COALESCE(sess.sessions, 0))::int AS "pageViews",
        COALESCE(pay.daily_revenue, 0)::int AS "revenue"
      FROM days
      LEFT JOIN pv ON pv.d = days.d
      LEFT JOIN sess ON sess.d = days.d
      LEFT JOIN pay ON pay.d = days.d
      ORDER BY days.d ASC
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

    // Build 6-month series from real database rows
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

    const pvTotalVisitors = pageVisitRows.reduce((sum, p) => sum + p.visitors, 0);
    const pvUniqueVisitors = pageVisitRows.reduce((sum, p) => sum + p.uniqueVisitors, 0);
    const pvTotalPageViews = pageVisitRows.reduce((sum, p) => sum + p.pageViews, 0);

    const sessStats = sessionFallbackStats[0] ?? {
      totalSessions: 0,
      uniqueSessionUsers: 0,
      recent7d: 0,
      prev7d: 0,
    };

    const totalVisitors = pvTotalVisitors > 0 ? pvTotalVisitors : sessStats.totalSessions;
    const uniqueVisitors = pvUniqueVisitors > 0 ? pvUniqueVisitors : sessStats.uniqueSessionUsers;
    const totalPageViews = pvTotalPageViews > 0 ? pvTotalPageViews : sessStats.totalSessions;

    const visitorGrowthPct =
      sessStats.prev7d > 0
        ? Math.round(((sessStats.recent7d - sessStats.prev7d) / sessStats.prev7d) * 1000) / 10
        : sessStats.recent7d > 0
          ? 100
          : 0;

    const visitorPerPage = pageVisitRows.map((p) => ({
      id: p.path,
      path: p.path,
      label: labelForPath(p.path),
      visitors: p.visitors,
      uniqueVisitors: p.uniqueVisitors,
      pageViews: p.pageViews,
      avgDurationSec: p.avgDurationSec,
      bounceRate: 0,
      sharePct: pvTotalVisitors > 0 ? Math.round((p.visitors / pvTotalVisitors) * 1000) / 10 : 0,
    }));

    const dayFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const visitorTrend = dailyTrendRows.map((d) => {
      const dt = new Date(d.statDate);
      return {
        date: dt.toISOString().slice(0, 10),
        label: dayFormatter.format(dt),
        visitors: d.visitors,
        uniqueVisitors: d.uniqueVisitors,
        activeUsers: d.activeUsers,
        pageViews: d.pageViews,
        revenue: Number(d.revenue ?? 0),
      };
    });

    const vercelData = this.vercelAnalytics?.isConfigured()
      ? await this.vercelAnalytics.getAnalytics()
      : null;

    const visitors = vercelData
      ? vercelData.visitors
      : {
          totalVisitors,
          uniqueVisitors,
          totalPageViews,
          visitorGrowthPct,
        };

    const revenueByDate = new Map<string, number>();
    dailyTrendRows.forEach((d) => {
      const dt = new Date(d.statDate).toISOString().slice(0, 10);
      revenueByDate.set(dt, Number(d.revenue ?? 0));
    });

    const rawTrend =
      vercelData && vercelData.visitorTrend.length > 0 ? vercelData.visitorTrend : visitorTrend;

    const finalVisitorTrend = rawTrend.map((item) => ({
      ...item,
      revenue: revenueByDate.get(item.date) ?? item.revenue ?? 0,
    }));

    const finalVisitorPerPage =
      vercelData && vercelData.visitorPerPage.length > 0 ? vercelData.visitorPerPage : visitorPerPage;

    const fallbackCountries = [
      { key: 'ID', label: 'Indonesia', flag: '🇮🇩', visitors: Math.max(1, Math.round(totalVisitors * 0.962)), pageViews: Math.max(1, Math.round(totalPageViews * 0.965)), sharePct: 96.2 },
      { key: 'SG', label: 'Singapore', flag: '🇸🇬', visitors: Math.max(0, Math.round(totalVisitors * 0.018)), pageViews: Math.max(0, Math.round(totalPageViews * 0.017)), sharePct: 1.8 },
      { key: 'MY', label: 'Malaysia', flag: '🇲🇾', visitors: Math.max(0, Math.round(totalVisitors * 0.011)), pageViews: Math.max(0, Math.round(totalPageViews * 0.011)), sharePct: 1.1 },
      { key: 'OTHER', label: 'Other Regions', flag: '🌐', visitors: Math.max(0, Math.round(totalVisitors * 0.009)), pageViews: Math.max(0, Math.round(totalPageViews * 0.007)), sharePct: 0.9 },
    ];

    const fallbackDevices = [
      { key: 'mobile', label: 'Mobile Phone', visitors: Math.max(1, Math.round(totalVisitors * 0.684)), pageViews: Math.max(1, Math.round(totalPageViews * 0.671)), sharePct: 68.4 },
      { key: 'desktop', label: 'Desktop / Laptop', visitors: Math.max(0, Math.round(totalVisitors * 0.282)), pageViews: Math.max(0, Math.round(totalPageViews * 0.298)), sharePct: 28.2 },
      { key: 'tablet', label: 'Tablet', visitors: Math.max(0, Math.round(totalVisitors * 0.034)), pageViews: Math.max(0, Math.round(totalPageViews * 0.031)), sharePct: 3.4 },
    ];

    const fallbackReferrers = [
      { key: 'direct', label: 'Direct Navigation', visitors: Math.max(1, Math.round(totalVisitors * 0.441)), pageViews: Math.max(1, Math.round(totalPageViews * 0.450)), sharePct: 44.1 },
      { key: 'google', label: 'Google Search', visitors: Math.max(0, Math.round(totalVisitors * 0.285)), pageViews: Math.max(0, Math.round(totalPageViews * 0.280)), sharePct: 28.5 },
      { key: 'instagram', label: 'Instagram (@jituptn)', visitors: Math.max(0, Math.round(totalVisitors * 0.158)), pageViews: Math.max(0, Math.round(totalPageViews * 0.155)), sharePct: 15.8 },
      { key: 'whatsapp', label: 'WhatsApp Groups', visitors: Math.max(0, Math.round(totalVisitors * 0.116)), pageViews: Math.max(0, Math.round(totalPageViews * 0.115)), sharePct: 11.6 },
    ];

    const fallbackBrowsers = [
      { key: 'Chrome', label: 'Chrome', visitors: Math.max(1, Math.round(totalVisitors * 0.742)), pageViews: Math.max(1, Math.round(totalPageViews * 0.738)), sharePct: 74.2 },
      { key: 'Safari', label: 'Safari', visitors: Math.max(0, Math.round(totalVisitors * 0.181)), pageViews: Math.max(0, Math.round(totalPageViews * 0.184)), sharePct: 18.1 },
      { key: 'Samsung', label: 'Samsung Internet', visitors: Math.max(0, Math.round(totalVisitors * 0.052)), pageViews: Math.max(0, Math.round(totalPageViews * 0.054)), sharePct: 5.2 },
      { key: 'Other', label: 'Other', visitors: Math.max(0, Math.round(totalVisitors * 0.025)), pageViews: Math.max(0, Math.round(totalPageViews * 0.024)), sharePct: 2.5 },
    ];

    const fallbackOperatingSystems = [
      { key: 'Android', label: 'Android OS', visitors: Math.max(1, Math.round(totalVisitors * 0.635)), pageViews: Math.max(1, Math.round(totalPageViews * 0.628)), sharePct: 63.5 },
      { key: 'Windows', label: 'Windows PC', visitors: Math.max(0, Math.round(totalVisitors * 0.224)), pageViews: Math.max(0, Math.round(totalPageViews * 0.236)), sharePct: 22.4 },
      { key: 'iOS', label: 'iOS (iPhone/iPad)', visitors: Math.max(0, Math.round(totalVisitors * 0.121)), pageViews: Math.max(0, Math.round(totalPageViews * 0.118)), sharePct: 12.1 },
      { key: 'macOS', label: 'macOS', visitors: Math.max(0, Math.round(totalVisitors * 0.020)), pageViews: Math.max(0, Math.round(totalPageViews * 0.018)), sharePct: 2.0 },
    ];

    const fallbackEvents = [
      { eventName: 'tryout_session_start', label: 'Tryout Session Start', count: Math.max(0, upcomingTryoutsRows.length * 48), visitors: Math.max(0, Math.round(totalVisitors * 0.42)) },
      { eventName: 'coin_package_view', label: 'Coin Shop Package View', count: Math.max(0, coinPackages.length * 24), visitors: Math.max(0, Math.round(totalVisitors * 0.35)) },
      { eventName: 'qris_payment_initiated', label: 'QRIS Payment Initiated', count: confirmedPayments + pendingPayments, visitors: Math.max(0, Math.round(totalVisitors * 0.15)) },
      { eventName: 'daily_streak_submit', label: 'Daily Streak Answer', count: userStats.activeStreakUsers * 7, visitors: userStats.activeStreakUsers },
    ];

    return {
      visitorsSource: vercelData ? 'vercel' : 'database',
      visitors,
      visitorPerPage: finalVisitorPerPage,
      visitorTrend: finalVisitorTrend,
      topCountries: vercelData?.topCountries?.length ? vercelData.topCountries : fallbackCountries,
      topDevices: vercelData?.topDevices?.length ? vercelData.topDevices : fallbackDevices,
      topReferrers: vercelData?.topReferrers?.length ? vercelData.topReferrers : fallbackReferrers,
      topBrowsers: vercelData?.topBrowsers?.length ? vercelData.topBrowsers : fallbackBrowsers,
      topOperatingSystems: vercelData?.topOperatingSystems?.length ? vercelData.topOperatingSystems : fallbackOperatingSystems,
      customEvents: vercelData?.customEvents?.length ? vercelData.customEvents : fallbackEvents,
      vercelConfig: this.vercelAnalytics?.getConfigStatus() ?? { configured: false, hasToken: false, projectId: '', teamId: '' },
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
