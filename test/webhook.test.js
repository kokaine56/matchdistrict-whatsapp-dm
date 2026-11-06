import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { app } from '../src/server.js';

process.env.WEBHOOK_VERIFY_TOKEN = 'test-verify-token';
process.env.META_APP_SECRET = 'test-meta-app-secret';

async function withServer(run) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
}

test('GET /webhook returns the challenge for a valid subscription verification', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=challenge-123`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/plain/);
    assert.equal(await response.text(), 'challenge-123');
  });
});

test('GET /webhook rejects an invalid verification token', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-123`);
    assert.equal(response.status, 403);
  });
});

test('POST /webhook accepts a signed status event and acknowledges it', async () => {
  await withServer(async base => {
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { statuses: [
        { id: 'wamid.test-status', status: 'delivered', timestamp: '12345', recipient_id: '15550000000' },
        { id: 'wamid.test-failed', status: 'failed', timestamp: '12346', errors: [{ code: 131000 }] }
      ] } }] }]
    });
    const signature = `sha256=${createHmac('sha256', process.env.META_APP_SECRET).update(body).digest('hex')}`;
    const response = await fetch(`${base}/webhook`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature }, body
    });
    assert.equal(response.status, 200);
  });
});

test('POST /login parses urlencoded form and authenticates admin session', async () => {
  await withServer(async base => {
    // 1. Unauthenticated request to / redirects to /login
    const unauthRes = await fetch(`${base}/`, { redirect: 'manual' });
    assert.equal(unauthRes.status, 302);
    assert.equal(unauthRes.headers.get('location'), '/login');

    // 2. Invalid password redirects back to /login?error=invalid
    const wrongLoginRes = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'password=wrong-password',
      redirect: 'manual'
    });
    assert.equal(wrongLoginRes.status, 302);
    assert.equal(wrongLoginRes.headers.get('location'), '/login?error=invalid');

    // 3. Valid password sets session cookie and redirects to /
    const loginRes = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'password=565454',
      redirect: 'manual'
    });
    assert.equal(loginRes.status, 302);
    assert.equal(loginRes.headers.get('location'), '/');
    const setCookie = loginRes.headers.get('set-cookie');
    assert.ok(setCookie && setCookie.includes('wa_admin_session='), 'Should receive session cookie');

    // 4. Authenticated request to / succeeds with 200
    const authRes = await fetch(`${base}/`, {
      headers: { Cookie: setCookie.split(';')[0] }
    });
    assert.equal(authRes.status, 200);
  });
});
