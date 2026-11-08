import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AuthUserAdminProvider } from './auth-provider';

interface SupabaseAdminUser {
  id?: unknown;
  email?: unknown;
  code?: unknown;
  msg?: unknown;
  message?: unknown;
}

const ADMIN_REQUEST_TIMEOUT_MS = 12_000;
const ADMIN_RETRY_DELAYS_MS = [350, 800];

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class SupabaseAuthAdminProvider implements AuthUserAdminProvider {
  async createUser(input: { email: string; password: string; name: string }): Promise<{ id: string; email: string }> {
    const { supabaseUrl, secretKey } = this.configuration();
    let response: Response;
    try {
      response = await this.fetchWithRetry(`${supabaseUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers: this.headers(secretKey),
        body: JSON.stringify({
          email: input.email,
          password: input.password,
          email_confirm: true,
          user_metadata: { full_name: input.name, name: input.name },
        }),
        cache: 'no-store',
      });
    } catch {
      throw new ServiceUnavailableException('Could not connect to Supabase Auth to create the account.');
    }

    const payload = await response.json().catch(() => null) as SupabaseAdminUser | null;
    const errorText = [payload?.code, payload?.msg, payload?.message].filter((value): value is string => typeof value === 'string').join(' ');
    if (response.status === 409 || /already registered|already exists|email.*(already|exists|registered)|already.*email/i.test(errorText)) {
      throw new ConflictException('A Supabase Auth account with this email already exists.');
    }
    if (!response.ok) {
      if (response.status === 400 || response.status === 422) {
        throw new BadRequestException(errorText || 'Supabase Auth rejected the account details or initial password.');
      }
      throw new ServiceUnavailableException('Supabase Auth could not create this account.');
    }
    if (typeof payload?.id !== 'string' || typeof payload.email !== 'string') {
      throw new ServiceUnavailableException('Supabase Auth returned an invalid account response.');
    }
    return { id: payload.id, email: payload.email };
  }

  async deleteUser(userId: string): Promise<void> {
    const { supabaseUrl, secretKey } = this.configuration();
    let response: Response;
    try {
      response = await this.fetchWithRetry(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: this.headers(secretKey),
        cache: 'no-store',
      });
    } catch {
      throw new ServiceUnavailableException('Could not connect to Supabase Auth to roll back the account.');
    }
    if (!response.ok) throw new ServiceUnavailableException('Could not roll back the Supabase Auth account.');
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= ADMIN_RETRY_DELAYS_MS.length; attempt++) {
      try {
        const response = await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(ADMIN_REQUEST_TIMEOUT_MS),
        });
        if (response.status >= 500 && attempt < ADMIN_RETRY_DELAYS_MS.length) {
          await sleep(ADMIN_RETRY_DELAYS_MS[attempt]);
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < ADMIN_RETRY_DELAYS_MS.length) {
          await sleep(ADMIN_RETRY_DELAYS_MS[attempt]);
        }
      }
    }
    throw lastError;
  }

  private configuration() {
    const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !secretKey) {
      throw new ServiceUnavailableException('Supabase account management is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY.');
    }
    return { supabaseUrl, secretKey };
  }

  private headers(secretKey: string): HeadersInit {
    return {
      apikey: secretKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }
}
