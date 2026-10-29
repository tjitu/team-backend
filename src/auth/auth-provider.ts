import { AuthenticatedUser } from './authenticated-user';

export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');

export interface AuthProvider {
  getUser(accessToken: string): Promise<AuthenticatedUser | null>;
}

export const AUTH_USER_ADMIN_PROVIDER = Symbol('AUTH_USER_ADMIN_PROVIDER');

export interface AuthUserAdminProvider {
  createUser(input: { email: string; password: string; name: string }): Promise<{ id: string; email: string }>;
  deleteUser(userId: string): Promise<void>;
}
