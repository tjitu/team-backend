const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resetTryoutParticipant } = require('../dist/control-center/tryout-participants');
const { ControlCenterService } = require('../dist/control-center/control-center.service');

function database(status = 'FINISHED', latestId = 'attempt') {
  const writes = [];
  const tx = { $queryRaw: async (query) => query.sql.includes('FOR UPDATE') ? [{ id: 'attempt', userId: 'user', status }] : [{ id: latestId }],
    $executeRaw: async (query) => { writes.push(query); return 1; } };
  return { writes, $transaction: async (run) => run(tx) };
}
test('reset clears answers and scores while retaining registration and purchases', async () => {
  const db = database();
  assert.deepEqual(await resetTryoutParticipant(db, 'tryout', 'attempt'), { id: 'attempt', status: 'NOT_STARTED' });
  assert.equal(db.writes.length, 3);
  assert.match(db.writes[0].sql, /DELETE FROM public\."UserAnswer"/);
  assert.match(db.writes[1].sql, /DELETE FROM public\."TryOutSubtestScore"/);
  assert.match(db.writes[2].sql, /UPDATE public\."TryOutAttempt"/);
  assert.ok(db.writes.every((q) => !q.sql.includes('UnlockedSolution')));
});
test('refuses in-progress and outdated attempts without modifying data', async () => {
  for (const db of [database('IN_PROGRESS'), database('FINISHED', 'other')]) {
    await assert.rejects(resetTryoutParticipant(db, 'tryout', 'attempt'));
    assert.equal(db.writes.length, 0);
  }
});
test('participant operations require an administrator', async () => {
  const service = new ControlCenterService({ getActiveMember: async () => ({ role: 'MEMBER' }) }, {}, { resetTryoutParticipant: async () => { throw Error('unexpected'); } }, {});
  await assert.rejects(service.resetTryoutParticipant('member', 'tryout', 'attempt'), /administrator/i);
});
