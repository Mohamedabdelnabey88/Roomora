import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../cloudflare/src/index.ts';

test('health reports a numeric room count', async () => {
  const response = await worker.fetch(new Request('https://example.test/health'), { DB: { prepare() { return { async first() { return { rooms: 49n }; } }; } } });
  assert.equal(response.status, 200);assert.equal((await response.json()).rooms, 49);
});

test('health database failures return controlled JSON without exposing the exception', async () => {
  const response = await worker.fetch(new Request('https://example.test/health'), { DB: { prepare() { throw new Error('D1_ERROR: private diagnostic detail'); } } });
  assert.equal(response.status, 503);const body=await response.json();assert.equal(body.reason,'database_query_failed');assert.equal(body.stage,'query');assert.ok(!JSON.stringify(body).includes('private diagnostic detail'));
});

test('setup status reports an existing account without exposing account data', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/setup/status'), { SETUP_KEY:'fixture-only', DB: { prepare() { return { async first() { return { users: 1 }; } }; } } });
  assert.deepEqual(await response.json(), { setupRequired: false, setupKeyConfigured: true });
});

test('setup status distinguishes missing schema from an empty database', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/setup/status'), { DB: { prepare() { throw new Error('no such table: users'); } } });
  assert.equal(response.status,503);const body=await response.json();assert.equal(body.reason,'database_schema_incomplete');assert.equal(body.setupRequired,undefined);
});
