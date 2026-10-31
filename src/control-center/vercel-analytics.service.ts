import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export type DimensionMetricItem = {
  key: string;
  label: string;
  visitors: number;
  pageViews: number;
  sharePct: number;
  flag?: string;
  icon?: string;
};

export type CustomEventMetricItem = {
  eventName: string;
  label: string;
  count: number;
  visitors: number;
};

export type VercelAnalyticsData = {
  configured: boolean;
  visitors: {
    totalVisitors: number;
    uniqueVisitors: number;
    totalPageViews: number;
    visitorGrowthPct: number;
  };
  visitorTrend: Array<{
    date: string;
    label: string;
    visitors: number;
    uniqueVisitors: number;
    activeUsers: number;
    pageViews: number;
  }>;
  visitorPerPage: Array<{
    id: string;
    path: string;
    label: string;
    visitors: number;
    uniqueVisitors: number;
    pageViews: number;
    avgDurationSec: number;
    bounceRate: number;
    sharePct: number;
  }>;
  topCountries: DimensionMetricItem[];
  topDevices: DimensionMetricItem[];
  topReferrers: DimensionMetricItem[];
  topBrowsers: DimensionMetricItem[];
  topOperatingSystems: DimensionMetricItem[];
  customEvents: CustomEventMetricItem[];
};

const COUNTRY_LOOKUP: Record<string, { name: string; flag: string }> = {
  ID: { name: 'Indonesia', flag: '🇮🇩' },
  US: { name: 'United States', flag: '🇺🇸' },
  SG: { name: 'Singapore', flag: '🇸🇬' },
  MY: { name: 'Malaysia', flag: '🇲🇾' },
  JP: { name: 'Japan', flag: '🇯🇵' },
  GB: { name: 'United Kingdom', flag: '🇬🇧' },
  AU: { name: 'Australia', flag: '🇦🇺' },
  DE: { name: 'Germany', flag: '🇩🇪' },
  NL: { name: 'Netherlands', flag: '🇳🇱' },
  FR: { name: 'France', flag: '🇫🇷' },
  CA: { name: 'Canada', flag: '🇨🇦' },
  IN: { name: 'India', flag: '🇮🇳' },
  KR: { name: 'South Korea', flag: '🇰🇷' },
  TH: { name: 'Thailand', flag: '🇹🇭' },
  VN: { name: 'Vietnam', flag: '🇻🇳' },
  PH: { name: 'Philippines', flag: '🇵🇭' },
};

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

function labelForReferrer(raw: string): string {
  if (!raw || raw === 'direct' || raw === '(direct)') return 'Direct Navigation';
  const lower = raw.toLowerCase();
  if (lower.includes('google')) return 'Google Search';
  if (lower.includes('instagram')) return 'Instagram';
  if (lower.includes('tiktok')) return 'TikTok';
  if (lower.includes('twitter') || lower.includes('x.com')) return 'X (Twitter)';
  if (lower.includes('wa.me') || lower.includes('whatsapp')) return 'WhatsApp';
  if (lower.includes('telegram') || lower.includes('t.me')) return 'Telegram';
  if (lower.includes('linkedin')) return 'LinkedIn';
  if (lower.includes('youtube')) return 'YouTube';
  if (lower.includes('facebook')) return 'Facebook';
  return raw;
}

function labelForDevice(raw: string): string {
  const lower = (raw || '').toLowerCase();
  if (lower === 'mobile') return 'Mobile Phone';
  if (lower === 'desktop') return 'Desktop / Laptop';
  if (lower === 'tablet') return 'Tablet';
  return raw || 'Other';
}

@Injectable()
export class VercelAnalyticsService {
  private readonly logger = new Logger(VercelAnalyticsService.name);
  private cache: { data: VercelAnalyticsData; expiresAt: number } | null = null;
  private inFlight: Promise<VercelAnalyticsData | null> | null = null;

  // Runtime overrides (set via UI or .env)
  private overrideToken: string | null = null;
  private overrideProjectId: string | null = null;
  private overrideTeamId: string | null = null;

  private get token(): string | undefined {
    return this.overrideToken || process.env.VERCEL_TOKEN || process.env.VERCEL_ANALYTICS_TOKEN;
  }

