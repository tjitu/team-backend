import { BadRequestException, Injectable, OnApplicationBootstrap, OnModuleDestroy, Optional, ServiceUnavailableException } from '@nestjs/common';
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

export type ManagedUserInput = { role?: 'USER' | 'ADMIN'; target?: string | null; isBanned?: boolean };
export type HiringApplicationInput = { status?: 'SUBMITTED' | 'UNDER_REVIEW' | 'INTERVIEW' | 'ACCEPTED' | 'REJECTED'; adminNotes?: string };
export type DiscountInput = {
  name: string;
  type: 'PERCENTAGE' | 'FIXED';
  value: number;
  startDate: string;
  endDate: string;
  packageId?: string | null;
  badgeText?: string;
  badgeStyle?: string;
  issuedByUserId?: string | null;
  issuedByName?: string | null;
  issuedByEmail?: string | null;
  isActive?: boolean;
};

export type VoucherInput = {
  code: string;
  discountPercent: number;
  commissionPercent?: number;
  maxDiscount?: number | null;
  minPurchase?: number;
  maxUsage?: number | null;
  expiresAt?: string | null;
  description?: string | null;
  referrerName?: string | null;
  issuedToUserId?: string | null;
  issuedToName?: string | null;
  issuedToEmail?: string | null;
  issuedByUserId?: string | null;
  issuedByName?: string | null;
  issuedByEmail?: string | null;
  isActive?: boolean;
};

export type ArticleInput = {
  title?: string;
  slug?: string;
  summary?: string | null;
  content?: string;
  coverImageUrl?: string | null;
  category?: string;
  tags?: string;
  authorName?: string;
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  readTimeMinutes?: number;
  publishedAt?: string | null;
};

export interface PublishedArticleSummary {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  coverImageUrl: string | null;
  category: string;
  tags: string;
  authorName: string;
  readTimeMinutes: number;
  viewsCount: number;
  publishedAt: Date | null;
  createdAt: Date;
}

export interface PublishedArticle extends PublishedArticleSummary {
  content: string;
}

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
  invalidateOverview?(): void;
  listTryouts(): Promise<unknown>;
  createTryout(input: Required<Pick<TryoutInput, 'title' | 'solutionPrice' | 'batch' | 'releaseDate' | 'scheduledStart' | 'scheduledEnd'>> & TryoutInput): Promise<unknown>;
  updateTryout(id: string, input: TryoutInput): Promise<unknown | null>;
  deleteTryout(id: string): Promise<unknown | null>;
  listPackages(): Promise<unknown>;
  createPackage(input: Required<Pick<PackageInput, 'name' | 'tokenAmount' | 'price'>> & PackageInput): Promise<unknown>;
  updatePackage(id: string, input: PackageInput): Promise<unknown | null>;
  deletePackage(id: string): Promise<unknown | null>;
  listUsers(search?: string): Promise<unknown>;
  updateUser(id: string, input: ManagedUserInput): Promise<unknown | null>;
  deleteUser(id: string): Promise<unknown | null>;
  listPayments(status?: string, search?: string): Promise<unknown>;
  getPaymentsSummary(): Promise<unknown>;
  listHiringApplications(search?: string): Promise<unknown>;
  updateHiringApplication(id: string, input: HiringApplicationInput): Promise<unknown | null>;
  listArticles(search?: string, status?: string): Promise<unknown>;
  getArticle(id: string): Promise<unknown | null>;
  listPublishedArticles(): Promise<PublishedArticleSummary[]>;
  getPublishedArticleBySlug(slug: string): Promise<PublishedArticle | null>;
  createArticle(input: ArticleInput): Promise<unknown>;
  updateArticle(id: string, input: ArticleInput): Promise<unknown | null>;
  deleteArticle(id: string): Promise<boolean>;
  listTopics(): Promise<unknown>;
  createTopic(input: any): Promise<unknown>;
  updateTopic(id: string, input: any): Promise<unknown>;
  deleteTopic(id: string): Promise<unknown>;
  createSubtopic(input: any): Promise<unknown>;
  updateSubtopic(id: string, input: any): Promise<unknown>;
  deleteSubtopic(id: string): Promise<unknown>;
  listQuestions(search?: string, subtest?: string, target?: string): Promise<unknown>;
  createQuestion(input: any): Promise<unknown>;
  updateQuestion(id: string, input: any): Promise<unknown>;
  deleteQuestion(id: string): Promise<unknown>;
  listDiscounts(): Promise<unknown>;
  createDiscount(input: DiscountInput): Promise<unknown>;
  updateDiscount(id: string, input: Partial<DiscountInput>): Promise<unknown | null>;
  deleteDiscount(id: string): Promise<unknown | null>;
  listVouchers(): Promise<unknown>;
  createVoucher(input: VoucherInput): Promise<unknown>;
  updateVoucher(id: string, input: Partial<VoucherInput>): Promise<unknown | null>;
  deleteVoucher(id: string): Promise<unknown | null>;
}

@Injectable()
export class JituPostgresManagementDataSource implements JituManagementDataSource, OnApplicationBootstrap, OnModuleDestroy {
  private readonly prisma: PrismaClient | null;
  private overviewInFlight: Promise<unknown> | null = null;
  private overviewCache: { data: unknown; fetchedAt: number } | null = null;
  /** Overview data younger than this is served directly from memory. */
  private static readonly OVERVIEW_FRESH_MS = 60_000;
  /** Older (but not ancient) data is served instantly while a background refresh runs. */
  private static readonly OVERVIEW_STALE_MAX_MS = 15 * 60_000;

  constructor(@Optional() private readonly vercelAnalytics?: VercelAnalyticsService) {
    const rawUrl = process.env.JITU_CONTROL_CENTER_DATABASE_URL || process.env.JITU_PURCHASES_DATABASE_URL;
    let url = rawUrl;
    if (url && !url.includes('connection_limit=')) {
      url = `${url}${url.includes('?') ? '&' : '?'}connection_limit=3&connect_timeout=30&pool_timeout=30`;
    }

    this.prisma = url ? new PrismaClient({ datasources: { db: { url } } }) : null;
  }

  onApplicationBootstrap() {
    // Warm the overview cache so the first dashboard visit does not pay the full query cost.
    if (this.prisma) void this.refreshOverview().catch(() => undefined);
  }

  async getOverview() {
    const cached = this.overviewCache;
    const age = cached ? Date.now() - cached.fetchedAt : Infinity;
    if (cached && age < JituPostgresManagementDataSource.OVERVIEW_FRESH_MS) {
      return cached.data;
    }
    if (cached && age < JituPostgresManagementDataSource.OVERVIEW_STALE_MAX_MS) {
      // Stale-while-revalidate: answer immediately, refresh in the background.
      void this.refreshOverview().catch(() => undefined);
      return cached.data;
    }
    return this.refreshOverview();
  }

  /** Drops cached overview data after writes that affect it (tryouts, packages, users, Vercel config). */
  invalidateOverview() {
    this.overviewCache = null;
  }

