const crypto = require('node:crypto');

class ChannelAccessError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ChannelAccessError';
    this.statusCode = 400;
  }
}

async function findPostableChat(telegram, userId, chatId, expectedType) {
  let chat;
  try {
    chat = await telegram.getChat(chatId);
  } catch {
    throw new ChannelAccessError('Tanlangan kanal yoki guruh topilmadi yoki bot unga kira olmaydi.');
  }

  return validatePostableChat(telegram, userId, chat, expectedType);
}

async function validatePostableChat(telegram, userId, chat, expectedType) {
  if (!['channel', 'group', 'supergroup'].includes(chat.type)) {
    throw new ChannelAccessError('Faqat kanal yoki guruh ulash mumkin.');
  }
  if (expectedType === 'channel' && chat.type !== 'channel') {
    throw new ChannelAccessError('Kanal tanlash so‘rovida guruh tanlandi. Qayta urinib ko‘ring.');
  }
  if (expectedType === 'group' && !['group', 'supergroup'].includes(chat.type)) {
    throw new ChannelAccessError('Guruh tanlash so‘rovida kanal tanlandi. Qayta urinib ko‘ring.');
  }

  let botMember;
  try {
    const bot = await telegram.getMe();
    botMember = await telegram.getChatMember(chat.id, bot.id);
  } catch {
    throw new ChannelAccessError('Botni tanlangan chatga administrator qilib qo‘shing va qayta urinib ko‘ring.');
  }
  if (!['creator', 'administrator'].includes(botMember.status)) {
    throw new ChannelAccessError('Bot tanlangan chatda administrator bo‘lishi kerak.');
  }
  if (chat.type === 'channel' && botMember.status !== 'creator' && botMember.can_post_messages !== true) {
    throw new ChannelAccessError('Bot administratoriga post yuborish huquqini bering.');
  }

  let userMember;
  try {
    userMember = await telegram.getChatMember(chat.id, userId);
  } catch {
    throw new ChannelAccessError('Chatni ulash uchun siz uning egasi yoki administratori bo‘lishingiz kerak.');
  }
  if (!['creator', 'administrator'].includes(userMember.status)) {
    throw new ChannelAccessError('Chatni ulash uchun siz uning egasi yoki administratori bo‘lishingiz kerak.');
  }

  return {
    id: chat.id,
    title: chat.title || (chat.username ? `@${chat.username}` : String(chat.id)),
    username: chat.username ? `@${chat.username}` : ''
  };
}

async function findPostableChannel(telegram, userId, username) {
  let chat;
  try {
    chat = await telegram.getChat(username);
  } catch {
    throw new ChannelAccessError('Public kanal topilmadi. Username’ni tekshiring.');
  }

  if (chat.type !== 'channel' || !chat.username) {
    throw new ChannelAccessError('Ochiq kanal username’ini kiriting.');
  }

  return validatePostableChat(telegram, userId, chat, 'channel');
}

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

function buildMiniAppStatistics(account, channels) {
  const channelNames = new Map((channels || []).map((channel) => [String(channel.id), channel.title || channel.username || String(channel.id)]));
  const records = (Array.isArray(account.postStats) ? account.postStats : [])
    .map((entry) => {
      const channelIds = Array.isArray(entry.channelIds) ? entry.channelIds : [];
      return {
        publishedAt: entry.publishedAt || null,
        channelCount: Number(entry.channelCount) || channelIds.length,
        channels: channelIds.map((id) => ({
          id,
          name: channelNames.get(String(id)) || String(id)
        })),
        mediaType: entry.mediaType || 'text'
      };
    })
    .sort((left, right) => new Date(right.publishedAt || 0) - new Date(left.publishedAt || 0))
    .slice(0, 100);
  const lastPublishedAt = account.lastPublishedAt ||
    records.find((entry) => entry.publishedAt)?.publishedAt ||
    null;

  return {
    publishedPosts: Math.max(Number(account.publishedPosts) || 0, records.length),
    publishedChannels: Math.max(
      Number(account.publishedChannels) || 0,
      records.reduce((total, entry) => total + entry.channelCount, 0)
    ),
    templateCount: Array.isArray(account.templates) ? account.templates.length : 0,
    lastPublishedAt,
    records
  };
}

const POLLING_LEASE_KEY = 'telegram_polling_lease';
const POLLING_LEASE_DURATION_MS = 20000;
const POLLING_LEASE_RENEW_INTERVAL_MS = 5000;
const POLLING_LEASE_RETRY_INTERVAL_MS = 1000;

function createLeaseExpiry(now = Date.now()) {
  return new Date(now + POLLING_LEASE_DURATION_MS);
}

function getLeaseRetryDelay(expiresAt, now = Date.now()) {
  const expiry = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiry)) return POLLING_LEASE_RETRY_INTERVAL_MS;
  return Math.max(100, Math.min(POLLING_LEASE_RETRY_INTERVAL_MS, expiry - now));
}

module.exports = {
  ChannelAccessError,
  findPostableChannel,
  findPostableChat,
  verifyTelegramInitData,
  buildMiniAppStatistics,
  POLLING_LEASE_KEY,
  POLLING_LEASE_DURATION_MS,
  POLLING_LEASE_RENEW_INTERVAL_MS,
  POLLING_LEASE_RETRY_INTERVAL_MS,
  createLeaseExpiry,
  getLeaseRetryDelay
};
