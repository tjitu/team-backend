import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AuthUserAdminProvider } from './auth-provider';

interface SupabaseAdminUser {
  id?: unknown;
  email?: unknown;
  code?: unknown;
  msg?: unknown;
  message?: unknown;
}

@Injectable()
export class SupabaseAuthAdminProvider implements AuthUserAdminProvider {
  async createUser(input: { email: string; password: string; name: string }): Promise<{ id: string; email: string }> {
    const { supabaseUrl, secretKey } = this.configuration();
    let response: Response;
    try {
      response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers: this.headers(secretKey),
        body: JSON.stringify({
          email: input.email,
          password: input.password,
          email_confirm: true,
          user_metadata: { full_name: input.name, name: input.name },
        }),
        signal: AbortSignal.timeout(10_000),
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
      response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: this.headers(secretKey),
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
      });
    } catch {
      throw new ServiceUnavailableException('Could not connect to Supabase Auth to roll back the account.');
    }
    if (!response.ok) throw new ServiceUnavailableException('Could not roll back the Supabase Auth account.');
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
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }
}