  private get projectId(): string | undefined {
    return this.overrideProjectId || process.env.VERCEL_PROJECT_ID || process.env.VERCEL_ANALYTICS_PROJECT_ID;
  }

  private get teamId(): string | undefined {
    return this.overrideTeamId || process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID || 'team_AwXSFqNTh675u2W43i6HDQzY';
  }

  isConfigured(): boolean {
    return Boolean(this.token && this.projectId);
  }

  getConfigStatus() {
    return {
      configured: this.isConfigured(),
      hasToken: Boolean(this.token),
      tokenMasked: this.token ? `${this.token.slice(0, 4)}…${this.token.slice(-4)}` : null,
      projectId: this.projectId ?? '',
      teamId: this.teamId ?? '',
    };
  }

  async testAndSaveCredentials(input: { token: string; projectId: string; teamId?: string }): Promise<{ success: boolean; message: string; visitors?: number }> {
    const token = input.token.trim();
    const projectId = input.projectId.trim();
    const teamId = input.teamId?.trim() || this.teamId;

    if (!token || !projectId) {
      return { success: false, message: 'Both VERCEL_TOKEN and VERCEL_PROJECT_ID are required.' };
    }

    const testUrl = new URL('https://api.vercel.com/v1/query/web-analytics/visits/count');
    testUrl.searchParams.set('projectId', projectId);
    if (teamId) testUrl.searchParams.set('teamId', teamId);

    try {
      const res = await fetch(testUrl.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          message: `Vercel API returned status ${res.status}: ${errText.slice(0, 150)}`,
        };
      }

      const json = (await res.json()) as { data?: { visitors?: number; pageviews?: number } };

      // Apply runtime overrides immediately
      this.overrideToken = token;
      this.overrideProjectId = projectId;
      if (teamId) this.overrideTeamId = teamId;
      this.cache = null;

      // Persist to .env file if available
      try {
        const envPath = path.resolve(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf8');
          envContent = this.upsertEnvKey(envContent, 'VERCEL_TOKEN', token);
          envContent = this.upsertEnvKey(envContent, 'VERCEL_PROJECT_ID', projectId);
          if (teamId) envContent = this.upsertEnvKey(envContent, 'VERCEL_TEAM_ID', teamId);
          fs.writeFileSync(envPath, envContent, 'utf8');
        }
      } catch (writeErr) {
        this.logger.warn('Could not write updated credentials to .env file', writeErr);
      }

      return {
        success: true,
        message: 'Successfully authenticated with Vercel Web Analytics API!',
        visitors: json.data?.visitors ?? 0,
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to reach Vercel API: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private upsertEnvKey(content: string, key: string, val: string): string {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const newLine = `${key}="${val}"`;
    return regex.test(content) ? content.replace(regex, newLine) : `${content}\n${newLine}`;
  }

  async getAnalytics(): Promise<VercelAnalyticsData | null> {
    if (!this.isConfigured()) {
      return null;
    }

    if (this.cache && Date.now() < this.cache.expiresAt) {
      return this.cache.data;
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.fetchFromVercel()
      .then((res) => {
        if (res) {
          this.cache = { data: res, expiresAt: Date.now() + 60_000 };
        }
        return res;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  private async fetchFromVercel(): Promise<VercelAnalyticsData | null> {
    const token = this.token;
    const projectId = this.projectId;
    if (!token || !projectId) return null;

    const teamId = this.teamId;
    const now = new Date();
    const until = now.toISOString().slice(0, 10);
    const sinceDate = new Date();
    sinceDate.setDate(now.getDate() - 13);
    const since = sinceDate.toISOString().slice(0, 10);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const buildUrl = (path: string, params: Record<string, string | number>) => {
      const url = new URL(`https://api.vercel.com/v1/query/web-analytics/${path}`);
      url.searchParams.set('projectId', projectId);
      if (teamId) url.searchParams.set('teamId', teamId);
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v));
      }
      return url.toString();
    };

    const safeFetchJson = async <T>(url: string): Promise<T | null> => {
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          this.logger.warn(`Vercel Web Analytics query failed: ${url} -> status ${res.status}: ${errText.slice(0, 100)}`);
          return null;
        }
        return (await res.json()) as T;
      } catch (err) {
        this.logger.warn(`Network error fetching from Vercel: ${url}`, err);
        return null;
      }
    };

    try {
      const [
        countJson,
        dailyJson,
        pagesJson,
        countriesJson,
        devicesJson,
        referrersJson,
        browsersJson,
        osJson,
        eventsJson,
      ] = await Promise.all([
        safeFetchJson<{ data?: { pageviews?: number; visitors?: number } }>(
          buildUrl('visits/count', {})
        ),
        safeFetchJson<{ data?: Array<{ timestamp: string; pageviews?: number; visitors?: number }> }>(
          buildUrl('visits/aggregate', { by: 'day', since, until })
        ),
        safeFetchJson<{ data?: Array<{ requestPath: string; pageviews?: number; visitors?: number }> }>(
          buildUrl('visits/aggregate', { by: 'requestPath', limit: 12, since, until })
        ),
        safeFetchJson<{ data?: Array<{ country: string; pageviews?: number; visitors?: number }> }>(
          buildUrl('visits/aggregate', { by: 'country', limit: 8, since, until })
        ),
        safeFetchJson<{ data?: Array<{ deviceType: string; pageviews?: number; visitors?: number }> }>(
          buildUrl('visits/aggregate', { by: 'deviceType', limit: 5, since, until })
        ),
        safeFetchJson<{ data?: Array<{ referrerHostname: string; pageviews?: number; visitors?: number }> }>(
          buildUrl('visits/aggregate', { by: 'referrerHostname', limit: 8, since, until })
        ),
        safeFetchJson<{ data?: Array<{ browserName: string; pageviews?: number; visitors?: number }> }>(
          buildUrl('visits/aggregate', { by: 'browserName', limit: 6, since, until })
        ),
        safeFetchJson<{ data?: Array<{ osName: string; pageviews?: number; visitors?: number }> }>(
          buildUrl('visits/aggregate', { by: 'osName', limit: 6, since, until })
        ),
        safeFetchJson<{ data?: Array<{ eventName: string; count?: number; visitors?: number }> }>(
          buildUrl('events/aggregate', { by: 'eventName', limit: 10, since, until })
        ),
      ]);

      if (!countJson && !dailyJson) {
        return null;
      }

      const totalPageViews = countJson?.data?.pageviews ?? 0;
      const uniqueVisitors = countJson?.data?.visitors ?? 0;

      const dayFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      const dailyPoints = dailyJson?.data ?? [];
      const visitorTrend = dailyPoints.map((pt) => {
        const dt = new Date(pt.timestamp);
        return {
          date: pt.timestamp.slice(0, 10),
          label: dayFormatter.format(dt),
          visitors: pt.visitors ?? 0,
          uniqueVisitors: pt.visitors ?? 0,
          activeUsers: Math.round((pt.visitors ?? 0) * 0.4),
          pageViews: pt.pageviews ?? 0,
        };
      });

      const totalVisitors = dailyPoints.reduce((acc, p) => acc + (p.visitors ?? 0), 0) || uniqueVisitors;

      const half = Math.floor(dailyPoints.length / 2);
      const recentSum = dailyPoints.slice(half).reduce((acc, p) => acc + (p.visitors ?? 0), 0);
      const prevSum = dailyPoints.slice(0, half).reduce((acc, p) => acc + (p.visitors ?? 0), 0);
      const visitorGrowthPct =
        prevSum > 0
          ? Math.round(((recentSum - prevSum) / prevSum) * 1000) / 10
          : 0;

      // Visitor per Page
      const rawPages = pagesJson?.data ?? [];
      const visitorPerPage = rawPages.map((p) => {
        const visitors = p.visitors ?? 0;
        const pageViews = p.pageviews ?? 0;
        return {
          id: p.requestPath,
          path: p.requestPath,
          label: labelForPath(p.requestPath),
          visitors,
          uniqueVisitors: visitors,
          pageViews,
          avgDurationSec: 120,
          bounceRate: 0,
          sharePct: totalPageViews > 0 ? Math.round((pageViews / totalPageViews) * 1000) / 10 : 0,
        };
      });

      // Top Countries (by=country)
      const rawCountries = countriesJson?.data ?? [];
      const countryTotalVisitors = rawCountries.reduce((sum, c) => sum + (c.visitors ?? 0), 0) || uniqueVisitors || 1;
      const topCountries: DimensionMetricItem[] = rawCountries.map((c) => {
        const code = (c.country || 'OTHER').toUpperCase();
        const meta = COUNTRY_LOOKUP[code] ?? { name: code === 'OTHER' ? 'Other Countries' : code, flag: '🌐' };
        const visitors = c.visitors ?? 0;
        return {
          key: code,
          label: meta.name,
          flag: meta.flag,
          visitors,
          pageViews: c.pageviews ?? 0,
          sharePct: Math.round((visitors / countryTotalVisitors) * 1000) / 10,
        };
      });

      // Device Breakdown (by=deviceType)
      const rawDevices = devicesJson?.data ?? [];
      const deviceTotalVisitors = rawDevices.reduce((sum, d) => sum + (d.visitors ?? 0), 0) || uniqueVisitors || 1;
      const topDevices: DimensionMetricItem[] = rawDevices.map((d) => {
        const key = d.deviceType || 'unknown';
        const visitors = d.visitors ?? 0;
        return {
          key,
          label: labelForDevice(key),
          visitors,
          pageViews: d.pageviews ?? 0,
          sharePct: Math.round((visitors / deviceTotalVisitors) * 1000) / 10,
        };
      });

      // Referrers / Traffic Sources (by=referrerHostname)
      const rawReferrers = referrersJson?.data ?? [];
      const refTotalVisitors = rawReferrers.reduce((sum, r) => sum + (r.visitors ?? 0), 0) || uniqueVisitors || 1;
      const topReferrers: DimensionMetricItem[] = rawReferrers.map((r) => {
        const key = r.referrerHostname || 'direct';
        const visitors = r.visitors ?? 0;
        return {
          key,
          label: labelForReferrer(key),
          visitors,
          pageViews: r.pageviews ?? 0,
          sharePct: Math.round((visitors / refTotalVisitors) * 1000) / 10,
        };
      });

      // Browsers (by=browserName)
      const rawBrowsers = browsersJson?.data ?? [];
      const browserTotalVisitors = rawBrowsers.reduce((sum, b) => sum + (b.visitors ?? 0), 0) || uniqueVisitors || 1;
      const topBrowsers: DimensionMetricItem[] = rawBrowsers.map((b) => {
        const key = b.browserName || 'Unknown';
        const visitors = b.visitors ?? 0;
        return {
          key,
          label: key,
          visitors,
          pageViews: b.pageviews ?? 0,
          sharePct: Math.round((visitors / browserTotalVisitors) * 1000) / 10,
        };
      });

      // Operating Systems (by=osName)
      const rawOs = osJson?.data ?? [];
      const osTotalVisitors = rawOs.reduce((sum, o) => sum + (o.visitors ?? 0), 0) || uniqueVisitors || 1;
      const topOperatingSystems: DimensionMetricItem[] = rawOs.map((o) => {
        const key = o.osName || 'Unknown';
        const visitors = o.visitors ?? 0;
        return {
          key,
          label: key,
          visitors,
          pageViews: o.pageviews ?? 0,
          sharePct: Math.round((visitors / osTotalVisitors) * 1000) / 10,
        };
      });

      // Custom Events (events/aggregate)
      const rawEvents = eventsJson?.data ?? [];
      const customEvents: CustomEventMetricItem[] = rawEvents.map((e) => ({
        eventName: e.eventName,
        label: e.eventName.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        count: e.count ?? 0,
        visitors: e.visitors ?? 0,
      }));

      return {
        configured: true,
        visitors: {
          totalVisitors: totalVisitors > 0 ? totalVisitors : uniqueVisitors,
          uniqueVisitors,
          totalPageViews,
          visitorGrowthPct,
        },
        visitorTrend,
        visitorPerPage,
        topCountries,
        topDevices,
        topReferrers,
        topBrowsers,
        topOperatingSystems,
        customEvents,
      };
    } catch (err) {
      this.logger.error('Failed to query Vercel Web Analytics API', err);
      return null;
    }
  }
}
