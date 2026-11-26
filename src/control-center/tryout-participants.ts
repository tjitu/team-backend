import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export async function listTryoutParticipants(database: PrismaClient, tryoutId: string) {
  const existing = await database.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM public."TryOut" WHERE id = ${tryoutId}
  `);
  if (!existing.length) throw new NotFoundException('Tryout tidak ditemukan.');
  return database.$queryRaw(Prisma.sql`
    WITH latest AS (
      SELECT DISTINCT ON (a."userId") a.*
      FROM public."TryOutAttempt" a JOIN public."user" u ON u.id = a."userId"
      WHERE a.try_out_id = ${tryoutId} AND COALESCE(u."isSandbox", false) = false
      ORDER BY a."userId", a.started_at DESC, a.id DESC
    ), ranked AS (
      SELECT id, row_number() OVER (ORDER BY total_score DESC, finished_at ASC, id ASC)::int AS rank
      FROM latest WHERE status = 'FINISHED'
    )
    SELECT a.id, a."userId", u.name, u.email, a.status,
      a.started_at AT TIME ZONE 'UTC' AS "startedAt",
      a.finished_at AT TIME ZONE 'UTC' AS "finishedAt",
      CASE WHEN a.status = 'FINISHED' THEN a.total_score ELSE NULL END AS score,
      r.rank,
      CASE WHEN a.status = 'FINISHED' THEN COALESCE(answers.correct, 0) ELSE NULL END AS "correctCount",
      CASE WHEN a.status = 'FINISHED' THEN COALESCE(answers.wrong, 0) ELSE NULL END AS "wrongCount",
      CASE WHEN a.status = 'FINISHED' THEN COALESCE(answers.empty, 0) ELSE NULL END AS "emptyCount"
    FROM latest a JOIN public."user" u ON u.id = a."userId"
    LEFT JOIN ranked r ON r.id = a.id
    LEFT JOIN LATERAL (
      SELECT count(ua.id) FILTER (WHERE ua."isCorrect")::int AS correct,
             count(ua.id) FILTER (WHERE NOT ua."isCorrect")::int AS wrong,
             count(q.id) FILTER (WHERE ua.id IS NULL)::int AS empty
      FROM public."Subtest" s
      JOIN public."Question" q ON q.subtest_id = s.id AND COALESCE(q.status, 'DRAFT') = 'READY'
      LEFT JOIN public."UserAnswer" ua ON ua.question_id = q.id AND ua.tryout_attempt_id = a.id
      WHERE s.try_out_id = a.try_out_id
    ) answers ON a.status = 'FINISHED'
    ORDER BY r.rank NULLS LAST, u.name, a.id
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
    await tx.$queryRaw(Prisma.sql`SELECT id FROM public."TryOutAttempt" WHERE "userId" = ${attempt.userId} AND try_out_id = ${tryoutId} FOR UPDATE`);
    await tx.$executeRaw(Prisma.sql`DELETE FROM public."UserAnswer" WHERE tryout_attempt_id IN (SELECT id FROM public."TryOutAttempt" WHERE "userId" = ${attempt.userId} AND try_out_id = ${tryoutId})`);
    await tx.$executeRaw(Prisma.sql`DELETE FROM public."TryOutSubtestScore" WHERE tryout_attempt_id IN (SELECT id FROM public."TryOutAttempt" WHERE "userId" = ${attempt.userId} AND try_out_id = ${tryoutId})`);
    await tx.$executeRaw(Prisma.sql`DELETE FROM public."TryOutAttempt" WHERE "userId" = ${attempt.userId} AND try_out_id = ${tryoutId}`);
    const newAttemptId = randomUUID();
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO public."TryOutAttempt" (id, "userId", try_out_id, status, total_score, current_subtest_order, started_at)
      VALUES (${newAttemptId}, ${attempt.userId}, ${tryoutId}, 'NOT_STARTED', 0, 0, CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    `);
    return { id: newAttemptId, status: 'NOT_STARTED' };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 15_000 });
}
