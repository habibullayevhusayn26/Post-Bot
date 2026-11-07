const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { verifyTelegramInitData } = require('./mini-app-auth');

const botToken = 'test-token';
const now = 1700000000000;

function signedInitData(overrides = {}) {
  const values = new URLSearchParams({
    auth_date: String(Math.floor(now / 1000)),
    query_id: 'test-query',
    user: JSON.stringify({ id: 12345, first_name: 'Test' }),
    ...overrides
  });
  const checkString = [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  values.set('hash', hash);
  return values.toString();
}

test('accepts a valid Telegram Mini App signature', () => {
  assert.deepEqual(verifyTelegramInitData(signedInitData(), botToken, 86400, now), {
    id: 12345,
    first_name: 'Test'
  });
});

test('rejects altered authentication data', () => {
  const initData = signedInitData().replace('test-query', 'altered-query');
  assert.throws(() => verifyTelegramInitData(initData, botToken, 86400, now), /signature is invalid/);
});

test('rejects expired authentication data', () => {
  assert.throws(() => verifyTelegramInitData(signedInitData(), botToken, 60, now + 61000), /expired/);
});

test('rejects data without a valid Telegram user', () => {
  assert.throws(() => verifyTelegramInitData(signedInitData({ user: '{}' }), botToken, 86400, now), /user data is invalid/);
});
