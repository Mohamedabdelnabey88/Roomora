import assert from 'node:assert/strict';
import test from 'node:test';
import { loginAgainstApi } from '../lib/login-api.ts';
import worker from '../cloudflare/src/index.ts';

const credentials = { username: 'example', password: 'example-password' };
const user = { id: 'user-1', name: 'Example', username: 'example', role: 'admin' };
const token = 'a'.repeat(43);
const reply = (body, status = 200) => async () => Response.json(body, { status });

test('successful authentication preserves user and token and sets a timeout', async () => {
  const result = await loginAgainstApi('https://example.test/', credentials, async (url, init) => {
    assert.equal(url, 'https://example.test/api/auth/login');
    assert.deepEqual(JSON.parse(init.body), credentials);
    assert.equal(init.cache, 'no-store');
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json({ token, user });
  });
  assert.deepEqual(result, { ok: true, token, user });
});

test('wrong credentials remain a 401', async () => {
  assert.deepEqual(await loginAgainstApi('https://example.test', credentials, reply({ error: 'invalid_credentials' }, 401)), { ok: false, status: 401, error: 'invalid_credentials' });
});

for (const [name, body, status] of [['empty error', '', 500], ['HTML error', '<html>error</html>', 502], ['empty success', '', 200], ['truncated JSON', '{"user":', 200]]) {
  test(`${name} returns a controlled failure`, async () => {
    assert.deepEqual(await loginAgainstApi('https://example.test', credentials, async () => new Response(body, { status })), { ok: false, status: 502, error: 'auth_service_invalid_response' });
  });
}
for (const payload of [null, {}, { user }, { token, user: null }, { token, user: { ...user, role: 'invalid' } }]) {
  test(`malformed success ${JSON.stringify(payload)} cannot create a session`, async () => {
    assert.equal((await loginAgainstApi('https://example.test', credentials, reply(payload))).ok, false);
  });
}
test('network and timeout failures become service errors', async () => {
  for (const [name, status] of [['TypeError', 503], ['TimeoutError', 504]]) {
    const result = await loginAgainstApi('https://example.test', credentials, async () => { throw new DOMException('failure', name); });
    assert.equal(result.status, status);
  }
});
test('rate limiting remains distinct from invalid credentials', async () => {
  assert.equal((await loginAgainstApi('https://example.test', credentials, reply({ error: 'limited' }, 429))).status, 429);
  assert.equal((await loginAgainstApi('https://example.test', credentials, reply({ error: 'database' }, 500))).status, 503);
});
test('Worker database failure returns JSON rather than an uncaught exception', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) }), { DB: { prepare() { throw new Error('database unavailable'); } } });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'auth_service_unavailable' });
});
test('Worker rejects malformed credential types without querying database', async () => {
  for (const body of ['{', JSON.stringify({ username: {}, password: 42 })]) {
    const response = await worker.fetch(new Request('https://example.test/api/auth/login', { method: 'POST', body }), {});
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'invalid_credentials' });
  }
});

test('daily database quotas are not misreported as a password problem', async () => {
  for (const error of ['d1_read_limit_exceeded','d1_write_limit_exceeded']) {
    assert.deepEqual(await loginAgainstApi('https://example.test',credentials,reply({error},503)),{ok:false,status:503,error});
  }
});

test('Worker login distinguishes the account daily row read limit', async () => {
  const response=await worker.fetch(new Request('https://example.test/api/auth/login',{method:'POST',body:JSON.stringify(credentials)}),{DB:{prepare(){throw new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit.");}}});
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'d1_read_limit_exceeded'});
});

test('protected endpoints return a quota error without bypassing authentication', async () => {
  const response=await worker.fetch(new Request('https://example.test/api/auth/me',{headers:{authorization:'Bearer fixture-token'}}),{DB:{prepare(){throw new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit.");}}});
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'d1_read_limit_exceeded'});
});
