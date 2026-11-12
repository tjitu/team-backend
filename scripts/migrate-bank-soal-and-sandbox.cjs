require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const url = process.env.JITU_CONTROL_CENTER_DATABASE_URL || process.env.JITU_PURCHASES_DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  console.log('1. Altering public."Question" to ensure tryoutId column exists...');
  await prisma.$queryRawUnsafe(`
    ALTER TABLE public."Question" ADD COLUMN IF NOT EXISTS "tryoutId" TEXT;
  `);
  console.log('Added or verified tryoutId column on Question.');

  console.log('2. Ensuring sandbox tester user account exists in public."user"...');
  const existingUser = await prisma.$queryRawUnsafe(`
    SELECT id, email FROM public."user" WHERE email = 'sandbox@jitu.com';
  `);

  if (!existingUser || existingUser.length === 0) {
    await prisma.$queryRawUnsafe(`
      INSERT INTO public."user" (
        "id", "name", "email", "emailVerified", "target", "currentStreak", "tokenBalance", "role", "isBanned", "isPremium", "createdAt", "updatedAt"
      ) VALUES (
        'sandbox-tester-user-id', 'Jitu Sandbox Tester', 'sandbox@jitu.com', true, 'UTBK-SNBT 2026', 7, 9999, 'USER', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("id") DO NOTHING;
    `);
    console.log('Inserted sandbox tester user (sandbox@jitu.com).');
  } else {
    console.log('Sandbox tester user already exists:', existingUser);
  }

  console.log('3. Ensuring active tryouts exist in public."TryOut"...');
  const tryouts = await prisma.$queryRawUnsafe(`SELECT count(*) as count FROM public."TryOut"`);
  console.log('Current tryouts count:', tryouts[0].count);

  if (Number(tryouts[0].count) === 0) {
    await prisma.$queryRawUnsafe(`
      INSERT INTO public."TryOut" (
        "id", "code", "title", "description", "solutionPrice", "batch", "status", "isPublic", "scheduledStart", "scheduledEnd", "releaseDate", "createdAt"
      ) VALUES 
      (
        'to-snbt-2026-01', 101, 'Simulasi Akbar UTBK SNBT 2026 Gelombang 1', 
        'Tryout persiapan UTBK-SNBT 2026 nasional dengan penilaian IRT dan analisis subtes.', 
        0, CAST('SNBT' AS public."TryoutBatch"), CAST('IN_PROGRESS' AS public."TryoutStatus"), 
        true, '2026-04-01 00:00:00', '2026-04-30 23:59:59', '2026-04-01 00:00:00', CURRENT_TIMESTAMP
      ),
      (
        'to-snbt-2026-02', 102, 'Simulasi Intensif TPS & Literasi 2026', 
        'Paket latihan tryout intensif TPS dan Literasi Bahasa Indonesia & Inggris.', 
        0, CAST('SNBT' AS public."TryoutBatch"), CAST('NOT_STARTED' AS public."TryoutStatus"), 
        true, '2026-05-01 00:00:00', '2026-05-15 23:59:59', '2026-05-01 00:00:00', CURRENT_TIMESTAMP
      )
    `);
    console.log('Seeded 2 sample TryOuts.');
  }

  console.log('Migration and seeding completed successfully!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
