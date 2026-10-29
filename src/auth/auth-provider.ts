import { AuthenticatedUser } from './authenticated-user';

export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');

export interface AuthProvider {
  getUser(accessToken: string): Promise<AuthenticatedUser | null>;
}
