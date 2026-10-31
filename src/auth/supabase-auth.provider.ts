import { createHash } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AuthenticatedUser } from './authenticated-user';
import { AuthProvider } from './auth-provider';

interface SupabaseAuthUser {
  id?: unknown;
  email?: unknown;
  email_confirmed_at?: unknown;
  user_metadata?: unknown;
}

/** How long a token verified by Supabase is trusted before it is re-checked. */
const VERIFIED_TOKEN_TTL_MS = 60_000;
const MAX_CACHED_TOKENS = 1_000;

/** Reads the (already verified) JWT expiry so a cached entry never outlives the token itself. */
function tokenExpiryMs(accessToken: string): number | null {
  const payload = accessToken.split('.')[1];
  if (!payload) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

@Injectable()
export class SupabaseAuthProvider implements AuthProvider {
  /**
   * Every API call used to make a full network round trip to Supabase Auth (~0.5s+).
   * Verified tokens are remembered briefly (keyed by a hash, never the raw token) and
   * concurrent verifications of the same token share a single request.
   */
  private readonly verified = new Map<string, { user: AuthenticatedUser; expiresAt: number }>();
  private readonly inFlight = new Map<string, Promise<AuthenticatedUser | null>>();

  async getUser(accessToken: string): Promise<AuthenticatedUser | null> {
    const key = createHash('sha256').update(accessToken).digest('base64url');
    const now = Date.now();
    const cached = this.verified.get(key);
    if (cached) {
      if (cached.expiresAt > now) return cached.user;
      this.verified.delete(key);
    }

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const verification = this.verifyWithSupabase(accessToken)
      .then((user) => {
        if (user) {
          const tokenExpiry = tokenExpiryMs(accessToken) ?? now + VERIFIED_TOKEN_TTL_MS;
          const expiresAt = Math.min(Date.now() + VERIFIED_TOKEN_TTL_MS, tokenExpiry);
          if (expiresAt > Date.now()) {
            if (this.verified.size >= MAX_CACHED_TOKENS) this.pruneVerified();
            this.verified.set(key, { user, expiresAt });
          }
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
      if (entry.expiresAt <= now) this.verified.delete(key);
    }
    // Still full: drop the oldest entries (Map preserves insertion order).
    while (this.verified.size >= MAX_CACHED_TOKENS) {
      const oldest = this.verified.keys().next().value;
      if (oldest === undefined) break;
      this.verified.delete(oldest);
    }
  }

  private async verifyWithSupabase(accessToken: string): Promise<AuthenticatedUser | null> {
    const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !publishableKey) {
      throw new ServiceUnavailableException('Supabase Auth is not fully configured. Contact your administrator.');
    }

    let response: Response;
    try {
      response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: publishableKey,
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(5_000),
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

    const user = result && typeof result === 'object' ? result as SupabaseAuthUser : undefined;
    if (typeof user?.id !== 'string' || user.id.length === 0) return null;

    const metadata =
      user.user_metadata && typeof user.user_metadata === 'object'
        ? user.user_metadata as Record<string, unknown>
        : undefined;
    const name = [metadata?.full_name, metadata?.name, metadata?.preferred_username, metadata?.username]
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
      ?.trim();

    return {
      id: user.id,
      ...(typeof user.email === 'string' ? { email: user.email } : {}),
      ...(typeof name === 'string' ? { name } : {}),
      ...(typeof user.email_confirmed_at === 'string' ? { emailVerified: true } : {}),
    };
  }
}
