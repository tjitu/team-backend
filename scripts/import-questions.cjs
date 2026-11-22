/**
 * Import soal dari file JSON ke Bank Soal (public."Question" di Main DB).
 * Logikanya meniru JituManagementDataSource.createQuestion (control-center).
 *
 * Pakai:
 *   node scripts/import-questions.cjs --file "C:/path/soal.json" --batch "nama-batch" --dry-run
 *   node scripts/import-questions.cjs --file "C:/path/soal.json" --batch "nama-batch"
 *
 * Opsi:
 *   --file     (wajib) path file JSON: array soal, atau { questions: [...] }
 *   --batch    (wajib) nama batch; satu batch hanya boleh 1 jenis soal
 *   --target   DRAFT (default) | FOR_PRACTICE   -> DRAFT = tampil di Bank Soal
 *   --status   DRAFT (default) | QC_SANDBOX | READY | NEEDS_REVISION
 *   --dry-run  hanya validasi & tampilkan ringkasan, tidak menulis ke DB
 *   --allow-duplicates  jangan skip soal yang content-nya sudah ada di batch yang sama
 */
require('dotenv').config();
const fs = require('fs');
const { randomUUID } = require('crypto');
const { PrismaClient } = require('@prisma/client');

function parseArgs(argv) {
  const out = { flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out.flags.add(key);
    else { out[key] = next; i++; }
  }
  return out;
}

const SUBTESTS = new Set([
  'PENALARAN_UMUM', 'PENGETAHUAN_PEMAHAMAN_UMUM', 'PEMAHAMAN_BACAAN_MENULIS',
  'PENGETAHUAN_KUANTITATIF', 'LITERASI_INDONESIA', 'LITERASI_INGGRIS', 'PENALARAN_MATEMATIKA',
]);
const DIFFICULTIES = new Set(['EASY', 'MEDIUM', 'HARD']);
const TARGETS = new Set(['DRAFT', 'FOR_PRACTICE']);
const STATUSES = new Set(['DRAFT', 'QC_SANDBOX', 'NEEDS_REVISION', 'READY']);
const LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

function normalizeOptions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((o, i) => ({
    content: String(o.content ?? o.text ?? '').trim(),
    isCorrect: Boolean(o.isCorrect),
    order: Number(o.order) || (o.label ? LABELS.indexOf(String(o.label).toUpperCase()) + 1 : 0) || i + 1,
  }));
}

function normalizeSteps(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.map((s, i) => ({
    stepNumber: Number(s.stepNumber ?? s.order) || i + 1,
    category: s.category ?? undefined,
    title: String(s.title ?? ''),
    content: String(s.content ?? ''),
  }));
}

