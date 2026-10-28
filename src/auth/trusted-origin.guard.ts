import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class TrustedOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) return true;

    const configuredOrigin = process.env.TEAM_FRONTEND_ORIGIN;
    const requestOrigin = request.headers.origin;
    if (!configuredOrigin || !requestOrigin || !this.sameOrigin(configuredOrigin, requestOrigin)) {
      throw new ForbiddenException('Request origin is not trusted.');
    }
    return true;
  }

  private sameOrigin(expected: string, actual: string): boolean {
    try {
      return new URL(expected).origin === new URL(actual).origin;
    } catch {
      return false;
    }
  }
}
