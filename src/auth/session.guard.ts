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
  };
}

@Injectable()
export class SessionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const cookie = request.headers.cookie;
    const sessionUrl = process.env.BETTER_AUTH_SESSION_URL;

    if (!cookie) {
      throw new UnauthorizedException('Sign in is required.');
    }
    if (!sessionUrl) {
      throw new ServiceUnavailableException('Authentication is not configured.');
    }

    let response: Response;
    try {
      response = await fetch(sessionUrl, {
        headers: { cookie, accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
        cache: 'no-store',
      });
    } catch {
      throw new ServiceUnavailableException('The authentication service is unavailable.');
    }

    if (!response.ok) {
      if (response.status >= 500) {
        throw new ServiceUnavailableException('The authentication service is unavailable.');
      }
      throw new UnauthorizedException('Sign in is required.');
    }

    let body: BetterAuthSessionResponse;
    try {
      body = (await response.json()) as BetterAuthSessionResponse;
    } catch {
      throw new ServiceUnavailableException('The authentication service returned an invalid response.');
    }

    const user = body.user;
    if (typeof user?.id !== 'string' || user.id.length === 0) {
      throw new UnauthorizedException('Sign in is required.');
    }

    request.user = {
      id: user.id,
      ...(typeof user.email === 'string' ? { email: user.email } : {}),
      ...(typeof user.name === 'string' ? { name: user.name } : {}),
    };
    return true;
  }
}
