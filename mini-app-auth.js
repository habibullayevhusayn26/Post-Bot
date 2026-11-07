const crypto = require('node:crypto');

function verifyTelegramInitData(initData, botToken, maxAgeSeconds = 86400, now = Date.now()) {
  if (typeof initData !== 'string' || !initData || typeof botToken !== 'string' || !botToken) {
    throw new Error('Mini App authentication data is missing.');
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    throw new Error('Mini App authentication data is invalid.');
  }

  const authDate = Number(params.get('auth_date'));
  const ageSeconds = Math.floor(now / 1000) - authDate;
  if (!Number.isSafeInteger(authDate) || ageSeconds < -30 || ageSeconds > maxAgeSeconds) {
    throw new Error('Mini App authentication data has expired.');
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest();
  const actualHash = Buffer.from(receivedHash, 'hex');
  if (!crypto.timingSafeEqual(expectedHash, actualHash)) {
    throw new Error('Mini App authentication signature is invalid.');
  }

  let user;
  try {
    user = JSON.parse(params.get('user') || '');
  } catch {
    throw new Error('Mini App user data is invalid.');
  }
  if (!Number.isSafeInteger(user?.id) || user.id <= 0) {
    throw new Error('Mini App user data is invalid.');
  }

  return user;
}

module.exports = { verifyTelegramInitData };
