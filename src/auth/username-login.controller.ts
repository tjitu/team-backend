import { Body, Controller, HttpException, Post, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { IsString, Length, Matches } from 'class-validator';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

class UsernameLoginDto {
  @IsString() @Length(3,40) @Matches(/^[a-z0-9][a-z0-9._-]+$/) username!: string;
  @IsString() @Length(1,72) password!: string;
}

@Controller('team/auth/username-session')
export class UsernameLoginController {
  constructor(private readonly prisma: PrismaService) {}
  @Post()
  async login(@Body() input: UsernameLoginDto) {
    const key = createHash('sha256').update(input.username).digest('hex');
    const [bucket] = await this.prisma.$queryRaw<Array<{ attempts: number }>>`INSERT INTO "team_login_throttle" (key,attempts,"expiresAt")
      VALUES (${key},1,CURRENT_TIMESTAMP + interval '15 minutes') ON CONFLICT (key) DO UPDATE
      SET attempts=CASE WHEN "team_login_throttle"."expiresAt"<CURRENT_TIMESTAMP THEN 1 ELSE "team_login_throttle".attempts+1 END,
        "expiresAt"=CASE WHEN "team_login_throttle"."expiresAt"<CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP+interval '15 minutes'
          ELSE "team_login_throttle"."expiresAt" END RETURNING attempts`;
    if (bucket.attempts > 10) throw new HttpException('Too many sign-in attempts. Try again later.',429);
    await this.prisma.teamLoginThrottle.deleteMany({ where: { expiresAt: { lt: new Date(Date.now()-86400000) } } });
    const member = await this.prisma.teamMember.findUnique({ where: { username: input.username } });
    const url = process.env.SUPABASE_URL?.replace(/\/+$/,'');
    const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !apiKey) throw new ServiceUnavailableException('Supabase Auth is not configured.');
    // Password verification and session issuance remain owned by Supabase.
    const response = await fetch(`${url}/auth/v1/token?grant_type=password`,{
      method: 'POST',headers: { apikey: apiKey,'Content-Type': 'application/json' },
      body: JSON.stringify({ email: member?.isActive ? member.email : 'unavailable-account@invalid.example',password: input.password }),
      signal: AbortSignal.timeout(12000),
    });
    const result = await response.json() as { access_token?: string; refresh_token?: string };
    if (!response.ok || !member?.isActive || !result.access_token || !result.refresh_token) throw new UnauthorizedException('The username or password is incorrect.');
    return { access_token: result.access_token,refresh_token: result.refresh_token };
  }
}
