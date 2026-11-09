const fs = require('fs');
const path = require('path');

process.loadEnvFile('C:/JITU-ECOSYSTEM/team-backend/.env');
const { PrismaClient } = require('C:/JITU-ECOSYSTEM/team-backend/node_modules/@prisma/client');

const rawDataPath = 'C:/Users/hamiz/.gemini/antigravity/brain/369551cc-d94c-46a1-b18e-b3020f6c1715/.user_uploaded/media_1794170406002_84d96670.json';
const repoJsonPath = path.resolve('C:/JITU-ECOSYSTEM/team-backend/scripts/taksonomi-utbk-snbt.json');

fs.mkdirSync(path.dirname(repoJsonPath), { recursive: true });
fs.copyFileSync(rawDataPath, repoJsonPath);

const taxonomy = JSON.parse(fs.readFileSync(repoJsonPath, 'utf8'));

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.JITU_CONTROL_CENTER_DATABASE_URL || process.env.JITU_PURCHASES_DATABASE_URL },
  },
});

(async () => {
  console.log(`Loaded ${taxonomy.length} topics from taksonomi-utbk-snbt.json`);

  // 1. Ensure patterns JSONB column exists on public."Subtopic"
  await prisma.$executeRawUnsafe(`
    ALTER TABLE public."Subtopic"
    ADD COLUMN IF NOT EXISTS "patterns" JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
  console.log('Ensured "patterns" JSONB column on public."Subtopic"');

  // 2. Find any questions currently linked to old placeholder subtopics
  const oldLinked = await prisma.$queryRawUnsafe(`
    SELECT q.id, q."subtopic_id", s.slug AS "oldSlug", s.title AS "oldTitle"
    FROM public."Question" q
    LEFT JOIN public."Subtopic" s ON s.id = q."subtopic_id"
    WHERE q."subtopic_id" IS NOT NULL
  `);
  console.log(`Found ${oldLinked.length} question(s) linked to existing subtopics`);

  // Temporarily detach FK references so we can cleanly replace old placeholder taxonomy
  await prisma.$executeRawUnsafe(`
    UPDATE public."Question" SET "subtopic_id" = NULL WHERE "subtopic_id" IS NOT NULL
  `);

  await prisma.$executeRawUnsafe(`DELETE FROM public."Subtopic"`);
  await prisma.$executeRawUnsafe(`DELETE FROM public."Topic"`);

  // 3. Seed all 38 Topics and their Subtopics + patterns
  let totalTopics = 0;
  let totalSubtopics = 0;
  let totalPatterns = 0;

  for (const topic of taxonomy) {
    const topicId = `top-${topic.slug}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO public."Topic" ("id", "subtest", "title", "slug", "order", "createdAt")
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO UPDATE SET
         "subtest" = EXCLUDED."subtest",
         "title" = EXCLUDED."title",
         "slug" = EXCLUDED."slug",
         "order" = EXCLUDED."order"`,
      topicId,
      topic.subtest,
      topic.title,
      topic.slug,
      Number(topic.order) || 1
    );
    totalTopics++;

    const subtopics = Array.isArray(topic.subtopics) ? topic.subtopics : [];
    for (const sub of subtopics) {
      const subId = `sub-${sub.slug}`;
      const patternsJson = JSON.stringify(Array.isArray(sub.patterns) ? sub.patterns : []);
      await prisma.$executeRawUnsafe(
        `INSERT INTO public."Subtopic" ("id", "topicId", "title", "slug", "order", "patterns", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT ("id") DO UPDATE SET
           "topicId" = EXCLUDED."topicId",
           "title" = EXCLUDED."title",
           "slug" = EXCLUDED."slug",
           "order" = EXCLUDED."order",
           "patterns" = EXCLUDED."patterns"`,
        subId,
        topicId,
        sub.title,
        sub.slug,
        Number(sub.order) || 1,
        patternsJson
      );
      totalSubtopics++;
      totalPatterns += Array.isArray(sub.patterns) ? sub.patterns.length : 0;
    }
  }

  // 4. Re-link any previously linked questions to their matching new subtopic
  const legacySubtopicMap = {
    'sub-pm-peluruhan': 'sub-fungsi-eksponensial-dan-logaritma-kontekstual',
    'sub-pk-persamaan-kuadrat': 'sub-persamaan-dan-pertidaksamaan-kuadrat',
    'sub-pk-fungsi-komposisi': 'sub-fungsi-komposisi-dan-invers-dasar',
    'sub-pk-barisan-deret': 'sub-barisan-dan-deret-dasar',
    'sub-pu-silogisme': 'sub-silogisme',
  };

  for (const row of oldLinked) {
    const newSubId = legacySubtopicMap[row.subtopic_id] || `sub-${row.oldSlug}`;
    const exists = await prisma.$queryRawUnsafe(
      `SELECT id FROM public."Subtopic" WHERE id = $1`,
      newSubId
    );
    if (exists.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE public."Question" SET "subtopic_id" = $1 WHERE id = $2`,
        newSubId,
        row.id
      );
      console.log(`Re-linked question ${row.id} -> ${newSubId}`);
    }
  }

  console.log(`Done! Seeded ${totalTopics} Topics, ${totalSubtopics} Subtopics, and ${totalPatterns} Patterns.`);
  await prisma.$disconnect();
})();
