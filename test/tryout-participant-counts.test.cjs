const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { listTryoutParticipants } = require('../dist/control-center/tryout-participants');

// Execute the real SQL against synthetic CTEs. No tables or student data are changed.
const fixture = `WITH
  "user"(id, name, email, "isSandbox") AS (VALUES
    ('student', 'Student', 'student@example.test', false),
    ('empty', 'Empty', 'empty@example.test', false),
    ('active', 'Active', 'active@example.test', false)),
  "TryOutAttempt"(id, "userId", try_out_id, status, total_score, started_at, finished_at) AS (VALUES
    ('done', 'student', 'tryout', 'FINISHED', 600, timestamp '2026-01-01', timestamp '2026-01-02'),
    ('blank', 'empty', 'tryout', 'FINISHED', 0, timestamp '2026-01-01', timestamp '2026-01-02'),
    ('progress', 'active', 'tryout', 'IN_PROGRESS', 0, timestamp '2026-01-01', NULL::timestamp)),
  "Subtest"(id, try_out_id) AS (VALUES ('subtest', 'tryout'), ('other', 'other-tryout')),
  "Question"(id, subtest_id, status) AS (VALUES
    ('q1', 'subtest', 'READY'), ('q2', 'subtest', 'READY'),
    ('q3', 'subtest', 'READY'), ('q4', 'subtest', 'READY'),
    ('draft', 'subtest', 'DRAFT'), ('unrelated', 'other', 'READY')),
  "UserAnswer"(id, question_id, tryout_attempt_id, "isCorrect") AS (VALUES
    ('a1', 'q1', 'done', true), ('a2', 'q2', 'done', false),
    ('a3', 'draft', 'done', false), ('a4', 'unrelated', 'done', true)),
`;

test('counts correct, wrong and empty READY questions; hides unfinished results', {
  skip: !process.env.TRYOUT_RESULTS_TEST_DATABASE_URL,
}, async () => {
  const database = new PrismaClient({ datasources: { db: { url: process.env.TRYOUT_RESULTS_TEST_DATABASE_URL } } });
  try {
    const rows = await database.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const adapter = { $queryRaw: async (query) => {
        if (query.sql.includes('FROM public."TryOut"')) return [{ id: 'tryout' }];
        const sql = query.text.replace(/public\./g, '').replace('WITH latest', `${fixture} latest`);
        return tx.$queryRawUnsafe(sql, ...query.values);
      } };
      return listTryoutParticipants(adapter, 'tryout');
    });
    const counts = (id) => {
      const row = rows.find((entry) => entry.id === id);
      return [row.correctCount, row.wrongCount, row.emptyCount];
    };
    assert.deepEqual(counts('done'), [1, 1, 2]);
    assert.deepEqual(counts('blank'), [0, 0, 4]);
    assert.deepEqual(counts('progress'), [null, null, null]);
    assert.equal(rows.find((row) => row.id === 'done').rank, 1);
  } finally {
    await database.$disconnect();
  }
});
