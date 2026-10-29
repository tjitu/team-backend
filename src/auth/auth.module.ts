import { Global, Module } from '@nestjs/common';
import { AUTH_PROVIDER } from './auth-provider';
import { SessionGuard } from './session.guard';
import { SupabaseAuthProvider } from './supabase-auth.provider';

@Global()
@Module({
  providers: [
    SessionGuard,
    SupabaseAuthProvider,
    { provide: AUTH_PROVIDER, useExisting: SupabaseAuthProvider },
  ],
  exports: [AUTH_PROVIDER, SessionGuard],
})
export class AuthModule {}
