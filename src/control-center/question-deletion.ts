import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export async function deleteUnusedQuestions(db: PrismaClient, questionIds: string[]) {
  const ids = [...new Set(questionIds)];
  if (!ids.length || ids.length > 1000 || ids.some(id => !id.trim())) {
    throw new BadRequestException('Pilih 1–1000 soal yang valid.');
  }
  const selected = Prisma.join(ids);
  return db.$transaction(async tx => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM public."Question" WHERE id IN (${selected}) ORDER BY id FOR UPDATE
    `;
    if (locked.length !== ids.length) throw new NotFoundException('Sebagian soal sudah tidak tersedia. Muat ulang daftar.');
    const used = await tx.$queryRaw<{ id: string }[]>`
      SELECT question_id AS id FROM public."UserAnswer" WHERE question_id IN (${selected})
      UNION SELECT "questionId" FROM public."DailyQuestionLog" WHERE "questionId" IN (${selected})
      UNION SELECT question_id FROM public."PracticeAttempt" WHERE question_id IN (${selected})
    `;
    if (used.length) throw new BadRequestException(
      `${used.length} soal memiliki riwayat pengerjaan siswa. Batalkan pilihan soal tersebut. Tidak ada soal yang dihapus.`,
    );
    await tx.$executeRaw`DELETE FROM public."PracticeAssignment" WHERE question_id IN (${selected})`;
    await tx.$executeRaw`DELETE FROM public."QuestionItem" WHERE question_id IN (${selected})`;
    await tx.$executeRaw`DELETE FROM public."QuestionSolution" WHERE "questionId" IN (${selected})`;
    const deletedCount = await tx.$executeRaw`DELETE FROM public."Question" WHERE id IN (${selected})`;
    return { deletedCount };
  }, { timeout: 15000 });
}
