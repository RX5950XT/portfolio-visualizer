import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.AUTH_SECRET = 'x'.repeat(32);
const { createAuthToken, verifyAuthToken } = await import('./auth-token.ts');

const GUEST_ID = '11111111-2222-3333-4444-555555555555';
const OTHER_ID = '66666666-7777-8888-9999-000000000000';

test('guest token 帶簽章的帳號 id', async () => {
  const token = await createAuthToken('guest', GUEST_ID);
  assert.deepEqual(await verifyAuthToken(token), { role: 'guest', demoSpace: null, guestId: GUEST_ID });
});

test('竄改 guest id 或把 guest 改成 demo 會失效', async () => {
  const token = await createAuthToken('guest', GUEST_ID);
  assert.equal(await verifyAuthToken(token.replace(GUEST_ID, OTHER_ID)), null);
  assert.equal(await verifyAuthToken(token.replace(/^guest/, 'demo')), null);
});

test('admin 與 demo 維持原行為', async () => {
  assert.deepEqual(await verifyAuthToken(await createAuthToken('admin')), { role: 'admin', demoSpace: null, guestId: null });
  assert.deepEqual(await verifyAuthToken(await createAuthToken('demo', OTHER_ID)), { role: 'demo', demoSpace: OTHER_ID, guestId: null });
});

test('舊版 3 段 guest token 不再接受', async () => {
  const admin = await createAuthToken('admin');
  assert.equal(await verifyAuthToken(admin.replace(/^admin/, 'guest')), null);
  await assert.rejects(createAuthToken('guest'));
});
