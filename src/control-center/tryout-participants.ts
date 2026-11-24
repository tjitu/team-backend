import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export async function listTryoutParticipants(database: PrismaClient, tryoutId: string) {
  const existing = await database.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM public."TryOut" WHERE id = ${tryoutId}
  `);
  if (!existing.length) throw new NotFoundException('Tryout tidak ditemukan.');
  return database.$queryRaw(Prisma.sql`
    SELECT DISTINCT ON (a."userId") a.id, a."userId", u.name, u.email, a.status,
      a.started_at AT TIME ZONE 'UTC' AS "startedAt",
      a.finished_at AT TIME ZONE 'UTC' AS "finishedAt"
    FROM public."TryOutAttempt" a JOIN public."user" u ON u.id = a."userId"
    WHERE a.try_out_id = ${tryoutId} AND COALESCE(u."isSandbox", false) = false
    ORDER BY a."userId", a.started_at DESC, a.id DESC
  `);
}

export async function resetTryoutParticipant(database: PrismaClient, tryoutId: string, attemptId: string) {
  return database.$transaction(async (tx) => {
    const attempts = await tx.$queryRaw<Array<{ id: string; userId: string; status: string }>>(Prisma.sql`
      SELECT id, "userId", status FROM public."TryOutAttempt"
      WHERE id = ${attemptId} AND try_out_id = ${tryoutId} FOR UPDATE
    `);
    const attempt = attempts[0];
    if (!attempt) throw new NotFoundException('Pengerjaan tidak ditemukan.');
    if (!['FINISHED', 'IN_PROGRESS'].includes(attempt.status)) throw new BadRequestException('Hanya pengerjaan aktif atau selesai dapat direset.');
    const latest = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM public."TryOutAttempt" WHERE "userId" = ${attempt.userId} AND try_out_id = ${tryoutId}
      ORDER BY started_at DESC, id DESC LIMIT 1
    `);
    if (latest[0]?.id !== attemptId) throw new BadRequestException('Hanya pengerjaan terbaru yang dapat direset.');
    await tx.$executeRaw(Prisma.sql`DELETE FROM public."UserAnswer" WHERE tryout_attempt_id = ${attemptId}`);
    await tx.$executeRaw(Prisma.sql`DELETE FROM public."TryOutSubtestScore" WHERE tryout_attempt_id = ${attemptId}`);
    await tx.$executeRaw(Prisma.sql`
      UPDATE public."TryOutAttempt" SET status = 'NOT_STARTED', total_score = 0,
        current_subtest_order = 0, subtest_started_at = NULL, finished_at = NULL,
        started_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${attemptId} AND try_out_id = ${tryoutId}
    `);
    return { id: attemptId, status: 'NOT_STARTED' };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 15_000 });
}
