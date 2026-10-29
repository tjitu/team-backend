import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from './authenticated-user';

interface BetterAuthSessionResponse {
  user?: {
    id?: unknown;
    email?: unknown;
    name?: unknown;
    emailVerified?: unknown;
  };
}

@Injectable()
export class SessionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const cookie = request.headers.cookie;
    const sessionUrl = process.env.BETTER_AUTH_SESSION_URL;

    if (!cookie) {
      throw new UnauthorizedException('Sesi tidak ditemukan. Masuk dengan akun Jitu Anda.');
    }
    if (!sessionUrl) {
      throw new ServiceUnavailableException('Layanan autentikasi Jitu belum dikonfigurasi. Hubungi administrator.');
    }

    let response: Response;
    try {
      response = await fetch(sessionUrl, {
        headers: { cookie, accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
        cache: 'no-store',
      });
    } catch {
      throw new ServiceUnavailableException('Layanan autentikasi Jitu tidak dapat dihubungi. Periksa konfigurasi, lalu muat ulang.');
    }

    if (!response.ok) {
      if (response.status >= 500) {
        throw new ServiceUnavailableException('Layanan autentikasi Jitu tidak dapat dihubungi. Periksa konfigurasi, lalu muat ulang.');
      }
      throw new UnauthorizedException('Sesi tidak ditemukan. Masuk dengan akun Jitu Anda.');
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ServiceUnavailableException('Layanan autentikasi Jitu memberikan respons yang tidak valid. Hubungi administrator.');
    }

    const user =
      body && typeof body === 'object'
        ? (body as BetterAuthSessionResponse).user
        : undefined;
    if (typeof user?.id !== 'string' || user.id.length === 0) {
      throw new UnauthorizedException('Sesi tidak ditemukan. Masuk dengan akun Jitu Anda.');
    }

    request.user = {
      id: user.id,
      ...(typeof user.email === 'string' ? { email: user.email } : {}),
      ...(typeof user.name === 'string' ? { name: user.name } : {}),
      ...(typeof user.emailVerified === 'boolean' ? { emailVerified: user.emailVerified } : {}),
    };
    return true;
  }
}
