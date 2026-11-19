require('reflect-metadata');
const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { TryoutsController } = require('../dist/control-center/tryouts.controller');
const { ControlCenterService } = require('../dist/control-center/control-center.service');
const { SessionGuard } = require('../dist/auth/session.guard');
const { AUTH_PROVIDER } = require('../dist/auth/auth-provider');

let app;
let baseUrl;
const calls = [];

before(async () => {
  class TestModule {}
  Module({
    controllers: [TryoutsController],
    providers: [
      {
        provide: ControlCenterService,
        useValue: { deleteTryout: async (...args) => { calls.push(args); return { id: args[1] }; } },
      },
      SessionGuard,
      { provide: AUTH_PROVIDER, useValue: { getUser: async () => ({ id: 'admin' }) } },
    ],
  })(TestModule);
  app = await NestFactory.create(TestModule, { logger: false, abortOnError: false });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

after(async () => { await app?.close(); });

test('DELETE validates force as a boolean and keeps normal deletion the default', async () => {
  for (const [query, expected] of [['', false], ['?force=false', false], ['?force=true', true]]) {
    const response = await fetch(`${baseUrl}/team/control-center/tryouts/target${query}`, {
      method: 'DELETE', headers: { Authorization: 'Bearer test-session' },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(calls.at(-1), ['admin', 'target', expected]);
  }
  const count = calls.length;
  const invalid = await fetch(`${baseUrl}/team/control-center/tryouts/target?force=yes`, {
    method: 'DELETE', headers: { Authorization: 'Bearer test-session' },
  });
  assert.equal(invalid.status, 400);
  assert.equal(calls.length, count);
});

test('DELETE rejects requests without an authenticated session', async () => {
  const count = calls.length;
  const response = await fetch(`${baseUrl}/team/control-center/tryouts/target?force=true`, { method: 'DELETE' });
  assert.equal(response.status, 401);
  assert.equal(calls.length, count);
});
