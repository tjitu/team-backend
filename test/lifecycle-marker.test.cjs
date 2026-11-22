const assert = require('node:assert/strict');
const test = require('node:test');
const { JituPostgresManagementDataSource } = require('../dist/control-center/jitu-management.data-source');

function setup(queryResults, failAt = -1) {
  const service = new JituPostgresManagementDataSource();
  let ddlCalls = 0;
  service.prisma = {
    $queryRaw: async () => [{ present: queryResults.shift() ?? false }],
    $executeRawUnsafe: async () => {
      ddlCalls++;
      if (ddlCalls === failAt) throw new Error('DDL failed');
      return 0;
    },
  };
  return { service, ddlCalls: () => ddlCalls };
}

test('completed schema skips all DDL for each new instance', async () => {
  const fixture = setup([true, true]);
  await fixture.service.ensureLifecycleSchema();
  await fixture.service.ensureLifecycleSchema();
  assert.equal(fixture.ddlCalls(), 0);
});

test('missing marker runs migration once and coalesces concurrent requests', async () => {
  const fixture = setup([false]);
  await Promise.all([fixture.service.ensureLifecycleSchema(), fixture.service.ensureLifecycleSchema()]);
  const count = fixture.ddlCalls();
  assert.ok(count > 2);
  await fixture.service.ensureLifecycleSchema();
  assert.equal(fixture.ddlCalls(), count);
});

test('a failure does not mark migration ready and permits a retry', async () => {
  const fixture = setup([false, false], 1);
  await assert.rejects(fixture.service.ensureLifecycleSchema());
  await fixture.service.ensureLifecycleSchema();
  assert.ok(fixture.ddlCalls() > 2);
});
