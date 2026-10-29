import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user';
import { AUTH_PROVIDER } from './auth-provider';
import type { AuthProvider } from './auth-provider';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const authorization = request.headers.authorization;
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!accessToken) {
      throw new UnauthorizedException('Session not found. Sign in with your Supabase account.');
    }

    const user = await this.authProvider.getUser(accessToken);
    if (!user) {
      throw new UnauthorizedException('Your session has expired. Sign in again with your Supabase account.');
    }

    request.user = user;
    return true;
  }
}
