import { Global, Module } from '@nestjs/common';
import { AUTH_PROVIDER, AUTH_USER_ADMIN_PROVIDER } from './auth-provider';
import { SessionGuard } from './session.guard';
import { SupabaseAuthProvider } from './supabase-auth.provider';
import { SupabaseAuthAdminProvider } from './supabase-auth-admin.provider';

@Global()
@Module({
  providers: [
    SessionGuard,
    SupabaseAuthProvider,
    SupabaseAuthAdminProvider,
    { provide: AUTH_PROVIDER, useExisting: SupabaseAuthProvider },
    { provide: AUTH_USER_ADMIN_PROVIDER, useExisting: SupabaseAuthAdminProvider },
  ],
  exports: [AUTH_PROVIDER, AUTH_USER_ADMIN_PROVIDER, SessionGuard],
})
export class AuthModule {}
