import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TeamAccessService } from '../../team-access/team-access.service';
import { JituPostgresManagementDataSource } from '../jitu-management.data-source';
import { GrowthConfigurationDto, GrowthQueueQuery, GrowthReviewDto } from './growth.dto';
import { rethrowGrowthError } from './growth-errors';

@Injectable()
export class GrowthAdminService {
  constructor(private readonly access: TeamAccessService, private readonly management: JituPostgresManagementDataSource) {}
  private async administrator(userId: string) {
    const actor = await this.access.getActiveMember(userId, undefined, true);
    if (!['SYSTEM_OWNER','SYSTEM_ADMIN'].includes(actor.role)) throw new ForbiddenException('System administrator access is required.');
    return actor;
  }
  private async query<T>(sql: Prisma.Sql): Promise<T[]> {
    try { return await this.management.growthDatabase().$queryRaw<T[]>(sql); }
    catch (error) { rethrowGrowthError(error); }
  }
  async defaults(userId: string) {
    await this.administrator(userId);
    const rows = await this.query<{ config: Prisma.JsonObject }>(Prisma.sql`SELECT growth_defaults() AS config`);
    const community = rows[0].config.community as Prisma.JsonObject;
    const globalUrl = process.env.JITU_COMMUNITY_URL;
    if (globalUrl && /^https:\/\/[^\s@]+$/.test(globalUrl)) community.url = globalUrl;
    return { config: rows[0].config, version: 0 };
  }
  async configuration(userId: string, id: string) {
    await this.administrator(userId);
    const rows = await this.query<{ config: Prisma.JsonObject; version: number }>(Prisma.sql`
      SELECT growth_validate_config("growthConfig") AS config,"growthVersion" AS version FROM "TryOut" WHERE id=${id}`);
    if (!rows[0]) throw new NotFoundException('Tryout tidak ditemukan.');
    return rows[0];
  }
  async configure(userId: string, id: string, input: GrowthConfigurationDto) {
    const actor = await this.administrator(userId);
    const rows = await this.query<{ config: Prisma.JsonObject; version: number }>(Prisma.sql`
      UPDATE "TryOut" SET "growthConfig"=growth_config_update(${JSON.stringify(input.config)}::jsonb,"growthVersion",${input.version}::integer),
        "growthVersion"="growthVersion"+1,"growthUpdatedBy"=${actor.id} WHERE id=${id}
      RETURNING "growthConfig" AS config,"growthVersion" AS version`);
    if (!rows[0]) throw new NotFoundException('Tryout tidak ditemukan.');
    return rows[0];
  }
  async list(userId: string, id: string, input: GrowthQueueQuery) {
    await this.administrator(userId);
    const search = `%${input.q?.trim() ?? ''}%`;
    const from = input.from ?? null, to = input.to ?? null;
    const where = Prisma.sql`v."tryoutId"=${id}
      AND (u.name ILIKE ${search} OR u.email ILIKE ${search} OR v."instagramUsername" ILIKE ${search})
      AND (${from}::date IS NULL OR v."submittedAt">=(${from}::date::timestamp AT TIME ZONE 'Asia/Jakarta'))
      AND (${to}::date IS NULL OR v."submittedAt"<((${to}::date+1)::timestamp AT TIME ZONE 'Asia/Jakarta'))`;
    const counts = await this.query<{ total: number; pending: number; approved: number; rejected: number }>(Prisma.sql`
      SELECT count(*)::int AS total,count(*) FILTER(WHERE status='PENDING_VERIFICATION')::int AS pending,
        count(*) FILTER(WHERE status='APPROVED')::int AS approved,count(*) FILTER(WHERE status='REJECTED')::int AS rejected
      FROM "TryoutRegistrationVerification" v JOIN "user" u ON u.id=v."userId" WHERE ${where}`);
    const items = await this.query(Prisma.sql`
      SELECT v.id,v."userId",u.name,u.email,v."instagramUsername",v."submittedAt",v.status,v.version,v."approvalMethod",
        (v."configSnapshot"->'items'->'story'->>'enabled')::boolean AS "storyEnabled",
        COALESCE((v."adminChecklist"->>'story')::boolean,false) AS "storyChecked"
      FROM "TryoutRegistrationVerification" v JOIN "user" u ON u.id=v."userId" WHERE ${where}
        AND (${input.status ?? null}::text IS NULL OR v.status=${input.status ?? null})
      ORDER BY CASE WHEN ${input.storyPriority === 'true'} AND v.status='PENDING_VERIFICATION'
        AND (v."configSnapshot"->'items'->'story'->>'enabled')::boolean
        AND NOT COALESCE((v."adminChecklist"->>'story')::boolean,false) THEN 0 ELSE 1 END,
        v."submittedAt",v.id LIMIT ${input.limit ?? 50} OFFSET ${(input.page ?? 0) * (input.limit ?? 50)}`);
    return { items, summary: counts[0], page: input.page ?? 0, limit: input.limit ?? 50 };
  }
  async detail(userId: string, id: string, registrationId: string) {
    await this.administrator(userId);
    const rows = await this.query<{ registration: Prisma.JsonObject }>(Prisma.sql`
      SELECT to_jsonb(v)||jsonb_build_object('name',u.name,'email',u.email) AS registration
      FROM "TryoutRegistrationVerification" v JOIN "user" u ON u.id=v."userId" WHERE v.id=${registrationId} AND v."tryoutId"=${id}`);
    if (!rows[0]) throw new NotFoundException('Pengajuan tidak ditemukan.');
    const history = await this.query(Prisma.sql`SELECT id,action,"actorId",before,after,"createdAt"
      FROM "TryoutVerificationHistory" WHERE "verificationId"=${registrationId} AND "tryoutId"=${id} ORDER BY "createdAt",id`);
    return { registration: rows[0].registration, history };
  }
  async review(userId: string, id: string, registrationId: string, input: GrowthReviewDto) {
    const actor = await this.administrator(userId);
    const rows = await this.query<{ registration: Prisma.JsonObject }>(Prisma.sql`
      SELECT growth_review(${id},${registrationId},${actor.id},${JSON.stringify(input)}::jsonb) AS registration`);
    const next = input.next && input.action !== 'SAVE_PROGRESS' ? await this.query<{ id: string }>(Prisma.sql`
      SELECT id FROM "TryoutRegistrationVerification" WHERE "tryoutId"=${id} AND status='PENDING_VERIFICATION'
        ORDER BY "submittedAt",id LIMIT 1`) : [];
    return { registration: rows[0].registration, nextId: next[0]?.id ?? null };
  }
  async analytics(userId: string, id: string) {
    await this.administrator(userId);
    return (await this.query<{ metrics: Prisma.JsonObject }>(Prisma.sql`SELECT growth_analytics(${id}) AS metrics`))[0].metrics;
  }
}
