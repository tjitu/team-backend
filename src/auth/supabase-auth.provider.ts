import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AuthenticatedUser } from './authenticated-user';
import { AuthProvider } from './auth-provider';

interface SupabaseAuthUser {
  id?: unknown;
  email?: unknown;
  email_confirmed_at?: unknown;
  user_metadata?: unknown;
}

@Injectable()
export class SupabaseAuthProvider implements AuthProvider {
  async getUser(accessToken: string): Promise<AuthenticatedUser | null> {
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
