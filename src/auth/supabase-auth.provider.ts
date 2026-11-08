import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import type { JsonWebKey, KeyObject } from 'node:crypto';
import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { AuthenticatedUser } from './authenticated-user';
import { AuthProvider } from './auth-provider';

interface SupabaseAuthUser {
  id?: unknown;
  email?: unknown;
  email_confirmed_at?: unknown;
  user_metadata?: unknown;
}

interface JwtHeader {
  alg?: unknown;
  kid?: unknown;
}

interface JwtPayload {
  sub?: unknown;
  email?: unknown;
  exp?: unknown;
  iss?: unknown;
  role?: unknown;
  email_verified?: unknown;
  email_confirmed_at?: unknown;
  user_metadata?: unknown;
}

interface JwksResponse {
  keys?: Array<Record<string, unknown>>;
}

/** How long a token verified by Supabase is trusted before it is re-checked. */
const VERIFIED_TOKEN_TTL_MS = 5 * 60_000;
const JWKS_CACHE_TTL_MS = 6 * 60 * 60_000;
const MAX_CACHED_TOKENS = 1_000;
const REQUEST_TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [300, 750];

function parseJwtSegment<T>(segment: string | undefined): T | null {
  if (!segment) return null;
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

/** Reads the JWT expiry so a cached entry never outlives the token itself. */
function tokenExpiryMs(accessToken: string): number | null {
  const decoded = parseJwtSegment<JwtPayload>(accessToken.split('.')[1]);
  return typeof decoded?.exp === 'number' ? decoded.exp * 1000 : null;
}

function extractDisplayName(userMetadata: unknown): string | undefined {
  const metadata =
    userMetadata && typeof userMetadata === 'object'
      ? (userMetadata as Record<string, unknown>)
      : undefined;
  return [metadata?.full_name, metadata?.name, metadata?.preferred_username, metadata?.username]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class SupabaseAuthProvider implements AuthProvider, OnModuleInit {
  private readonly logger = new Logger(SupabaseAuthProvider.name);

  /**
   * Verified tokens are remembered (keyed by a SHA-256 hash, never the raw token) and
   * concurrent verifications of the same token share a single request.
   * `tokenExpiresAt` allows stale-while-revalidate fallback if Supabase has a brief outage.
   */
  private readonly verified = new Map<
    string,
    { user: AuthenticatedUser; expiresAt: number; tokenExpiresAt: number }
  >();
  private readonly inFlight = new Map<string, Promise<AuthenticatedUser | null>>();

  private jwksCache: { keys: Map<string, { key: KeyObject; alg: string }>; expiresAt: number } | null = null;
  private jwksInFlight: Promise<Map<string, { key: KeyObject; alg: string }> | null> | null = null;

  onModuleInit(): void {
    const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (supabaseUrl && publishableKey) {
      void this.getJwksKeys(supabaseUrl, publishableKey).catch(() => undefined);
    }
  }

  async getUser(accessToken: string): Promise<AuthenticatedUser | null> {
    const now = Date.now();
    const tokenExpiry = tokenExpiryMs(accessToken);
    if (tokenExpiry !== null && tokenExpiry <= now) {
      return null;
    }

    const key = createHash('sha256').update(accessToken).digest('base64url');
    const cached = this.verified.get(key);
    if (cached) {
      if (cached.expiresAt > now) return cached.user;
      if (cached.tokenExpiresAt <= now) {
        this.verified.delete(key);
      }
    }

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const verification = this.verifyToken(accessToken, cached && cached.tokenExpiresAt > now ? cached.user : undefined)
      .then((user) => {
        if (user) {
          const effectiveTokenExpiry = tokenExpiry ?? Date.now() + VERIFIED_TOKEN_TTL_MS;
          const expiresAt = Math.min(Date.now() + VERIFIED_TOKEN_TTL_MS, effectiveTokenExpiry);
          if (expiresAt > Date.now()) {
            if (this.verified.size >= MAX_CACHED_TOKENS) this.pruneVerified();
            this.verified.set(key, {
              user,
              expiresAt,
              tokenExpiresAt: effectiveTokenExpiry,
            });
          }
        } else {
          this.verified.delete(key);
        }
        return user;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, verification);
    return verification;
  }

  private pruneVerified() {
    const now = Date.now();
    for (const [key, entry] of this.verified) {
      if (entry.tokenExpiresAt <= now || entry.expiresAt <= now) this.verified.delete(key);
    }
    while (this.verified.size >= MAX_CACHED_TOKENS) {
      const oldest = this.verified.keys().next().value;
      if (oldest === undefined) break;
      this.verified.delete(oldest);
    }
  }

  private async verifyToken(
    accessToken: string,
    staleUser?: AuthenticatedUser,
  ): Promise<AuthenticatedUser | null> {
    const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !publishableKey) {
      throw new ServiceUnavailableException('Supabase Auth is not fully configured. Contact your administrator.');
    }

    // 1. Fast path: verify asymmetric JWT (ES256 / RS256) locally using cached JWKS public keys.
    const localResult = await this.verifyWithJwks(accessToken, supabaseUrl, publishableKey);
    if (localResult !== undefined) {
      return localResult;
    }

    // 2. Fallback path: verify against Supabase Auth /auth/v1/user endpoint with retry + stale fallback.
    try {
      return await this.verifyWithSupabaseEndpoint(accessToken, supabaseUrl, publishableKey);
    } catch (error) {
      if (staleUser) {
        this.logger.warn('Supabase Auth endpoint unreachable; using previously verified active token.');
        return staleUser;
      }
      throw error;
    }
  }

  private async verifyWithJwks(
    accessToken: string,
    supabaseUrl: string,
    publishableKey: string,
  ): Promise<AuthenticatedUser | null | undefined> {
    const parts = accessToken.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const header = parseJwtSegment<JwtHeader>(headerB64);
    const payload = parseJwtSegment<JwtPayload>(payloadB64);
    if (!header || !payload) return null;

    const alg = typeof header.alg === 'string' ? header.alg : '';
    const kid = typeof header.kid === 'string' ? header.kid : '';
    if ((alg !== 'ES256' && alg !== 'RS256') || !kid) {
      // Token uses symmetric signing (e.g. HS256) or has no kid; fall back to HTTP verification.
      return undefined;
    }

    let keys = await this.getJwksKeys(supabaseUrl, publishableKey, false);
    if (keys && !keys.has(kid)) {
      // Key rotation may have occurred; force-refresh JWKS once.
      keys = await this.getJwksKeys(supabaseUrl, publishableKey, true);
    }
    const jwkEntry = keys?.get(kid);
    if (!jwkEntry) {
      return undefined;
    }

    try {
      const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, 'utf8');
      const signature = Buffer.from(signatureB64, 'base64url');
      const isValid =
        jwkEntry.alg === 'ES256'
          ? cryptoVerify('sha256', signingInput, { key: jwkEntry.key, dsaEncoding: 'ieee-p1363' }, signature)
          : cryptoVerify('RSA-SHA256', signingInput, jwkEntry.key, signature);

      if (!isValid) return null;
    } catch {
      return null;
    }

    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
      return null;
    }
    if (typeof payload.iss === 'string' && payload.iss !== `${supabaseUrl}/auth/v1`) {
      return null;
    }
    if (payload.role === 'anon' || payload.role === 'service_role') {
      return null;
    }
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      return null;
    }

    const metadata =
      payload.user_metadata && typeof payload.user_metadata === 'object'
        ? (payload.user_metadata as Record<string, unknown>)
        : undefined;
    const name = extractDisplayName(metadata);
    const email = typeof payload.email === 'string' && payload.email.length > 0 ? payload.email : undefined;
    const emailVerified =
      metadata?.email_verified === true ||
      payload.email_verified === true ||
      typeof payload.email_confirmed_at === 'string' ||
      (Boolean(email) && metadata?.email_verified !== false);

    return {
      id: payload.sub,
      ...(email ? { email } : {}),
      ...(name ? { name } : {}),
      ...(emailVerified ? { emailVerified: true } : {}),
    };
  }

  private async getJwksKeys(
    supabaseUrl: string,
    publishableKey: string,
    forceRefresh = false,
  ): Promise<Map<string, { key: KeyObject; alg: string }> | null> {
    const now = Date.now();
    if (!forceRefresh && this.jwksCache && this.jwksCache.expiresAt > now) {
      return this.jwksCache.keys;
    }
    if (this.jwksInFlight) {
      return this.jwksInFlight;
    }

    this.jwksInFlight = (async () => {
      try {
        const response = await this.fetchWithRetry(`${supabaseUrl}/auth/v1/.well-known/jwks.json`, {
          headers: {
            apikey: publishableKey,
            accept: 'application/json',
          },
          cache: 'no-store',
        });
        if (!response.ok) return this.jwksCache?.keys ?? null;

        const data = (await response.json()) as JwksResponse;
        if (!Array.isArray(data?.keys)) return this.jwksCache?.keys ?? null;

        const parsedKeys = new Map<string, { key: KeyObject; alg: string }>();
        for (const rawKey of data.keys) {
          const kid = typeof rawKey?.kid === 'string' ? rawKey.kid : '';
          const alg = typeof rawKey?.alg === 'string' ? rawKey.alg : 'ES256';
          if (!kid) continue;
          try {
            const keyObj = createPublicKey({ key: rawKey as unknown as JsonWebKey, format: 'jwk' });
            parsedKeys.set(kid, { key: keyObj, alg });
          } catch {
            // Ignore unsupported key entries
          }
        }

        if (parsedKeys.size > 0) {
          this.jwksCache = {
            keys: parsedKeys,
            expiresAt: Date.now() + JWKS_CACHE_TTL_MS,
          };
          return parsedKeys;
        }
        return this.jwksCache?.keys ?? null;
      } catch {
        return this.jwksCache?.keys ?? null;
      } finally {
        this.jwksInFlight = null;
      }
    })();

    return this.jwksInFlight;
  }

  private async verifyWithSupabaseEndpoint(
    accessToken: string,
    supabaseUrl: string,
    publishableKey: string,
  ): Promise<AuthenticatedUser | null> {
    let response: Response;
    try {
      response = await this.fetchWithRetry(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: publishableKey,
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
        },
        cache: 'no-store',
      });
    } catch {
      throw new ServiceUnavailableException('Supabase Auth could not be reached. Check the configuration and try again.');
    }

    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) {
      throw new ServiceUnavailableException('Supabase Auth could not verify the session. Please try again shortly.');
    }

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new ServiceUnavailableException('Supabase Auth returned an invalid response. Contact your administrator.');
    }

    const user = result && typeof result === 'object' ? (result as SupabaseAuthUser) : undefined;
    if (typeof user?.id !== 'string' || user.id.length === 0) return null;

    const name = extractDisplayName(user.user_metadata);

    return {
      id: user.id,
      ...(typeof user.email === 'string' ? { email: user.email } : {}),
      ...(typeof name === 'string' ? { name } : {}),
      ...(typeof user.email_confirmed_at === 'string' ? { emailVerified: true } : {}),
    };
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const response = await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (response.status >= 500 && attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt]);
        }
      }
    }
    throw lastError;
  }
}
