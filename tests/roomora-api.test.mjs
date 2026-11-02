import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchRoomoraApi, ROOMORA_USER_AGENT } from '../lib/roomora-api.ts';

test('Worker requests identify Roomora and preserve authorization and payload', async () => {
  const body = JSON.stringify({ example: true });
  const response = await fetchRoomoraApi('https://example.test/api/auth/login', {
    method: 'POST', body, cache: 'no-store', signal: AbortSignal.timeout(1000),
    headers: { authorization: 'Bearer fixture-token', 'content-type': 'application/json' }
  }, async (input, init) => {
    assert.equal(init.headers.get('user-agent'), ROOMORA_USER_AGENT);
    assert.equal(init.headers.get('accept'), 'application/json');
    assert.equal(init.headers.get('authorization'), 'Bearer fixture-token');
    assert.equal(init.headers.get('content-type'), 'application/json');
    assert.equal(init.body, body);assert.equal(init.method, 'POST');assert.equal(init.cache, 'no-store');
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json({ ok: true });
  });
  assert.deepEqual(await response.json(), { ok: true });
});

test('Request headers survive when init adds another header', async () => {
  await fetchRoomoraApi(new Request('https://example.test/api/auth/me', { headers: { authorization: 'Bearer fixture-token' } }), {
    headers: new Headers({ 'x-request-id': 'fixture-request' })
  }, async (input, init) => {
    assert.equal(init.headers.get('authorization'), 'Bearer fixture-token');
    assert.equal(init.headers.get('x-request-id'), 'fixture-request');
    assert.equal(init.headers.get('user-agent'), ROOMORA_USER_AGENT);
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  });
});

test('backend failures preserve their status and are never retried', async () => {
  let calls = 0;
  const response = await fetchRoomoraApi('https://example.test/api/stays', { method: 'POST' }, async () => {
    calls++;return Response.json({ error: 'unavailable' }, { status: 503 });
  });
  assert.equal(response.status, 503);assert.equal(calls, 1);
});