function validate(q, idx, topicIds, subtopicIds) {
  const errs = [];
  const type = q.type === 'SHORT_ANSWER' ? 'ISIAN_SINGKAT' : q.type === 'MULTIPLE_CHOICE' ? 'PILIHAN_GANDA' : q.type || 'PILIHAN_GANDA';
  if (!SUBTESTS.has(q.subtest)) errs.push(`subtest tidak dikenal: ${q.subtest}`);
  if (!q.content || !String(q.content).trim()) errs.push('content kosong');
  if (q.difficulty && !DIFFICULTIES.has(q.difficulty)) errs.push(`difficulty tidak valid: ${q.difficulty}`);
  if (!['PILIHAN_GANDA', 'ISIAN_SINGKAT'].includes(type)) errs.push(`type tidak didukung: ${q.type}`);
  if (q.topicId && !topicIds.has(q.topicId)) errs.push(`topicId tidak ada di DB: ${q.topicId}`);
  if (q.subtopicId && !subtopicIds.has(q.subtopicId)) errs.push(`subtopicId tidak ada di DB: ${q.subtopicId}`);
  if (type === 'ISIAN_SINGKAT') {
    if (q.correctAnswer == null || String(q.correctAnswer).trim() === '') errs.push('ISIAN_SINGKAT butuh correctAnswer');
  } else {
    const opts = normalizeOptions(q.options);
    if (opts.length < 2) errs.push('PILIHAN_GANDA butuh minimal 2 opsi');
    const correct = opts.filter((o) => o.isCorrect).length;
    if (correct !== 1) errs.push(`PILIHAN_GANDA harus punya tepat 1 opsi benar (ada ${correct})`);
    if (opts.some((o) => !o.content)) errs.push('ada opsi dengan teks kosong');
  }
  return errs.map((e) => `#${idx + 1}: ${e}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args.flags.has('dry-run');
  const allowDup = args.flags.has('allow-duplicates');
  const file = args.file;
  const batch = args.batch ? String(args.batch).trim() : '';
  const target = (args.target || 'DRAFT').toUpperCase();
  const status = (args.status || 'DRAFT').toUpperCase();

  if (!file || !batch) throw new Error('Wajib isi --file dan --batch. Lihat komentar di atas file ini.');
  if (!TARGETS.has(target)) throw new Error(`--target harus salah satu: ${[...TARGETS].join(', ')}`);
  if (!STATUSES.has(status)) throw new Error(`--status harus salah satu: ${[...STATUSES].join(', ')}`);

  const parsed = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const questions = Array.isArray(parsed) ? parsed : parsed.questions;
  if (!Array.isArray(questions) || questions.length === 0) throw new Error('JSON harus array soal (atau { "questions": [...] }) dan tidak kosong.');

  const url = process.env.JITU_CONTROL_CENTER_DATABASE_URL || process.env.JITU_PURCHASES_DATABASE_URL;
  if (!url) throw new Error('JITU_CONTROL_CENTER_DATABASE_URL / JITU_PURCHASES_DATABASE_URL belum di-set di .env');
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const topicIds = new Set((await prisma.$queryRawUnsafe('SELECT id FROM public."Topic"')).map((r) => r.id));
    const subtopicIds = new Set((await prisma.$queryRawUnsafe('SELECT id FROM public."Subtopic"')).map((r) => r.id));

    const errors = questions.flatMap((q, i) => validate(q, i, topicIds, subtopicIds));
    const bySubtest = {};
    for (const q of questions) bySubtest[q.subtest] = (bySubtest[q.subtest] || 0) + 1;
    console.log(`File     : ${file}`);
    console.log(`Total    : ${questions.length} soal`);
    console.log(`Per subtest:`, bySubtest);
    console.log(`Tujuan   : batch="${batch}" target=${target} status=${status}${dryRun ? '  [DRY RUN]' : ''}`);

    if (errors.length) {
      console.error(`\nDitemukan ${errors.length} masalah, tidak ada yang diimpor:`);
      errors.slice(0, 50).forEach((e) => console.error(' - ' + e));
      if (errors.length > 50) console.error(` ... dan ${errors.length - 50} lainnya`);
      process.exitCode = 1;
      return;
    }

    // Proteksi batch: satu batch = satu jenis soal (meniru assertBatchTargetCompatibility)
    const existing = await prisma.$queryRawUnsafe(
      `SELECT COALESCE("target",'DRAFT') AS target, count(*)::int AS n
       FROM public."Question"
       WHERE "batch" IS NOT NULL AND LOWER(TRIM("batch")) = LOWER($1)
         AND COALESCE("target",'DRAFT') <> 'SOAL_ASLI' AND COALESCE("status",'DRAFT') <> 'RETIRED'
       GROUP BY 1`,
      batch,
    );
    const kind = (t) => (t === 'FOR_TRYOUT' ? 'FOR_TRYOUT' : t === 'FOR_PRACTICE' ? 'FOR_PRACTICE' : 'DRAFT');
    const conflict = existing.find((r) => kind(r.target) !== kind(target));
    if (conflict) {
      throw new Error(`Batch "${batch}" sudah berisi soal bertipe ${kind(conflict.target)}; tidak boleh dicampur dengan ${kind(target)}. Pakai nama batch lain.`);
    }

    const existingContent = new Set(
      (await prisma.$queryRawUnsafe(
        `SELECT "content" FROM public."Question" WHERE "batch" IS NOT NULL AND LOWER(TRIM("batch")) = LOWER($1)`,
        batch,
      )).map((r) => r.content),
    );

    if (dryRun) {
      const dup = allowDup ? 0 : questions.filter((q) => existingContent.has(q.content)).length;
      console.log(`\nDry run OK. Akan diimpor: ${questions.length - dup}, dilewati karena duplikat: ${dup}.`);
      return;
    }

    let inserted = 0, skipped = 0;
    const failed = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!allowDup && existingContent.has(q.content)) { skipped++; continue; }
      const type = q.type === 'SHORT_ANSWER' ? 'ISIAN_SINGKAT' : q.type === 'MULTIPLE_CHOICE' ? 'PILIHAN_GANDA' : q.type || 'PILIHAN_GANDA';
      const id = randomUUID();
      const options = type === 'PILIHAN_GANDA' ? normalizeOptions(q.options) : [];
      const steps = normalizeSteps(q.solutionSteps);
      const correctAnswer = type === 'ISIAN_SINGKAT' ? String(q.correctAnswer).trim() : null;
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `INSERT INTO public."Question" (
               "id","subtest","topic_id","subtopic_id","pattern","batch","difficulty","type","target","status",
               "narration","content","imageUrl","points","correct_answer_short_answer","createdAt","updatedAt"
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,CAST($8 AS public."QuestionType"),$9,$10,$11,$12,$13,$14,$15,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
            id, q.subtest, q.topicId || null, q.subtopicId || null, q.pattern || null, batch,
            q.difficulty || 'MEDIUM', type, target, status,
            q.narration || null, q.content, q.imageUrl || null, Number(q.points) || 1, correctAnswer,
          );
          for (const o of options) {
            await tx.$executeRawUnsafe(
              `INSERT INTO public."QuestionItem" ("id","question_id","content","is_correct","order") VALUES ($1,$2,$3,$4,$5)`,
              randomUUID(), id, o.content, o.isCorrect, o.order,
            );
          }
          if (steps || q.quickTrick || q.staticExplanation || q.keyFormula) {
            await tx.$executeRawUnsafe(
              `INSERT INTO public."QuestionSolution" ("id","questionId","steps","staticContent","quickTrick","keyFormula","createdAt","updatedAt")
               VALUES ($1,$2,CAST($3 AS jsonb),$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
              randomUUID(), id, steps ? JSON.stringify(steps) : null,
              q.staticExplanation || null, q.quickTrick || null, q.keyFormula || null,
            );
          }
          if (status === 'READY' && target === 'FOR_PRACTICE') {
            await tx.$executeRawUnsafe(
              `INSERT INTO public."PracticeAssignment" ("id","question_id","assigned_by","assigned_at")
               VALUES ($1,$2,'import_script',CURRENT_TIMESTAMP) ON CONFLICT ("question_id") DO NOTHING`,
              randomUUID(), id,
            );
          }
        });
        existingContent.add(q.content);
        inserted++;
        if (inserted % 25 === 0) console.log(`  ... ${inserted} soal masuk`);
      } catch (err) {
        failed.push(`#${i + 1}: ${err.message.split('\n').slice(-1)[0]}`);
      }
    }

    console.log(`\nSelesai. Masuk: ${inserted} | Dilewati (duplikat): ${skipped} | Gagal: ${failed.length}`);
    failed.forEach((f) => console.error(' - ' + f));
    if (failed.length) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
