import { BadRequestException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export interface DeletedTryout {
  id: string;
  title: string;
}

interface TryoutDependencies {
  hasAttempts: boolean;
  hasUnlockedSolutions: boolean;
  hasAssignedQuestions: boolean;
}

export async function deleteTryoutRecords(
  database: PrismaClient,
  id: string,
  force = false,
): Promise<DeletedTryout | null> {
  return database.$transaction(async (tx) => {
    const existing = await tx.$queryRaw<DeletedTryout[]>(Prisma.sql`
      SELECT "id", "title" FROM public."TryOut" WHERE "id" = ${id} FOR UPDATE
    `);
    if (!existing[0]) return null;

    // Block new child records while checking dependencies and removing history.
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM public."Subtest" WHERE "try_out_id" = ${id} FOR UPDATE
    `);
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM public."TryOutAttempt" WHERE "try_out_id" = ${id} FOR UPDATE
    `);

    if (!force) {
      const [dependencies] = await tx.$queryRaw<TryoutDependencies[]>(Prisma.sql`
        SELECT
          EXISTS (SELECT 1 FROM public."TryOutAttempt" WHERE "try_out_id" = ${id}) AS "hasAttempts",
          EXISTS (SELECT 1 FROM public."UnlockedSolution" WHERE "tryOutId" = ${id}) AS "hasUnlockedSolutions",
          EXISTS (
            SELECT 1 FROM public."Question" q
            LEFT JOIN public."Subtest" sub ON sub."id" = q."subtest_id"
            WHERE q."tryoutId" = ${id} OR sub."try_out_id" = ${id}
          ) AS "hasAssignedQuestions"
      `);
      if (dependencies.hasAttempts || dependencies.hasUnlockedSolutions || dependencies.hasAssignedQuestions) {
        throw new BadRequestException(
          'This tryout has assigned questions or student history. Use force delete to remove its history and return its questions to Bank Soal, or set it to private.',
        );
      }
    }

    if (force) {
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM public."UserAnswer"
        WHERE "tryout_attempt_id" IN (SELECT "id" FROM public."TryOutAttempt" WHERE "try_out_id" = ${id})
      `);
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM public."TryOutSubtestScore"
        WHERE "tryout_attempt_id" IN (SELECT "id" FROM public."TryOutAttempt" WHERE "try_out_id" = ${id})
          OR "subtest_id" IN (SELECT "id" FROM public."Subtest" WHERE "try_out_id" = ${id})
      `);
      await tx.$executeRaw(Prisma.sql`DELETE FROM public."TryOutAttempt" WHERE "try_out_id" = ${id}`);
      await tx.$executeRaw(Prisma.sql`DELETE FROM public."UnlockedSolution" WHERE "tryOutId" = ${id}`);
      await tx.$executeRaw(Prisma.sql`
        UPDATE public."Question" SET
          "tryoutId" = NULL,
          "subtest_id" = NULL,
          "target" = CASE
            WHEN COALESCE("status", 'DRAFT') = 'READY' THEN 'BANK'
            WHEN COALESCE("status", 'DRAFT') = 'QC_SANDBOX' THEN 'SANDBOX'
            ELSE 'DRAFT'
          END,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "tryoutId" = ${id}
          OR "subtest_id" IN (SELECT "id" FROM public."Subtest" WHERE "try_out_id" = ${id})
      `);
    }

    await tx.$executeRaw(Prisma.sql`DELETE FROM public."QcSandboxPreviewSession" WHERE "tryout_id" = ${id}`);
    await tx.$executeRaw(Prisma.sql`DELETE FROM public."Subtest" WHERE "try_out_id" = ${id}`);
    await tx.$executeRaw(Prisma.sql`DELETE FROM public."TryOut" WHERE "id" = ${id}`);
    return existing[0];
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 15_000 });
}
