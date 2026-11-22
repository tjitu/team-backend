/** One-time online indexes for the shared Jitu database; run outside a transaction. */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const url = process.env.JITU_CONTROL_CENTER_DATABASE_URL || process.env.JITU_PURCHASES_DATABASE_URL;
if (!url) throw new Error('JITU_CONTROL_CENTER_DATABASE_URL is required');
const prisma = new PrismaClient({ datasources: { db: { url } } });
const indexes = [
  ['idx_question_created_at', 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_question_created_at ON public."Question" ("createdAt" DESC)'],
  ['idx_question_item_question_order', 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_question_item_question_order ON public."QuestionItem" (question_id, "order")'],
  ['idx_user_answer_question', 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_answer_question ON public."UserAnswer" (question_id)'],
  ['idx_daily_question_user', 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_question_user ON public."DailyQuestionLog" ("questionId", "userId")'],
  ['idx_practice_attempt_question_status', 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_practice_attempt_question_status ON public."PracticeAttempt" (question_id, status)'],
];
async function main() {
  for (const [name, sql] of indexes) {
    await prisma.$executeRawUnsafe(sql);
    const rows = await prisma.$queryRaw`SELECT i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = ${name}`;
    if (!rows[0]?.indisvalid) throw new Error(`Index ${name} is missing or invalid`);
    console.log(`${name}: valid`);
  }
}
main().catch((error) => {
  console.error('Index creation failed:', error.message);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
