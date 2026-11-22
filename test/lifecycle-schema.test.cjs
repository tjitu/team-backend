const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

// These tests load the compiled output, like the other tests here: run `npm run build` first.
process.env.JITU_CONTROL_CENTER_DATABASE_URL = 'postgresql://user:password@127.0.0.1:1/unused';
const { JituPostgresManagementDataSource } = require('../dist/control-center/jitu-management.data-source');

function createDataSource() {
  const dataSource = new JituPostgresManagementDataSource();
  const calls = { ensure: 0, refresh: 0 };
  // Nothing here may touch a database: both background jobs are replaced with counters.
  dataSource.ensureLifecycleSchema = async () => { calls.ensure += 1; };
  dataSource.refreshOverview = async () => { calls.refresh += 1; };
  return { dataSource, calls };
}

describe('question lifecycle schema is never changed in the background', () => {
  test('starting the application does not run schema changes', async () => {
    const { dataSource, calls } = createDataSource();
    dataSource.onApplicationBootstrap();
    await new Promise((resolve) => setImmediate(resolve));
    // On Vercel the function is frozen as soon as the response is sent. A fire-and-forget
    // ALTER TABLE then leaves its transaction (and an ACCESS EXCLUSIVE lock) open for minutes.
    assert.equal(calls.ensure, 0, 'ensureLifecycleSchema must only run inside an awaited request');
    await dataSource.onModuleDestroy?.();
  });

  test('warming the overview cache at startup still happens', async () => {
    const { dataSource, calls } = createDataSource();
    dataSource.onApplicationBootstrap();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.refresh, 1);
    await dataSource.onModuleDestroy?.();
  });
});
