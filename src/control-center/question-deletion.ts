import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export async function deleteUnusedQuestions(db: PrismaClient, questionIds: string[], tryoutId?: string) {
  const ids = [...new Set(questionIds)];
  if (!ids.length || ids.length > 1000 || ids.some(id => !id.trim())) {
    throw new BadRequestException('Pilih 1–1000 soal yang valid.');
  }
  const selected = Prisma.join(ids);
  const scope = tryoutId ? Prisma.sql`AND COALESCE(q."tryoutId", s.try_out_id) = ${tryoutId}
    AND (s.try_out_id IS NULL OR s.try_out_id = ${tryoutId})` : Prisma.empty;
  return db.$transaction(async tx => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT q.id FROM public."Question" q LEFT JOIN public."Subtest" s ON s.id = q.subtest_id
      WHERE q.id IN (${selected}) ${scope} ORDER BY q.id FOR UPDATE OF q
    `;
    if (locked.length !== ids.length) throw new NotFoundException('Sebagian soal sudah tidak tersedia. Muat ulang daftar.');
    if (tryoutId) {
      await tx.$executeRaw`
        DELETE FROM public."UserAnswer" a USING public."TryOutAttempt" t, public."user" u
        WHERE a.tryout_attempt_id = t.id AND t."userId" = u.id AND u."isSandbox" IS TRUE
          AND t.try_out_id = ${tryoutId} AND a.question_id IN (${selected})
      `;
    }
    const used = await tx.$queryRaw<{ id: string }[]>`
      SELECT question_id AS id FROM public."UserAnswer" WHERE question_id IN (${selected})
      UNION SELECT "questionId" FROM public."DailyQuestionLog" WHERE "questionId" IN (${selected})
      UNION SELECT question_id FROM public."PracticeAttempt" WHERE question_id IN (${selected})
    `;
    if (used.length) throw new BadRequestException(
      `${used.length} soal memiliki riwayat pengerjaan siswa. Batalkan pilihan soal tersebut. Tidak ada soal yang dihapus.`,
    );
    await tx.$executeRaw`
      WITH assignments AS (
        DELETE FROM public."PracticeAssignment" WHERE question_id IN (${selected})
      ), items AS (
        DELETE FROM public."QuestionItem" WHERE question_id IN (${selected})
      )
      DELETE FROM public."QuestionSolution" WHERE "questionId" IN (${selected})
    `;
    const deletedCount = await tx.$executeRaw`DELETE FROM public."Question" WHERE id IN (${selected})`;
    return { deletedCount };
  }, { timeout: 15000 });
}