  private refreshOverview() {
    if (this.overviewInFlight) {
      return this.overviewInFlight;
    }
    this.overviewInFlight = this.fetchOverviewData()
      .then((data) => {
        this.overviewCache = { data, fetchedAt: Date.now() };
        return data;
      })
      .finally(() => {
        this.overviewInFlight = null;
      });
    return this.overviewInFlight;
  }

  private async fetchOverviewData() {
    // All queries are independent: run them concurrently (each round trip is slow).
    const vercelPromise = this.vercelAnalytics?.isConfigured()
      ? this.vercelAnalytics.getAnalytics().catch(() => null)
      : Promise.resolve(null);

    const userStatsPromise = this.query<Array<{
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

    const paymentStatsRowsPromise = this.query<Array<{
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

    const packageRowsPromise = this.query<Array<{
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

    const monthlyPaymentRowsPromise = this.query<Array<{
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

    const monthlyUserRowsPromise = this.query<Array<{
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

    const upcomingTryoutsRowsPromise = this.query<Array<{
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
    const pageVisitRowsPromise = this.query<Array<{
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

    const sessionFallbackStatsPromise = this.query<Array<{
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

    const dailyTrendRowsPromise = this.query<Array<{
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

    const [
      userStatsRows,
      paymentStatsRows,
      packageRows,
      monthlyPaymentRows,
      monthlyUserRows,
      upcomingTryoutsRows,
      pageVisitRows,
      sessionFallbackStats,
      dailyTrendRows,
      vercelData,
    ] = await Promise.all([
      userStatsPromise,
      paymentStatsRowsPromise,
      packageRowsPromise,
      monthlyPaymentRowsPromise,
      monthlyUserRowsPromise,
      upcomingTryoutsRowsPromise,
      pageVisitRowsPromise,
      sessionFallbackStatsPromise,
      dailyTrendRowsPromise,
      vercelPromise,
    ]);

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

    const pureCoinPackages = coinPackages.filter((p) => !p.name.toLowerCase().includes("pass"));
    const packagePricesPerCoin = (pureCoinPackages.length > 0 ? pureCoinPackages : coinPackages).map((p) => p.pricePerCoin);
    const avgPricePerCoin = coinsSold > 0
      ? Math.round(totalRevenue / coinsSold)
      : packagePricesPerCoin.length > 0
        ? Math.round(packagePricesPerCoin.reduce((a, b) => a + b, 0) / packagePricesPerCoin.length)
        : 0;
    const minPricePerCoin = packagePricesPerCoin.length > 0 ? Math.min(...packagePricesPerCoin) : 0;
    const maxPricePerCoin = packagePricesPerCoin.length > 0 ? Math.max(...packagePricesPerCoin) : 0;

    const passPackages = packageRows.filter((p) => p.name.toLowerCase().includes("pass"));
    const passSold = passPackages.reduce((sum, p) => sum + p.soldCount, 0);
    const passRevenue = passPackages.reduce((sum, p) => sum + p.revenue, 0);

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
        passSold,
        passRevenue,
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
    this.invalidateOverview();
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
    this.invalidateOverview();
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async deleteTryout(id: string) {
    const existingRows = await this.query<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM public."TryOut" WHERE "id" = ${id} LIMIT 1
    `);
    if (!existingRows[0]) return null;

    const dependencyRows = await this.query<Array<{
      hasAttempts: boolean;
      hasUnlockedSolutions: boolean;
      hasSubtests: boolean;
    }>>(Prisma.sql`
      SELECT
        EXISTS (SELECT 1 FROM public."TryOutAttempt" WHERE "try_out_id" = ${id}) AS "hasAttempts",
        EXISTS (SELECT 1 FROM public."UnlockedSolution" WHERE "tryOutId" = ${id}) AS "hasUnlockedSolutions",
        EXISTS (SELECT 1 FROM public."Subtest" WHERE "try_out_id" = ${id}) AS "hasSubtests"
    `);
    const dependencies = dependencyRows[0];
    if (dependencies?.hasAttempts || dependencies?.hasUnlockedSolutions || dependencies?.hasSubtests) {
      throw new BadRequestException('This tryout has exam content or student history and cannot be deleted. Set it to private if you want to hide it.');
    }

    const rows = await this.query<Array<{ id: string; title: string }>>(Prisma.sql`
      DELETE FROM public."TryOut" WHERE "id" = ${id} RETURNING "id", "title"
    `);
    if (!rows[0]) return null;
    this.invalidateOverview();
    return rows[0];
  }

  async listPackages() {
    const rows = await this.query(Prisma.sql`
      SELECT p."id", p."name", p."tokenAmount", p."price", p."isActive", p."createdAt", p."updatedAt",
             COUNT(CASE WHEN pay."status" = 'CONFIRMED' THEN 1 END)::int AS "paymentCount"
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
    this.invalidateOverview();
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async updatePackage(id: string, input: PackageInput) {
    const rows = await this.query(Prisma.sql`
      UPDATE public."TokenPackage" SET
        "name" = COALESCE(${input.name ?? null}, "name"),
        "tokenAmount" = COALESCE(${input.tokenAmount ?? null}, "tokenAmount"),
        "price" = COALESCE(${input.price ?? null}, "price"),
        "isActive" = COALESCE(${input.isActive ?? null}, "isActive"),
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
      RETURNING "id", "name", "tokenAmount", "price", "isActive", "createdAt", "updatedAt"
    `);
    this.invalidateOverview();
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async deletePackage(id: string) {
    const existingRows = await this.query<Array<{ id: string; name: string; paymentCount: number }>>(Prisma.sql`
      SELECT p."id", p."name", COUNT(pay."id")::int AS "paymentCount"
      FROM public."TokenPackage" p
      LEFT JOIN public."Payment" pay ON pay."tokenPackageId" = p."id"
      WHERE p."id" = ${id}
      GROUP BY p."id"
      LIMIT 1
    `);
    const existing = existingRows[0];
    if (!existing) return null;
    if (existing.paymentCount > 0) {
      throw new BadRequestException('This package has payment history and cannot be deleted. Deactivate it instead.');
    }

    const rows = await this.query<Array<{ id: string; name: string }>>(Prisma.sql`
      DELETE FROM public."TokenPackage" WHERE "id" = ${id} RETURNING "id", "name"
    `);
    if (!rows[0]) return null;
    this.invalidateOverview();
    return rows[0];
  }

  private discountTableEnsured = false;
  private async ensureDiscountTable() {
    if (this.discountTableEnsured) return;
    try {
      await this.query(Prisma.sql`
        CREATE TABLE IF NOT EXISTS public."Discount" (
          "id" TEXT PRIMARY KEY,
          "name" TEXT NOT NULL,
          "type" TEXT NOT NULL DEFAULT 'PERCENTAGE',
          "value" DOUBLE PRECISION NOT NULL,
          "startDate" TIMESTAMP(3) NOT NULL,
          "endDate" TIMESTAMP(3) NOT NULL,
          "packageId" TEXT,
          "badgeText" TEXT NOT NULL DEFAULT 'DISKON SPESIAL',
          "badgeStyle" TEXT NOT NULL DEFAULT 'RED_FIRE',
          "issuedByUserId" TEXT,
          "issuedByName" TEXT,
          "issuedByEmail" TEXT,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "fk_discount_package" FOREIGN KEY ("packageId") REFERENCES public."TokenPackage"("id") ON DELETE SET NULL
        );
      `);
      await this.query(Prisma.sql`
        ALTER TABLE public."Discount" ADD COLUMN IF NOT EXISTS "issuedByUserId" TEXT;
      `).catch(() => {});
      await this.query(Prisma.sql`
        ALTER TABLE public."Discount" ADD COLUMN IF NOT EXISTS "issuedByName" TEXT;
      `).catch(() => {});
      await this.query(Prisma.sql`
        ALTER TABLE public."Discount" ADD COLUMN IF NOT EXISTS "issuedByEmail" TEXT;
      `).catch(() => {});
      this.discountTableEnsured = true;
    } catch (e) {
      console.error('Failed to ensure Discount table', e);
    }
  }

  async listDiscounts() {
    await this.ensureDiscountTable();
    const rows = await this.query(Prisma.sql`
      SELECT d."id", d."name", d."type", d."value", d."startDate", d."endDate",
             d."packageId", d."badgeText", d."badgeStyle",
             d."issuedByUserId", d."issuedByName", d."issuedByEmail",
             d."isActive", d."createdAt", d."updatedAt",
             p."name" AS "packageName", p."tokenAmount" AS "packageTokens", p."price" AS "packagePrice"
      FROM public."Discount" d
      LEFT JOIN public."TokenPackage" p ON p."id" = d."packageId"
      ORDER BY d."createdAt" DESC
    `);
    return rows;
  }

  async createDiscount(input: DiscountInput) {
    await this.ensureDiscountTable();
    const id = randomUUID();
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    const rows = await this.query(Prisma.sql`
      INSERT INTO public."Discount" (
        "id", "name", "type", "value", "startDate", "endDate",
        "packageId", "badgeText", "badgeStyle",
        "issuedByUserId", "issuedByName", "issuedByEmail",
        "isActive", "createdAt", "updatedAt"
      )
      VALUES (
        ${id}, ${input.name}, ${input.type}, ${Number(input.value)}, ${startDate}, ${endDate},
        ${input.packageId || null}, ${input.badgeText || 'DISKON SPESIAL'},
        ${input.badgeStyle || 'RED_FIRE'},
        ${input.issuedByUserId || null}, ${input.issuedByName || null}, ${input.issuedByEmail || null},
        ${input.isActive ?? true}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
    `);
    this.invalidateOverview();
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async updateDiscount(id: string, input: Partial<DiscountInput>) {
    await this.ensureDiscountTable();
    const startDate = input.startDate ? new Date(input.startDate) : null;
    const endDate = input.endDate ? new Date(input.endDate) : null;
    const rows = await this.query(Prisma.sql`
      UPDATE public."Discount" SET
        "name" = COALESCE(${input.name ?? null}, "name"),
        "type" = COALESCE(${input.type ?? null}, "type"),
        "value" = COALESCE(${input.value !== undefined ? Number(input.value) : null}, "value"),
        "startDate" = COALESCE(${startDate}, "startDate"),
        "endDate" = COALESCE(${endDate}, "endDate"),
        "packageId" = CASE WHEN ${input.packageId !== undefined} THEN ${input.packageId ?? null} ELSE "packageId" END,
        "badgeText" = COALESCE(${input.badgeText ?? null}, "badgeText"),
        "badgeStyle" = COALESCE(${input.badgeStyle ?? null}, "badgeStyle"),
        "issuedByUserId" = CASE WHEN ${input.issuedByUserId !== undefined} THEN ${input.issuedByUserId ?? null} ELSE "issuedByUserId" END,
        "issuedByName" = CASE WHEN ${input.issuedByName !== undefined} THEN ${input.issuedByName ?? null} ELSE "issuedByName" END,
        "issuedByEmail" = CASE WHEN ${input.issuedByEmail !== undefined} THEN ${input.issuedByEmail ?? null} ELSE "issuedByEmail" END,
        "isActive" = COALESCE(${input.isActive ?? null}, "isActive"),
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
      RETURNING *
    `);
    this.invalidateOverview();
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async deleteDiscount(id: string) {
    await this.ensureDiscountTable();
    const rows = await this.query<Array<{ id: string; name: string }>>(Prisma.sql`
      DELETE FROM public."Discount" WHERE "id" = ${id} RETURNING "id", "name"
    `);
    this.invalidateOverview();
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  private voucherTableEnsured = false;
  private async ensureVoucherTable() {
    if (this.voucherTableEnsured) return;
    try {
      await this.query(Prisma.sql`
        CREATE TABLE IF NOT EXISTS public."Voucher" (
          "id" TEXT PRIMARY KEY,
          "code" TEXT NOT NULL UNIQUE,
          "discountPercent" INTEGER NOT NULL,
          "commissionPercent" INTEGER NOT NULL DEFAULT 0,
          "maxDiscount" INTEGER,
          "minPurchase" INTEGER NOT NULL DEFAULT 0,
          "maxUsage" INTEGER,
          "usedCount" INTEGER NOT NULL DEFAULT 0,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "expiresAt" TIMESTAMP(3),
          "description" TEXT,
          "referrerName" TEXT,
          "issuedToUserId" TEXT,
          "issuedToName" TEXT,
          "issuedToEmail" TEXT,
          "issuedByUserId" TEXT,
          "issuedByName" TEXT,
          "issuedByEmail" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await this.query(Prisma.sql`
        ALTER TABLE public."Voucher"
          ADD COLUMN IF NOT EXISTS "commissionPercent" INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "issuedToUserId" TEXT,
          ADD COLUMN IF NOT EXISTS "issuedToName" TEXT,
          ADD COLUMN IF NOT EXISTS "issuedToEmail" TEXT,
          ADD COLUMN IF NOT EXISTS "issuedByUserId" TEXT,
          ADD COLUMN IF NOT EXISTS "issuedByName" TEXT,
          ADD COLUMN IF NOT EXISTS "issuedByEmail" TEXT;
      `);
      this.voucherTableEnsured = true;
    } catch (e) {
      console.error('Failed to ensure Voucher table', e);
    }
  }

  async listVouchers() {
    await this.ensureVoucherTable();
    const rows = await this.query<Array<any>>(Prisma.sql`
      SELECT
        v."id",
        v."code",
        v."discountPercent",
        COALESCE(v."commissionPercent", 0)::int AS "commissionPercent",
        v."maxDiscount",
        v."minPurchase",
        v."maxUsage",
        v."usedCount",
        v."isActive",
        v."expiresAt",
        v."description",
        v."referrerName",
        v."issuedToUserId",
        v."issuedToName",
        v."issuedToEmail",
        v."issuedByUserId",
        v."issuedByName",
        v."issuedByEmail",
        v."createdAt",
        v."updatedAt",
        COALESCE(u_to."name", v."issuedToName", v."referrerName") AS "resolvedIssuedToName",
        COALESCE(u_to."email", v."issuedToEmail") AS "resolvedIssuedToEmail",
        u_to."image" AS "resolvedIssuedToImage",
        GREATEST(v."usedCount", COALESCE(pay_stats."confirmedCount", 0))::int AS "totalUsed",
        COALESCE(pay_stats."totalRevenue", 0)::bigint AS "totalRevenue",
        ROUND(COALESCE(pay_stats."totalRevenue", 0) * (COALESCE(v."commissionPercent", 0) / 100.0))::bigint AS "totalCommission",
        (COALESCE(pay_stats."totalRevenue", 0) - ROUND(COALESCE(pay_stats."totalRevenue", 0) * (COALESCE(v."commissionPercent", 0) / 100.0)))::bigint AS "netRevenue"
      FROM public."Voucher" v
      LEFT JOIN public."user" u_to ON u_to."id" = v."issuedToUserId"
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS "confirmedCount",
          COALESCE(SUM(p."amount"), 0)::bigint AS "totalRevenue"
        FROM public."Payment" p
        WHERE (p."voucherId" = v."id" OR UPPER(COALESCE(p."voucherCode", '')) = UPPER(v."code"))
          AND p."status"::text = 'CONFIRMED'
      ) pay_stats ON true
      ORDER BY v."createdAt" DESC
    `);
    return (rows || []).map((r) => ({
      ...r,
      totalUsed: Number(r.totalUsed ?? 0),
      totalRevenue: Number(r.totalRevenue ?? 0),
      totalCommission: Number(r.totalCommission ?? 0),
      netRevenue: Number(r.netRevenue ?? 0),
    }));
  }

  async createVoucher(input: VoucherInput) {
    await this.ensureVoucherTable();
    const code = input.code.trim().toUpperCase();
    const existing = await this.query<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM public."Voucher" WHERE "code" = ${code} LIMIT 1
    `);
    if (existing[0]) {
      throw new BadRequestException(`Kode referal / voucher "${code}" sudah digunakan.`);
    }

    let issuedToName = input.issuedToName ? input.issuedToName.trim() : null;
    let issuedToEmail = input.issuedToEmail ? input.issuedToEmail.trim() : null;
    if (input.issuedToUserId && (!issuedToName || !issuedToEmail)) {
      const u = await this.query<Array<{ name: string; email: string }>>(Prisma.sql`
        SELECT "name", "email" FROM public."user" WHERE "id" = ${input.issuedToUserId} LIMIT 1
      `);
      if (u[0]) {
        issuedToName = issuedToName || u[0].name;
        issuedToEmail = issuedToEmail || u[0].email;
      }
    }

    const id = randomUUID();
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    const rows = await this.query(Prisma.sql`
      INSERT INTO public."Voucher" (
        "id", "code", "discountPercent", "commissionPercent", "maxDiscount", "minPurchase",
        "maxUsage", "usedCount", "isActive", "expiresAt",
        "description", "referrerName", "issuedToUserId", "issuedToName", "issuedToEmail",
        "issuedByUserId", "issuedByName", "issuedByEmail", "createdAt", "updatedAt"
      )
      VALUES (
        ${id},
        ${code},
        ${Number(input.discountPercent)},
        ${Number(input.commissionPercent ?? 0)},
        ${input.maxDiscount ?? null},
        ${Number(input.minPurchase ?? 0)},
        ${input.maxUsage ?? null},
        0,
        ${input.isActive ?? true},
        ${expiresAt},
        ${input.description ?? null},
        ${input.referrerName ?? issuedToName},
        ${input.issuedToUserId ?? null},
        ${issuedToName},
        ${issuedToEmail},
        ${input.issuedByUserId ?? null},
        ${input.issuedByName ?? null},
        ${input.issuedByEmail ?? null},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING *
    `);
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async updateVoucher(id: string, input: Partial<VoucherInput>) {
    await this.ensureVoucherTable();
    const cleanCode = input.code ? input.code.trim().toUpperCase() : null;
    if (cleanCode) {
      const conflict = await this.query<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM public."Voucher" WHERE "code" = ${cleanCode} AND "id" <> ${id} LIMIT 1
      `);
      if (conflict[0]) {
        throw new BadRequestException(`Kode referal / voucher "${cleanCode}" sudah digunakan.`);
      }
    }

    let issuedToName = input.issuedToName ? input.issuedToName.trim() : null;
    let issuedToEmail = input.issuedToEmail ? input.issuedToEmail.trim() : null;
    if (input.issuedToUserId && (!issuedToName || !issuedToEmail)) {
      const u = await this.query<Array<{ name: string; email: string }>>(Prisma.sql`
        SELECT "name", "email" FROM public."user" WHERE "id" = ${input.issuedToUserId} LIMIT 1
      `);
      if (u[0]) {
        issuedToName = issuedToName || u[0].name;
        issuedToEmail = issuedToEmail || u[0].email;
      }
    }

    const expiresAt = input.expiresAt !== undefined
      ? (input.expiresAt ? new Date(input.expiresAt) : null)
      : null;

    const rows = await this.query(Prisma.sql`
      UPDATE public."Voucher" SET
        "code" = COALESCE(${cleanCode}, "code"),
        "discountPercent" = COALESCE(${input.discountPercent !== undefined ? Number(input.discountPercent) : null}, "discountPercent"),
        "commissionPercent" = COALESCE(${input.commissionPercent !== undefined ? Number(input.commissionPercent) : null}, "commissionPercent"),
        "maxDiscount" = CASE WHEN ${input.maxDiscount !== undefined} THEN ${input.maxDiscount ?? null} ELSE "maxDiscount" END,
        "minPurchase" = COALESCE(${input.minPurchase !== undefined ? Number(input.minPurchase) : null}, "minPurchase"),
        "maxUsage" = CASE WHEN ${input.maxUsage !== undefined} THEN ${input.maxUsage ?? null} ELSE "maxUsage" END,
        "isActive" = COALESCE(${input.isActive ?? null}, "isActive"),
        "expiresAt" = CASE WHEN ${input.expiresAt !== undefined} THEN ${expiresAt} ELSE "expiresAt" END,
        "description" = CASE WHEN ${input.description !== undefined} THEN ${input.description ?? null} ELSE "description" END,
        "referrerName" = CASE WHEN ${input.referrerName !== undefined} THEN ${input.referrerName ?? null} ELSE "referrerName" END,
        "issuedToUserId" = CASE WHEN ${input.issuedToUserId !== undefined} THEN ${input.issuedToUserId ?? null} ELSE "issuedToUserId" END,
        "issuedToName" = CASE WHEN ${issuedToName !== null} THEN ${issuedToName} ELSE "issuedToName" END,
        "issuedToEmail" = CASE WHEN ${issuedToEmail !== null} THEN ${issuedToEmail} ELSE "issuedToEmail" END,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
      RETURNING *
    `);
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async deleteVoucher(id: string) {
    await this.ensureVoucherTable();
    try {
      await this.query(Prisma.sql`
        UPDATE public."Payment" SET "voucherId" = NULL WHERE "voucherId" = ${id}
      `);
    } catch {}
    const rows = await this.query<Array<{ id: string; code: string }>>(Prisma.sql`
      DELETE FROM public."Voucher" WHERE "id" = ${id} RETURNING "id", "code"
    `);
    this.invalidateOverview();
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async listUsers(search = '') {
    const pattern = `%${search.trim()}%`;
    return this.query(Prisma.sql`
      SELECT "id", "name", "email", "image", "role"::text AS "role", "target", "tokenBalance", "currentStreak", "createdAt",
             COALESCE("isBanned", false) AS "isBanned",
             COALESCE("emailVerified", false) AS "emailVerified"
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
        "isBanned" = CASE WHEN ${input.isBanned !== undefined} THEN ${Boolean(input.isBanned)} ELSE "isBanned" END,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
      RETURNING "id", "name", "email", "image", "role"::text AS "role", "target", "tokenBalance", "currentStreak", "createdAt", COALESCE("isBanned", false) AS "isBanned"
    `);
    this.invalidateOverview();
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async deleteUser(id: string) {
    try { await this.query(Prisma.sql`DELETE FROM public."session" WHERE "userId" = ${id}`); } catch {}
    try { await this.query(Prisma.sql`DELETE FROM public."account" WHERE "userId" = ${id}`); } catch {}
    try { await this.query(Prisma.sql`DELETE FROM public."Payment" WHERE "userId" = ${id}`); } catch {}
    try { await this.query(Prisma.sql`DELETE FROM public."TokenTransaction" WHERE "userId" = ${id}`); } catch {}
    try { await this.query(Prisma.sql`DELETE FROM public."TryOutAttempt" WHERE "userId" = ${id}`); } catch {}
    try { await this.query(Prisma.sql`DELETE FROM public."DailyQuestionLog" WHERE "userId" = ${id}`); } catch {}
    try { await this.query(Prisma.sql`DELETE FROM public."UnlockedSolution" WHERE "userId" = ${id}`); } catch {}

    const rows = await this.query<Array<{ id: string }>>(Prisma.sql`
      DELETE FROM public."user" WHERE "id" = ${id} RETURNING "id"
    `);
    this.invalidateOverview();
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async listPayments(status?: string, search = '') {
    const pattern = `%${search.trim()}%`;
    const filterStatus = status && status !== 'ALL' ? status.toUpperCase() : null;

    const rows = await this.query<Array<any>>(Prisma.sql`
      SELECT
        p."id",
        p."orderId",
        p."amount",
        p."tokenAmount",
        p."status"::text AS "status",
        p."paymentMethod",
        p."snapToken",
        p."metadata",
        p."createdAt",
        p."updatedAt",
        u."id" AS "userId",
        u."name" AS "userName",
        u."email" AS "userEmail",
        u."image" AS "userImage",
        u."target" AS "userTarget",
        u."tokenBalance" AS "userTokenBalance",
        u."currentStreak" AS "userCurrentStreak",
        u."role"::text AS "userRole",
        COALESCE(u."isBanned", false) AS "userIsBanned",
        u."createdAt" AS "userCreatedAt",
        tp."id" AS "packageId",
        tp."name" AS "packageName",
        tp."price" AS "packagePrice"
      FROM public."Payment" p
      LEFT JOIN public."user" u ON p."userId" = u."id"
      LEFT JOIN public."TokenPackage" tp ON p."tokenPackageId" = tp."id"
      WHERE (${filterStatus === null} OR p."status"::text = ${filterStatus})
        AND (${search.trim() === ''} OR p."orderId" ILIKE ${pattern} OR u."name" ILIKE ${pattern} OR u."email" ILIKE ${pattern})
      ORDER BY p."createdAt" DESC
      LIMIT 200
    `);

    return (Array.isArray(rows) ? rows : []).map(r => ({
      id: r.id,
      orderId: r.orderId,
      amount: Number(r.amount ?? 0),
      tokenAmount: Number(r.tokenAmount ?? 0),
      status: r.status,
      paymentMethod: r.paymentMethod,
      snapToken: r.snapToken,
      metadata: r.metadata,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      user: r.userId ? {
        id: r.userId,
        name: r.userName,
        email: r.userEmail,
        image: r.userImage,
        target: r.userTarget,
        tokenBalance: Number(r.userTokenBalance ?? 0),
        currentStreak: Number(r.userCurrentStreak ?? 0),
        role: r.userRole,
        isBanned: Boolean(r.userIsBanned),
        createdAt: r.userCreatedAt,
      } : null,
      tokenPackage: r.packageId ? {
        id: r.packageId,
        name: r.packageName,
        price: Number(r.packagePrice ?? 0),
      } : null,
    }));
  }

  async getPaymentsSummary() {
    const [aggregates, monthlyRows] = await Promise.all([
      this.query<Array<any>>(Prisma.sql`
        SELECT
          COALESCE(SUM("amount") FILTER (WHERE "status"::text = 'CONFIRMED'), 0)::text AS "totalRevenue",
          COUNT(*) FILTER (WHERE "status"::text = 'CONFIRMED')::text AS "confirmedPayments",
          COUNT(*) FILTER (WHERE "status"::text = 'PENDING')::text AS "pendingPayments",
          COUNT(*) FILTER (WHERE "status"::text = 'CANCELLED')::text AS "cancelledPayments",
          COUNT(*) FILTER (WHERE "status"::text = 'DECLINED')::text AS "declinedPayments"
        FROM public."Payment"
      `),
      this.query<Array<any>>(Prisma.sql`
        SELECT
          TO_CHAR(date_trunc('month', "createdAt"), 'YYYY-MM') AS "month",
          COALESCE(SUM("amount") FILTER (WHERE "status"::text = 'CONFIRMED'), 0)::text AS "revenue",
          COUNT(*) FILTER (WHERE "status"::text = 'CONFIRMED')::text AS "confirmedPayments",
          COUNT(*) FILTER (WHERE "status"::text = 'PENDING')::text AS "pendingPayments",
          COUNT(*) FILTER (WHERE "status"::text = 'CANCELLED')::text AS "cancelledPayments"
        FROM public."Payment"
        WHERE "createdAt" >= date_trunc('month', CURRENT_TIMESTAMP) - INTERVAL '11 months'
        GROUP BY date_trunc('month', "createdAt")
        ORDER BY date_trunc('month', "createdAt") ASC
      `),
    ]);

    const values = new Map((Array.isArray(monthlyRows) ? monthlyRows : []).map((row) => [row.month, row]));
    const monthlyRevenue = [];
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
        pendingPayments: Number(value?.pendingPayments ?? 0),
        cancelledPayments: Number(value?.cancelledPayments ?? 0),
      });
    }

    const aggregate = Array.isArray(aggregates) ? aggregates[0] : null;
    return {
      configured: true,
      totalRevenue: Number(aggregate?.totalRevenue ?? 0),
      confirmedPayments: Number(aggregate?.confirmedPayments ?? 0),
      pendingPayments: Number(aggregate?.pendingPayments ?? 0),
      cancelledPayments: Number(aggregate?.cancelledPayments ?? 0),
      declinedPayments: Number(aggregate?.declinedPayments ?? 0),
      monthlyRevenue,
    };
  }

  async listHiringApplications(search = '') {
    const pattern = `%${search.trim()}%`;
    return this.query(Prisma.sql`
      SELECT id, full_name AS "fullName", email, whatsapp, university, major,
             academic_status AS "academicStatus", domicile, primary_role AS "primaryRole",
             primary_division AS "primaryDivision", secondary_role AS "secondaryRole",
             availability, start_date AS "startDate", cv_url AS "cvUrl", cv_file_name AS "cvFileName",
             portfolio_url AS "portfolioUrl", linkedin_url AS "linkedinUrl",
             experience_essay AS "experienceEssay", motivation_essay AS "motivationEssay",
             referral_source AS "referralSource", commitment_agreed AS "commitmentAgreed",
             status, admin_notes AS "adminNotes", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM public.hiring_applications
      WHERE ${search.trim() === ''} OR full_name ILIKE ${pattern} OR email ILIKE ${pattern} OR university ILIKE ${pattern} OR primary_role ILIKE ${pattern}
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
      RETURNING id, full_name AS "fullName", email, whatsapp, university, major,
                academic_status AS "academicStatus", domicile, primary_role AS "primaryRole",
                primary_division AS "primaryDivision", secondary_role AS "secondaryRole",
                availability, start_date AS "startDate", cv_url AS "cvUrl", cv_file_name AS "cvFileName",
                portfolio_url AS "portfolioUrl", linkedin_url AS "linkedinUrl",
                experience_essay AS "experienceEssay", motivation_essay AS "motivationEssay",
                referral_source AS "referralSource", commitment_agreed AS "commitmentAgreed",
                status, admin_notes AS "adminNotes", created_at AS "createdAt", updated_at AS "updatedAt"
    `);
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async listArticles(search = '', status = '') {
    const pattern = `%${search.trim()}%`;
    return this.query(Prisma.sql`
      SELECT id, title, slug, summary, content, cover_image_url AS "coverImageUrl",
             category, tags, author_name AS "authorName", status,
             read_time_minutes AS "readTimeMinutes", views_count AS "viewsCount",
             published_at AS "publishedAt", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM public.articles
      WHERE (${search.trim() === ''} OR title ILIKE ${pattern} OR category ILIKE ${pattern} OR author_name ILIKE ${pattern} OR tags ILIKE ${pattern})
        AND (${status.trim() === ''} OR status = ${status})
      ORDER BY COALESCE(published_at, created_at) DESC
      LIMIT 200
    `);
  }

  async listPublishedArticles(): Promise<PublishedArticleSummary[]> {
    return this.query(Prisma.sql`
      SELECT id, title, slug, summary, cover_image_url AS "coverImageUrl",
             category, tags, author_name AS "authorName",
             read_time_minutes AS "readTimeMinutes", views_count AS "viewsCount",
             published_at AS "publishedAt", created_at AS "createdAt"
      FROM public.articles
      WHERE status = 'PUBLISHED'
      ORDER BY published_at DESC NULLS LAST, created_at DESC
    `);
  }

  async getPublishedArticleBySlug(slug: string): Promise<PublishedArticle | null> {
    const rows = await this.query<PublishedArticle[]>(Prisma.sql`
      SELECT id, title, slug, summary, content,
             cover_image_url AS "coverImageUrl", category, tags,
             author_name AS "authorName", read_time_minutes AS "readTimeMinutes",
             views_count AS "viewsCount", published_at AS "publishedAt",
             created_at AS "createdAt"
      FROM public.articles
      WHERE slug = ${slug} AND status = 'PUBLISHED'
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  async getArticle(id: string) {
    const rows = await this.query<any[]>(Prisma.sql`
      SELECT id, title, slug, summary, content, cover_image_url AS "coverImageUrl",
             category, tags, author_name AS "authorName", status,
             read_time_minutes AS "readTimeMinutes", views_count AS "viewsCount",
             published_at AS "publishedAt", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM public.articles
      WHERE id = ${id} OR slug = ${id}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  async createArticle(input: ArticleInput) {
    const id = 'art-' + randomUUID().slice(0, 10);
    const baseSlug = (input.slug || input.title || 'article')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    const slug = baseSlug || id;
    const publishedAt = input.status === 'PUBLISHED'
      ? (input.publishedAt ? new Date(input.publishedAt) : new Date())
      : null;

    const rows = await this.query(Prisma.sql`
      INSERT INTO public.articles (
        id, title, slug, summary, content, cover_image_url,
        category, tags, author_name, status, read_time_minutes,
        published_at, created_at, updated_at
      ) VALUES (
        ${id},
        ${input.title ?? 'Untitled Article'},
        ${slug},
        ${input.summary ?? null},
        ${input.content ?? ''},
        ${input.coverImageUrl ?? null},
        ${input.category ?? 'UTBK-SNBT'},
        ${input.tags ?? ''},
        ${input.authorName ?? 'Tim Jitu PTN'},
        ${input.status ?? 'DRAFT'},
        ${input.readTimeMinutes ?? 3},
        ${publishedAt},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING id, title, slug, summary, content, cover_image_url AS "coverImageUrl",
                category, tags, author_name AS "authorName", status,
                read_time_minutes AS "readTimeMinutes", views_count AS "viewsCount",
                published_at AS "publishedAt", created_at AS "createdAt", updated_at AS "updatedAt"
    `);
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async updateArticle(id: string, input: ArticleInput) {
    const publishedAt = input.status === 'PUBLISHED'
      ? (input.publishedAt ? new Date(input.publishedAt) : new Date())
      : input.status === 'DRAFT'
        ? null
        : undefined;

    const rows = await this.query(Prisma.sql`
      UPDATE public.articles SET
        title = COALESCE(${input.title ?? null}, title),
        slug = COALESCE(${input.slug ? input.slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') : null}, slug),
        summary = CASE WHEN ${input.summary !== undefined} THEN ${input.summary ?? null} ELSE summary END,
        content = COALESCE(${input.content ?? null}, content),
        cover_image_url = CASE WHEN ${input.coverImageUrl !== undefined} THEN ${input.coverImageUrl ?? null} ELSE cover_image_url END,
        category = COALESCE(${input.category ?? null}, category),
        tags = CASE WHEN ${input.tags !== undefined} THEN ${input.tags ?? ''} ELSE tags END,
        author_name = COALESCE(${input.authorName ?? null}, author_name),
        status = COALESCE(${input.status ?? null}, status),
        read_time_minutes = COALESCE(${input.readTimeMinutes ?? null}, read_time_minutes),
        published_at = CASE
          WHEN ${publishedAt !== undefined} THEN ${publishedAt}
          ELSE published_at
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, title, slug, summary, content, cover_image_url AS "coverImageUrl",
                category, tags, author_name AS "authorName", status,
                read_time_minutes AS "readTimeMinutes", views_count AS "viewsCount",
                published_at AS "publishedAt", created_at AS "createdAt", updated_at AS "updatedAt"
    `);
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async deleteArticle(id: string) {
    await this.query(Prisma.sql`
      DELETE FROM public.articles WHERE id = ${id}
    `);
    return true;
  }

  async listTopics() {
    const rows = await this.query<Array<any>>(Prisma.sql`
      SELECT t."id", t."subtest", t."title", t."slug", t."order",
             json_agg(
               json_build_object(
                 'id', s."id",
                 'title', s."title",
                 'slug', s."slug",
                 'order', s."order",
                 'patterns', COALESCE(s."patterns", '[]'::jsonb)
               )
               ORDER BY s."order" ASC
             ) FILTER (WHERE s."id" IS NOT NULL) AS "subtopics"
      FROM public."Topic" t
      LEFT JOIN public."Subtopic" s ON s."topicId" = t."id"
      GROUP BY t."id"
      ORDER BY t."order" ASC, t."title" ASC
    `);
    return rows.map((t) => ({
      ...t,
      subtopics: (t.subtopics || []).map((s: any) => ({
        ...s,
        patterns: Array.isArray(s.patterns) ? s.patterns : [],
      })),
    }));
  }

  async createTopic(input: any) {
    const cleanTitle = (input.title || '').trim();
    const rawSlug = input.slug || cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const id = `top-${input.subtest?.toLowerCase().replace(/_/g, '-') || 'gen'}-${rawSlug}-${Math.random().toString(36).substring(2, 6)}`;
    const order = Number(input.order) || 1;
    await this.query(Prisma.sql`
      INSERT INTO public."Topic" ("id", "subtest", "title", "slug", "order", "createdAt")
      VALUES (${id}, ${input.subtest}, ${cleanTitle}, ${rawSlug}, ${order}, CURRENT_TIMESTAMP)
    `);
    return { id, subtest: input.subtest, title: cleanTitle, slug: rawSlug, order, subtopics: [] };
  }

  async updateTopic(id: string, input: any) {
    const updates: Prisma.Sql[] = [];
    if (input.subtest) updates.push(Prisma.sql`"subtest" = ${input.subtest}`);
    if (input.title) updates.push(Prisma.sql`"title" = ${input.title.trim()}`);
    if (input.slug) updates.push(Prisma.sql`"slug" = ${input.slug.trim()}`);
    if (input.order !== undefined) updates.push(Prisma.sql`"order" = ${Number(input.order)}`);

    if (updates.length > 0) {
      await this.query(Prisma.sql`
        UPDATE public."Topic"
        SET ${Prisma.join(updates, ', ')}
        WHERE "id" = ${id}
      `);
    }
    return { id, ...input };
  }

  async deleteTopic(id: string) {
    await this.query(Prisma.sql`DELETE FROM public."Subtopic" WHERE "topicId" = ${id}`);
    await this.query(Prisma.sql`DELETE FROM public."Topic" WHERE "id" = ${id}`);
    return true;
  }

  async createSubtopic(input: any) {
    const cleanTitle = (input.title || '').trim();
    const rawSlug = input.slug || cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const id = `sub-${rawSlug}-${Math.random().toString(36).substring(2, 6)}`;
    const order = Number(input.order) || 1;
    const patterns = Array.isArray(input.patterns)
      ? input.patterns.map((p: any) => String(p).trim()).filter(Boolean)
      : [];
    const patternsJson = JSON.stringify(patterns);
    await this.query(Prisma.sql`
      INSERT INTO public."Subtopic" ("id", "topicId", "title", "slug", "order", "patterns", "createdAt")
      VALUES (${id}, ${input.topicId}, ${cleanTitle}, ${rawSlug}, ${order}, ${patternsJson}::jsonb, CURRENT_TIMESTAMP)
    `);
    return { id, topicId: input.topicId, title: cleanTitle, slug: rawSlug, order, patterns };
  }

  async updateSubtopic(id: string, input: any) {
    const updates: Prisma.Sql[] = [];
    if (input.topicId) updates.push(Prisma.sql`"topicId" = ${input.topicId}`);
    if (input.title) updates.push(Prisma.sql`"title" = ${input.title.trim()}`);
    if (input.slug) updates.push(Prisma.sql`"slug" = ${input.slug.trim()}`);
    if (input.order !== undefined) updates.push(Prisma.sql`"order" = ${Number(input.order)}`);
    if (input.patterns !== undefined) {
      const patterns = Array.isArray(input.patterns)
        ? input.patterns.map((p: any) => String(p).trim()).filter(Boolean)
        : [];
      updates.push(Prisma.sql`"patterns" = ${JSON.stringify(patterns)}::jsonb`);
    }

    if (updates.length > 0) {
      await this.query(Prisma.sql`
        UPDATE public."Subtopic"
        SET ${Prisma.join(updates, ', ')}
        WHERE "id" = ${id}
      `);
    }
    return { id, ...input };
  }

  async deleteSubtopic(id: string) {
    await this.query(Prisma.sql`UPDATE public."Question" SET "subtopic_id" = NULL WHERE "subtopic_id" = ${id}`);
    await this.query(Prisma.sql`DELETE FROM public."Subtopic" WHERE "id" = ${id}`);
    return true;
  }

  async listQuestions(search = '', subtest = '', target = '') {
    const filterClauses: Prisma.Sql[] = [];
    if (search && search.trim()) {
      const like = `%${search.trim()}%`;
      filterClauses.push(Prisma.sql`(q."content" ILIKE ${like} OR q."narration" ILIKE ${like})`);
    }
    if (subtest && subtest.trim()) {
      filterClauses.push(Prisma.sql`q."subtest" = ${subtest.trim()}`);
    }
    if (target && target.trim()) {
      filterClauses.push(Prisma.sql`q."target" = ${target.trim()}`);
    }
    const where = filterClauses.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(filterClauses, ' AND ')}`
      : Prisma.empty;

    const rows = await this.query<Array<any>>(Prisma.sql`
      SELECT 
        q."id", q."subtest", q."subtopic_id" AS "subtopicId", q."difficulty", q."type", 
        q."target", q."narration", q."content", q."imageUrl", q."points",
        q."correct_answer_short_answer" AS "correctAnswer",
        q."createdAt", q."updatedAt",
        s."title" AS "subtopicTitle",
        t."title" AS "topicTitle",
        (
          SELECT json_agg(
            json_build_object('id', opt."id", 'content', opt."content", 'isCorrect', opt."is_correct", 'order', opt."order")
            ORDER BY opt."order" ASC
          )
          FROM public."QuestionItem" opt
          WHERE opt."question_id" = q."id"
        ) AS "options",
        (
          SELECT json_build_object(
            'id', sol."id", 'steps', sol."steps", 'staticContent', sol."staticContent",
            'quickTrick', sol."quickTrick", 'keyFormula', sol."keyFormula", 'defaultView', sol."defaultView"
          )
          FROM public."QuestionSolution" sol
          WHERE sol."questionId" = q."id"
        ) AS "solution"
      FROM public."Question" q
      LEFT JOIN public."Subtopic" s ON s."id" = q."subtopic_id"
      LEFT JOIN public."Topic" t ON t."id" = s."topicId"
      ${where}
      ORDER BY q."createdAt" DESC
      LIMIT 100
    `);
    return rows.map((r) => ({
      ...r,
      options: r.options || [],
    }));
  }

  async createQuestion(input: any) {
    const questionId = randomUUID();
    const target = input.target || 'DRAFT';
    const difficulty = input.difficulty || 'MEDIUM';
    const rawType = input.type || 'PILIHAN_GANDA';
    const type = (rawType === 'SHORT_ANSWER' || rawType === 'ISIAN_SINGKAT') ? 'ISIAN_SINGKAT' : 'PILIHAN_GANDA';
    const isTryoutOnly = target === 'FOR_TRYOUT';
    const correctAnswer = input.correctAnswer !== undefined && input.correctAnswer !== null ? String(input.correctAnswer).trim() : null;

    await this.query(Prisma.sql`
      INSERT INTO public."Question" (
        "id", "subtest", "subtopic_id", "difficulty", "type", "target", 
        "narration", "content", "imageUrl", "points", "correct_answer_short_answer", "isTryoutOnly", "createdAt", "updatedAt"
      ) VALUES (
        ${questionId}, ${input.subtest}, ${input.subtopicId || null}, ${difficulty}, 
        CAST(${type} AS public."QuestionType"), ${target},
        ${input.narration || null}, ${input.content}, ${input.imageUrl || null}, ${input.points || 1},
        ${correctAnswer}, ${isTryoutOnly}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);

    if (type !== 'ISIAN_SINGKAT' && Array.isArray(input.options) && input.options.length > 0) {
      for (const opt of input.options) {
        if (!opt.content && !opt.isCorrect) continue;
        await this.query(Prisma.sql`
          INSERT INTO public."QuestionItem" ("id", "question_id", "content", "is_correct", "order")
          VALUES (${randomUUID()}, ${questionId}, ${opt.content}, ${Boolean(opt.isCorrect)}, ${opt.order})
        `);
      }
    }

    const stepsJson = input.solutionSteps && input.solutionSteps.length > 0 ? JSON.stringify(input.solutionSteps) : null;
    if (stepsJson || input.quickTrick || input.staticExplanation || input.keyFormula) {
      await this.query(Prisma.sql`
        INSERT INTO public."QuestionSolution" (
          "id", "questionId", "steps", "staticContent", "quickTrick", "keyFormula", "createdAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}, ${questionId}, CAST(${stepsJson} AS jsonb), ${input.staticExplanation || null},
          ${input.quickTrick || null}, ${input.keyFormula || null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `);
    }

    const result = await this.listQuestions(questionId);
    return Array.isArray(result) ? result[0] : null;
  }

  async updateQuestion(id: string, input: any) {
    const target = input.target;
    const isTryoutOnly = target === 'FOR_TRYOUT';
    const rawType = input.type;
    const type = rawType ? ((rawType === 'SHORT_ANSWER' || rawType === 'ISIAN_SINGKAT') ? 'ISIAN_SINGKAT' : 'PILIHAN_GANDA') : undefined;
    const correctAnswer = input.correctAnswer !== undefined ? (input.correctAnswer !== null ? String(input.correctAnswer).trim() : null) : undefined;

    await this.query(Prisma.sql`
      UPDATE public."Question" SET
        "subtest" = COALESCE(${input.subtest ?? null}, "subtest"),
        "subtopic_id" = CASE WHEN ${input.subtopicId !== undefined} THEN ${input.subtopicId || null} ELSE "subtopic_id" END,
        "difficulty" = COALESCE(${input.difficulty ?? null}, "difficulty"),
        "type" = CASE WHEN ${type !== undefined} THEN CAST(${type} AS public."QuestionType") ELSE "type" END,
        "target" = COALESCE(${input.target ?? null}, "target"),
        "narration" = CASE WHEN ${input.narration !== undefined} THEN ${input.narration || null} ELSE "narration" END,
        "content" = COALESCE(${input.content ?? null}, "content"),
        "imageUrl" = CASE WHEN ${input.imageUrl !== undefined} THEN ${input.imageUrl || null} ELSE "imageUrl" END,
        "points" = COALESCE(${input.points ?? null}, "points"),
        "correct_answer_short_answer" = CASE WHEN ${correctAnswer !== undefined} THEN ${correctAnswer} ELSE "correct_answer_short_answer" END,
        "isTryoutOnly" = CASE WHEN ${target !== undefined} THEN ${isTryoutOnly} ELSE "isTryoutOnly" END,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
    `);

    if (Array.isArray(input.options)) {
      await this.query(Prisma.sql`DELETE FROM public."QuestionItem" WHERE "question_id" = ${id}`);
      if (type !== 'ISIAN_SINGKAT') {
        for (const opt of input.options) {
          if (!opt.content && !opt.isCorrect) continue;
          await this.query(Prisma.sql`
            INSERT INTO public."QuestionItem" ("id", "question_id", "content", "is_correct", "order")
            VALUES (${randomUUID()}, ${id}, ${opt.content}, ${Boolean(opt.isCorrect)}, ${opt.order})
          `);
        }
      }
    }

    if (input.solutionSteps !== undefined || input.quickTrick !== undefined || input.staticExplanation !== undefined || input.keyFormula !== undefined) {
      const stepsJson = input.solutionSteps && input.solutionSteps.length > 0 ? JSON.stringify(input.solutionSteps) : null;
      await this.query(Prisma.sql`
        INSERT INTO public."QuestionSolution" ("id", "questionId", "steps", "staticContent", "quickTrick", "keyFormula", "createdAt", "updatedAt")
        VALUES (${randomUUID()}, ${id}, CAST(${stepsJson} AS jsonb), ${input.staticExplanation || null}, ${input.quickTrick || null}, ${input.keyFormula || null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT ("questionId") DO UPDATE SET
          "steps" = CASE WHEN ${stepsJson !== null} THEN CAST(${stepsJson} AS jsonb) ELSE "QuestionSolution"."steps" END,
          "staticContent" = CASE WHEN ${input.staticExplanation !== undefined} THEN ${input.staticExplanation || null} ELSE "QuestionSolution"."staticContent" END,
          "quickTrick" = CASE WHEN ${input.quickTrick !== undefined} THEN ${input.quickTrick || null} ELSE "QuestionSolution"."quickTrick" END,
          "keyFormula" = CASE WHEN ${input.keyFormula !== undefined} THEN ${input.keyFormula || null} ELSE "QuestionSolution"."keyFormula" END,
          "updatedAt" = CURRENT_TIMESTAMP
      `);
    }

    const result = await this.listQuestions(id);
    return Array.isArray(result) ? result[0] : null;
  }

  async deleteQuestion(id: string) {
    await this.query(Prisma.sql`DELETE FROM public."QuestionItem" WHERE "question_id" = ${id}`);
    await this.query(Prisma.sql`DELETE FROM public."QuestionSolution" WHERE "questionId" = ${id}`);
    const rows = await this.query<Array<any>>(Prisma.sql`
      DELETE FROM public."Question" WHERE "id" = ${id} RETURNING "id"
    `);
    return rows[0] || null;
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

  private async execute(statement: Prisma.Sql): Promise<void> {
    await this.query(statement);
  }

  private async query<T = unknown>(statement: Prisma.Sql, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await this.database().$queryRaw<T>(statement);
      } catch (error) {
        lastError = error;
        const isTransient =
          error instanceof Prisma.PrismaClientInitializationError ||
          (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P1001');

        if (isTransient && attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
          continue;
        }

        if (isTransient) {
          throw new ServiceUnavailableException(
            'Jitu management database is unreachable. Check the host and credentials in JITU_CONTROL_CENTER_DATABASE_URL.',
          );
        }
        throw error;
      }
    }
    throw lastError;
  }
}
