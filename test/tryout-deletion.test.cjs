const { after, before, describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { PrismaClient } = require('@prisma/client');
const { deleteTryoutRecords } = require('../dist/control-center/tryout-deletion');
const { ControlCenterService } = require('../dist/control-center/control-center.service');

const databaseUrl = process.env.TRYOUT_DELETION_TEST_DATABASE_URL;

describe('tryout deletion with PostgreSQL foreign keys', { skip: !databaseUrl }, () => {
  let database;
  const tables = [
    'PracticeAttempt', 'PracticeAssignment', 'QcSandboxPreviewSession', 'UnlockedSolution',
    'TryOutSubtestScore', 'UserAnswer', 'TryOutAttempt', 'QuestionItem', 'Question', 'Subtest', 'TryOut',
  ];
  let ownsTables = false;

  before(async () => {
    const url = new URL(databaseUrl);
    assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
    assert.equal(url.pathname, '/tryout_deletion_test', 'Use a dedicated local test database');
    database = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const fixture = await readFile(`${__dirname}/fixtures/tryout-deletion.sql`, 'utf8');
    await database.$transaction(async (tx) => {
      for (const statement of fixture.split(';').map((sql) => sql.trim()).filter(Boolean)) {
        await tx.$executeRawUnsafe(statement);
      }
    });
    ownsTables = true;
  });

  after(async () => {
    if (!database) return;
    if (ownsTables) {
      await database.$executeRawUnsafe(`DROP TABLE ${tables.map((name) => `public."${name}"`).join(', ')}`);
    }
    await database.$disconnect();
  });

  async function snapshot() {
    const result = {};
    for (const table of tables) {
      result[table] = await database.$queryRawUnsafe(`SELECT * FROM public."${table}" ORDER BY 1`);
    }
    return result;
  }

  test('default deletion rejects dependencies without changing records', async () => {
    const original = await snapshot();
    await assert.rejects(deleteTryoutRecords(database, 'target'), /Use force delete/);
    assert.deepEqual(await snapshot(), original);
  });

  test('missing tryout returns null in both modes', async () => {
    assert.equal(await deleteTryoutRecords(database, 'missing'), null);
    assert.equal(await deleteTryoutRecords(database, 'missing', true), null);
  });

  test('default guard detects history and questions independently', async () => {
    for (const dependency of ['attempt', 'unlock', 'question']) {
      await database.$executeRaw`INSERT INTO public."TryOut" VALUES (${dependency}, ${dependency})`;
    }
    await database.$executeRaw`INSERT INTO public."TryOutAttempt" VALUES ('isolated-attempt', 'attempt')`;
    await database.$executeRaw`INSERT INTO public."UnlockedSolution" VALUES ('isolated-unlock', 'unlock')`;
    await database.$executeRaw`
      INSERT INTO public."Question" ("id", "tryoutId", "status", "target")
      VALUES ('isolated-question', 'question', 'READY', 'FOR_TRYOUT')
    `;
    for (const dependency of ['attempt', 'unlock', 'question']) {
      await assert.rejects(deleteTryoutRecords(database, dependency), /Use force delete/);
      await deleteTryoutRecords(database, dependency, true);
    }
  });

  test('a late database error rolls back history removal and question detachment', async () => {
    const original = await snapshot();
    await database.$executeRawUnsafe(`
      CREATE FUNCTION public.reject_tryout_delete() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'injected delete failure'; END $$
    `);
    await database.$executeRawUnsafe(`
      CREATE TRIGGER reject_tryout_delete BEFORE DELETE ON public."TryOut"
      FOR EACH ROW EXECUTE FUNCTION public.reject_tryout_delete()
    `);
    try {
      await assert.rejects(deleteTryoutRecords(database, 'target', true), /injected delete failure/);
      assert.deepEqual(await snapshot(), original);
    } finally {
      await database.$executeRawUnsafe('DROP TRIGGER reject_tryout_delete ON public."TryOut"');
      await database.$executeRawUnsafe('DROP FUNCTION public.reject_tryout_delete()');
    }
  });

  test('force deletion removes only target history and returns reusable questions by QC status', async () => {
    const original = await snapshot();
    assert.deepEqual(await deleteTryoutRecords(database, 'target', true), { id: 'target', title: 'Delete me' });
    const actual = await snapshot();
    for (const table of ['UserAnswer', 'TryOutAttempt', 'TryOutSubtestScore', 'UnlockedSolution', 'Subtest']) {
      assert.deepEqual(actual[table], original[table].filter((row) => !row.id.startsWith('target')));
    }
    assert.deepEqual(actual.QcSandboxPreviewSession, [{ token_hash: 'other-session', tryout_id: 'other' }]);
    assert.deepEqual(actual.TryOut, original.TryOut.filter((row) => row.id !== 'target'));
    assert.equal(actual.Question.length, original.Question.length);
    for (const [id, target] of [['ready', 'BANK'], ['sandbox', 'SANDBOX'], ['draft', 'DRAFT']]) {
      const question = actual.Question.find((row) => row.id === id);
      assert.equal(question.tryoutId, null);
      assert.equal(question.subtest_id, null);
      assert.equal(question.target, target);
      assert.equal(question.status, original.Question.find((row) => row.id === id).status);
    }
    for (const id of ['other-question', 'practice']) {
      assert.deepEqual(actual.Question.find((row) => row.id === id), original.Question.find((row) => row.id === id));
    }
    for (const table of ['QuestionItem', 'PracticeAssignment', 'PracticeAttempt']) {
      assert.deepEqual(actual[table], original[table]);
    }
  });

  test('default deletion still removes an empty tryout', async () => {
    assert.deepEqual(await deleteTryoutRecords(database, 'empty'), { id: 'empty', title: 'Empty' });
  });
});

test('force deletion requires administrator access before reaching the database', async () => {
  let called = false;
  const service = new ControlCenterService(
    { getActiveMember: async () => ({ role: 'MEMBER' }) }, {},
    { deleteTryout: async () => { called = true; } }, {},
  );
  await assert.rejects(service.deleteTryout('member', 'target', true), /administrator access/);
  assert.equal(called, false);
});

test('administrators forward the explicit force flag and invalidate the overview', async () => {
  for (const role of ['SYSTEM_ADMIN', 'SYSTEM_OWNER']) {
    let invalidated = false;
    const service = new ControlCenterService(
      { getActiveMember: async () => ({ role }) }, {},
      {
        deleteTryout: async (id, force) => {
          assert.equal(id, 'target');
          assert.equal(force, true);
          return { id };
        },
        invalidateOverview: () => { invalidated = true; },
      }, {},
    );
    assert.deepEqual(await service.deleteTryout('admin', 'target', true), { id: 'target' });
    assert.equal(invalidated, true);
  }
});
