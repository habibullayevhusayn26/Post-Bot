const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
process.env.TZ = 'Asia/Tashkent';
const mongoose = require('mongoose');
const crypto = require('node:crypto');

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error('MONGODB_URI is missing. Add the MongoDB Atlas connection string to .env.');
}

const mongoConnection = mongoose.connect(mongoUri, {
  serverSelectionTimeoutMS: 10000
});

const userSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true, index: true },
  username: { type: String, default: '' },
  referredBy: { type: Number, default: null },
  joinedAt: { type: Date, default: Date.now },
  personalId: { type: Number },
  nickname: { type: String, default: '' },
  language: { type: String, default: 'uz' },
  channels: { type: Array, default: [] },
  premium: { type: Boolean, default: false },
  premiumPurchasedAt: { type: Date, default: null },
  telegramPaymentChargeIds: { type: [String], default: [] },
  postLog: { type: Array, default: [] },
  templates: { type: Array, default: [] },
  publishedPosts: { type: Number, default: 0 },
  publishedChannels: { type: Number, default: 0 },
  lastPublishedAt: { type: Date, default: null },
  postStats: { type: Array, default: [] },
  miniAppPosts: { type: [mongoose.Schema.Types.Mixed], default: [] },
  miniAppSettings: {
    silent: { type: Boolean, default: false },
    linkPreview: { type: Boolean, default: true },
    signatureEnabled: { type: Boolean, default: false },
    signature: { type: String, default: '' }
  },
  profileSeen: { type: Boolean, default: false },
}, { versionKey: false });

const botConfigSchema = new mongoose.Schema({
  configKey: { type: String, default: 'main_config', unique: true },
  channels: { type: Array, default: [] },
  maintenanceMode: { type: Boolean, default: false },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  stats: { type: mongoose.Schema.Types.Mixed, default: {} },
  leaseOwner: { type: String },
  leaseExpiresAt: { type: Date },
}, { versionKey: false });

const User = mongoose.models.User || mongoose.model('User', userSchema);
const BotConfig = mongoose.models.BotConfig || mongoose.model('BotConfig', botConfigSchema);
const botInstanceId = crypto.randomUUID();

const express = require('express');
const app = express();
const port = Number(process.env.PORT) || 3000;

app.get('/', (req, res) => res.send('Bot ishlamoqda...'));
app.get('/health', (req, res) => {
  const isDatabaseConnected = mongoose.connection.readyState === 1;
  return res.status(isDatabaseConnected ? 200 : 503).json({
    ok: isDatabaseConnected,
    mongodb: isDatabaseConnected ? 'connected' : 'disconnected'
  });
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Express server ${port} portda ishlayapti.`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

const fs = require('node:fs');
const { Telegraf, Markup, session } = require('telegraf');
const {
  verifyTelegramInitData,
  findPostableChannel,
  findPostableChat,
  buildMiniAppStatistics,
  POLLING_LEASE_KEY,
  POLLING_LEASE_RENEW_INTERVAL_MS,
  createLeaseExpiry,
  getLeaseRetryDelay
} = require('./channel');

const EMOJIS = Object.freeze({
  phone: { emoji: '📱', id: '5407025283456835913' },
  note: { emoji: '📝', id: '5370546867786523009' },
  announce: { emoji: '📢', id: '5972335630644943766' },
  stats: { emoji: '📊', id: '5431577498364158238' },
  user: { emoji: '👤', id: '5316727448644103237' },
  premium: { emoji: '💎', id: '5393396291369725822' },
  help: { emoji: '❓', id: '5424642182743088988' },
  add: { emoji: '➕', id: '5258108352008823107' },
  delete: { emoji: '🗑', id: '5258130763148172425' },
  back: { emoji: '⬅️', id: '5971875759906626201' },
  link: { emoji: '🔗', id: '5395499356465968344' },
  send: { emoji: '📤', id: '5972094476821208559' },
  cancel: { emoji: '❌', id: '5391126096211110962' },
  blue: { emoji: '🔵', id: '5231031220317484418' },
  green: { emoji: '🟢', id: '5231365622176184397' },
  red: { emoji: '🔴', id: '5228752542598464650' },
  megaphone: { emoji: '📣', id: '5260268501515377807' },
  growth: { emoji: '📈', id: '5258391025281408576' },
  lock: { emoji: '🔒', id: '4904500559203009298' },
  blocked: { emoji: '🚫', id: '5393391124524067990' },
  done: { emoji: '✅', id: '5971815857997750999' },
  image: { emoji: '🖼', id: '5971957540378910955' },
  write: { emoji: '✍️', id: '5470060791883374114' },
  payment: { emoji: '💳', id: '5974575468974705730' },
  settings: { emoji: '⚙️', id: '5974411495713294659' },
  search: { emoji: '🔍', id: '5231012545799666522' },
  message: { emoji: '💬', id: '5393314064220843793' }
});
const CUSTOM_EMOJI_IDS = new Set(Object.values(EMOJIS).map(({ id }) => id));

function getEmojiForText(value) {
  const label = String(value || '').replace(/<[^>]*>/g, '').toLocaleLowerCase();
  const existing = Object.values(EMOJIS).find(({ emoji }) => label.includes(emoji));
  if (existing) return existing;
  const matches = (terms) => terms.some((term) => label.includes(term));
  if (matches(['🔵', 'ko‘k', "ko'k", 'blue'])) return EMOJIS.blue;
  if (matches(['🟢', 'yashil', 'green'])) return EMOJIS.green;
  if (matches(['🔴', 'qizil', 'red'])) return EMOJIS.red;
  if (matches(['sozlama', 'settings', 'sozlash'])) return EMOJIS.settings;
  if (matches(['karta', 'to‘lov', "to'lov", 'payment', 'narx'])) return EMOJIS.payment;
  if (matches(['premium'])) return EMOJIS.premium;
  if (matches(['profil', 'foydalanuvchi', 'username', 'telegram id', 'botdagi id', 'user'])) return EMOJIS.user;
  if (matches(['statistik', 'ko‘rsatkich', "ko'rsatkich"])) return EMOJIS.stats;
  if (matches(['yordam', 'savol', 'qanday', 'help'])) return EMOJIS.help;
  if (matches(['ruxsat yo‘q', "ruxsat yo'q", 'taqiql', 'blok'])) return EMOJIS.blocked;
  if (matches(['o‘chir', "o'chir", 'delete', 'remove', 'trash'])) return EMOJIS.delete;
  if (matches(['bekor', 'cancel', 'rad et', 'rad qil'])) return EMOJIS.cancel;
  if (matches(['orqaga', 'back'])) return EMOJIS.back;
  if (matches(['havola', 'url', 'link'])) return EMOJIS.link;
  if (matches(['kanal', 'obuna', 'broadcast', 'barchaga', 'e’lon', "e'lon"])) return EMOJIS.announce;
  if (matches(['rasm', 'foto', 'image', 'photo'])) return EMOJIS.image;
  if (matches(['tasdiq', 'muvaffaqiyat', 'yuborildi', 'faol', 'tayyor'])) return EMOJIS.done;
  if (matches(['yubor', 'jo‘nat', "jo'nat", 'publish', 'send'])) return EMOJIS.send;
  if (matches(['o‘sish', "o'sish", 'growth'])) return EMOJIS.growth;
  if (matches(['maxfiy', 'lock', 'parol'])) return EMOJIS.lock;
  if (matches(['qo‘sh', "qo'sh", 'yangi', 'add'])) return EMOJIS.add;
  if (matches(['post', 'yoz', 'matn', 'izoh', 'shablon', 'caption'])) return EMOJIS.write;
  return EMOJIS.message;
}

function getButtonStyle(value) {
  const label = String(value || '').replace(/<[^>]*>/g, '').toLocaleLowerCase();
  const matches = (terms) => terms.some((term) => label.includes(term));
  if (matches(['🔴', 'qizil', 'red', 'bekor', 'o‘chir', "o'chir", 'rad et', 'rad qil', 'delete', 'remove', 'reject'])) {
    return { bg_danger: true };
  }
  if (matches(['🟢', 'yashil', 'green'])) return { bg_success: true };
  if (matches(['🔵', 'ko‘k', "ko'k", 'blue'])) return { bg_primary: true };
  if (matches(['premium', 'post yarat', 'tasdiq', 'yubor', 'jo‘nat', "jo'nat", 'publish', 'send', 'qo‘sh', "qo'sh", 'approve', 'confirm', 'saqla'])) {
    return { bg_success: true };
  }
  return { bg_primary: true };
}

function decorateButton(button) {
  if (typeof button === 'string') return decorateButton({ text: button });
  if (!button || typeof button !== 'object' || typeof button.text !== 'string') return button;
  const existingEmoji = Object.values(EMOJIS).find(({ emoji }) =>
    button.text.startsWith(`${emoji} `) || button.text === emoji
  );
  const emoji = existingEmoji || getEmojiForText(button.text);
  const legacyStyles = {
    primary: { bg_primary: true },
    success: { bg_success: true },
    danger: { bg_danger: true }
  };
  const buttonStyle = button.button_style ||
    legacyStyles[button.style] ||
    getButtonStyle(button.text);
  const { style, ...buttonWithoutLegacyStyle } = button;
  return {
    ...buttonWithoutLegacyStyle,
    text: existingEmoji ? button.text : `${emoji.emoji} ${button.text}`,
    icon_custom_emoji_id: button.icon_custom_emoji_id || emoji.id,
    button_style: buttonStyle
  };
}

function decorateReplyMarkup(replyMarkup) {
  if (!replyMarkup || typeof replyMarkup !== 'object') return replyMarkup;
  const result = { ...replyMarkup };
  for (const key of ['keyboard', 'inline_keyboard']) {
    if (Array.isArray(result[key])) {
      result[key] = result[key].map((row) =>
        Array.isArray(row) ? row.map(decorateButton) : row
      );
    }
  }
  return result;
}

function hasOurEmojiPrefix(text, parseMode, entities) {
  if (parseMode === 'HTML' && /^<tg-emoji emoji-id="\d+">[^<]+<\/tg-emoji> /.test(text)) return true;
  if (parseMode === 'MarkdownV2' && /^!\[\]\(tg:\/\/emoji\?id=\d+\) /.test(text)) return true;
  return entities?.some((entity) =>
    entity.type === 'custom_emoji' &&
    entity.offset === 0 &&
    CUSTOM_EMOJI_IDS.has(String(entity.custom_emoji_id))
  ) || false;
}

function prefixCustomEmoji(text, payload, entityKey, parseModeKey) {
  if (typeof text !== 'string' || !text) return text;
  const entities = payload[entityKey];
  const parseMode = payload[parseModeKey];
  if (hasOurEmojiPrefix(text, parseMode, entities)) return text;
  const existingTextEmoji = Object.values(EMOJIS).find(({ emoji }) =>
    text.startsWith(`${emoji} `) || text === emoji
  );
  const emoji = existingTextEmoji || getEmojiForText(text);
  const hasVisibleEmojiPrefix = Boolean(existingTextEmoji) &&
    !entities?.some((entity) => entity.offset === 0);
  const prefixLength = hasVisibleEmojiPrefix ? 0 : emoji.emoji.length + 1;

  if (parseMode === 'HTML') {
    if (hasVisibleEmojiPrefix) return text;
    if (Array.isArray(entities)) {
      payload[entityKey] = entities.map((entity) => ({ ...entity, offset: entity.offset + prefixLength }));
    }
    return `<tg-emoji emoji-id="${emoji.id}">${emoji.emoji}</tg-emoji> ${text}`;
  }
  if (parseMode === 'MarkdownV2') {
    return hasVisibleEmojiPrefix ? text : `![](tg://emoji?id=${emoji.id}) ${text}`;
  }
  if (parseMode) return hasVisibleEmojiPrefix ? text : `${emoji.emoji} ${text}`;
  if (hasVisibleEmojiPrefix) {
    payload[entityKey] = [
      { type: 'custom_emoji', offset: 0, length: emoji.emoji.length, custom_emoji_id: emoji.id },
      ...(Array.isArray(entities) ? entities : [])
    ];
    return text;
  }

  payload[entityKey] = [
    { type: 'custom_emoji', offset: 0, length: emoji.emoji.length, custom_emoji_id: emoji.id },
    ...(Array.isArray(entities)
      ? entities.map((entity) => ({ ...entity, offset: entity.offset + prefixLength }))
      : [])
  ];
  return `${emoji.emoji} ${text}`;
}

function decorateTelegramPayload(method, originalPayload) {
  const payload = { ...originalPayload };
  if (payload.reply_markup) payload.reply_markup = decorateReplyMarkup(payload.reply_markup);
  if (method === 'sendMessage' || method === 'editMessageText') {
    payload.text = prefixCustomEmoji(payload.text, payload, 'entities', 'parse_mode');
  } else if (['sendPhoto', 'sendVideo', 'sendAnimation', 'sendDocument', 'sendAudio', 'sendVoice', 'editMessageCaption']
    .includes(method)) {
    payload.caption = prefixCustomEmoji(payload.caption, payload, 'caption_entities', 'parse_mode');
  } else if (method === 'sendMediaGroup' && Array.isArray(payload.media)) {
    payload.media = payload.media.map((item) => ({
      ...item,
      caption: prefixCustomEmoji(item.caption, item, 'caption_entities', 'parse_mode')
    }));
  }
  return payload;
}

function removePremiumEmoji(payload) {
  let changed = false;
  const result = { ...payload };
  if (result.reply_markup) {
    const replyMarkup = { ...result.reply_markup };
    for (const key of ['keyboard', 'inline_keyboard']) {
      if (!Array.isArray(replyMarkup[key])) continue;
      replyMarkup[key] = replyMarkup[key].map((row) => row.map((button) => {
        if (!button || typeof button !== 'object' || !CUSTOM_EMOJI_IDS.has(String(button.icon_custom_emoji_id))) {
          return button;
        }
        const { icon_custom_emoji_id, ...fallbackButton } = button;
        const emoji = Object.values(EMOJIS).find(({ id }) => id === String(icon_custom_emoji_id));
        if (emoji && !fallbackButton.text.startsWith(emoji.emoji)) {
          fallbackButton.text = `${emoji.emoji} ${fallbackButton.text}`;
        }
        changed = true;
        return fallbackButton;
      }));
    }
    result.reply_markup = replyMarkup;
  }

  for (const [textKey, entityKey, parseModeKey] of [
    ['text', 'entities', 'parse_mode'],
    ['caption', 'caption_entities', 'parse_mode']
  ]) {
    const text = result[textKey];
    if (typeof text !== 'string') continue;
    const tagPattern = /<tg-emoji emoji-id="(\d+)">([^<]+)<\/tg-emoji>/g;
    let replacedTag = false;
    const fallbackText = text.replace(tagPattern, (tag, id, emoji) => {
      if (!CUSTOM_EMOJI_IDS.has(id)) return tag;
      replacedTag = true;
      return emoji;
    });
    if (replacedTag) {
      result[textKey] = fallbackText;
      changed = true;
    }

    const tagPrefix = /^<tg-emoji emoji-id="(\d+)">([^<]+)<\/tg-emoji> /.exec(text);
    const markdownPrefix = /^!\[\]\(tg:\/\/emoji\?id=(\d+)\) /.exec(text);
    const prefix = tagPrefix || markdownPrefix;
    const hasMarkupPrefix = Boolean(prefix && CUSTOM_EMOJI_IDS.has(prefix[1]));
    if (markdownPrefix && hasMarkupPrefix) {
      const emoji = Object.values(EMOJIS).find(({ id }) => id === prefix[1]).emoji;
      result[textKey] = `${emoji} ${result[textKey].slice(prefix[0].length)}`;
      changed = true;
    }
    const entities = result[entityKey];
    if (!Array.isArray(entities) || hasMarkupPrefix) continue;
    const customPrefix = entities.find((entity) =>
      entity.type === 'custom_emoji' &&
      entity.offset === 0 &&
      CUSTOM_EMOJI_IDS.has(String(entity.custom_emoji_id))
    );
    if (customPrefix) {
      result[entityKey] = entities.filter((entity) => entity !== customPrefix);
      changed = true;
    }
  }
  if (Array.isArray(result.media)) {
    result.media = result.media.map((item) => {
      const fallbackItem = removePremiumEmoji(item);
      if (fallbackItem) {
        changed = true;
        return fallbackItem;
      }
      return item;
    });
  }
  return changed ? result : null;
}

function removeButtonStyles(payload) {
  let changed = false;
  const result = { ...payload };
  if (!result.reply_markup || typeof result.reply_markup !== 'object') return null;
  const replyMarkup = { ...result.reply_markup };
  for (const key of ['keyboard', 'inline_keyboard']) {
    if (!Array.isArray(replyMarkup[key])) continue;
    replyMarkup[key] = replyMarkup[key].map((row) => row.map((button) => {
      if (!button || typeof button !== 'object' || (!button.style && !button.button_style)) return button;
      const { style, button_style, ...fallbackButton } = button;
      changed = true;
      return fallbackButton;
    }));
  }
  result.reply_markup = replyMarkup;
  return changed ? result : null;
}

function isCustomEmojiError(error) {
  const description = String(error?.response?.description || error?.description || error?.message || '');
  return error?.response?.error_code === 400 &&
    /custom.?emoji|icon_custom_emoji_id|can't parse entities|unsupported start tag/i.test(description);
}

function isButtonStyleError(error) {
  const description = String(error?.response?.description || error?.description || error?.message || '');
  return error?.response?.error_code === 400 &&
    /button[_\s].{0,30}style|style[_\s].{0,30}button|reply keyboard button|inline keyboard button/i.test(description);
}

function getTelegramPayloadFallback(error, payload) {
  if (isCustomEmojiError(error)) return removePremiumEmoji(payload);
  if (isButtonStyleError(error)) return removeButtonStyles(payload);
  return null;
}

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error('BOT_TOKEN is missing. Copy .env.example to .env and add the token.');
}

const bot = new Telegraf(token);
const originalTelegramCallApi = bot.telegram.callApi.bind(bot.telegram);
bot.telegram.callApi = async (method, payload, options) => {
  let candidate = decorateTelegramPayload(method, payload);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await originalTelegramCallApi(method, candidate, options);
    } catch (error) {
      if (attempt === 2) throw error;
      const fallback = getTelegramPayloadFallback(error, candidate);
      if (!fallback) throw error;
      candidate = fallback;
      console.warn(
        'Telegram rejected premium emoji or button styling; retrying with compatible formatting.',
        error.response?.description || error.message
      );
    }
  }
  throw new Error('Telegram request exhausted its formatting fallbacks.');
};
const BOT_TIMEZONE = 'Asia/Tashkent';

async function safeAnswerCbQuery(ctx) {
  if (!ctx.callbackQuery) return;
  try {
    await ctx.answerCbQuery();
  } catch (error) {
    console.warn('Callback answer failed:', error.response?.description || error.message);
  }
}

bot.use(async (ctx, next) => {
  try {
    return await next();
  } catch (error) {
    console.error(`Update ${ctx.updateType} failed:`, error.response?.description || error.message);
    if (ctx.preCheckoutQuery) {
      await ctx.answerPreCheckoutQuery(false, 'To‘lovni tekshirishda xatolik yuz berdi. Qayta urinib ko‘ring.')
        .catch((checkoutError) => console.error('Pre-checkout rejection failed:', checkoutError.message));
    }
    await safeAnswerCbQuery(ctx);
    if (ctx?.reply) {
      await ctx.reply('Texnik xatolik yuz berdi. Qaytadan urinib ko\'ring.').catch(() => {});
    }
  }
});

const projectRoot = __dirname;
const localDataPath = path.join(projectRoot, 'data.json');
const renderDiskDataPath = '/opt/render/project/src/data/data.json';
const legacyDataPath = fs.existsSync(renderDiskDataPath) ? renderDiskDataPath : localDataPath;
const legacyData = fs.existsSync(legacyDataPath) ? JSON.parse(fs.readFileSync(legacyDataPath, 'utf8')) : { users: {} };
const data = { users: {}, settings: {}, stats: {} };
data.users ||= {};
data.settings ||= {};
data.settings.requiredChannels ||= [];
data.settings.premiumStarsPrice ||= 50;
if (data.settings.requiredChannel && !Array.isArray(data.settings.requiredChannels)) {
  data.settings.requiredChannels = [data.settings.requiredChannel];
}
if (data.settings.requiredChannel && Array.isArray(data.settings.requiredChannels)) {
  data.settings.requiredChannels.unshift(data.settings.requiredChannel);
  delete data.settings.requiredChannel;
}
if (!Array.isArray(data.settings.requiredChannels)) data.settings.requiredChannels = [];
const ADMIN_TG_ID = 7669387254;
const text = {
  channels: { uz: 'Kanallarim' },
  addChannel: { uz: 'Kanal yoki guruh ulash' },
  admin: { uz: 'Admin panel' },
  createPost: { uz: 'Post yaratish' },
  profile: { uz: 'Profilim' },
  botId: { uz: 'Botdagi ID' },
  telegramId: { uz: 'Telegram ID' },
  username: { uz: 'Foydalanuvchi nomi' },
  nickname: { uz: 'Taxallus' },
};
const replyTranslations = {
  en: {
    'Ruxsat yo\'q.': 'Access denied.', 'Kanal topilmadi.': 'Channel not found.', 'Post uchun rasm yuboring.': 'Send a photo for the post.',
    'Tugma matnini yuboring:': 'Send the button text:', 'Tugma rangini tanlang:': 'Choose the button color:',
    'Amal bekor qilindi.': 'Action cancelled.', 'Kanalni tanlang:': 'Choose a channel:',
    'Kanal username sini yuboring, masalan: @my_channel': 'Send the channel username, for example: @my_channel',
    'Izoh saqlandi. Havolali tugmalar qo\'shishingiz mumkin:': 'Caption saved. You can add URL buttons:',
    'Post tayyor. Havolali tugmalar qo\'shishingiz mumkin:': 'Post ready. You can add URL buttons:',
    'Tugma rangini tanlang:': 'Choose the button color:',
    'Havola http:// yoki https:// bilan boshlanishi kerak. Qayta yuboring:': 'The URL must start with http:// or https://. Send it again:',
    'Kerakli amalni pastki menyudan tanlang.': 'Choose an action from the menu.',
    'Broadcast boshlanmagan.': 'Broadcast has not started.', 'Broadcast izohini yuboring:': 'Send the broadcast caption:',
    'Rasm saqlandi. Broadcast izohini yuboring:': 'Photo saved. Send the broadcast caption:',
    'Post ma\'lumotlari topilmadi.': 'Post data was not found.', 'Broadcast mazmuni topilmadi.': 'Broadcast content was not found.',
    'Texnik xatolik yuz berdi. Keyinroq qayta urinib ko\'ring.': 'A technical error occurred. Try again later.',
    'Assalomu alaykum! Kanal postlarini boshqarish botiga xush kelibsiz.': 'Welcome to the channel post management bot.',
    'Rasm va izoh saqlandi. Havolali tugmalar qo\'shishingiz mumkin:': 'Photo and caption saved. You can add URL buttons:',
    'Endi post izohini yuboring yoki «Izohsiz» tugmasini bosing.': 'Send the post caption or press “No caption”.',
    'Avval post yaratishni boshlang.': 'Start creating a post first.', 'Tugma ma\'lumotlari topilmadi. Qaytadan boshlang.': 'Button data was not found. Start again.',
    'Rangli tugma qo\'shildi. Yana tugma qo\'shasizmi yoki postni yuboramizmi?': 'Colored button added. Add another button or publish the post?',
    'Majburiy obuna kanalining public username sini yuboring, masalan: @my_channel': 'Send the required subscription channel username, for example: @my_channel',
    'Broadcast uchun rasm yuboring yoki «Rasmsiz» tugmasini bosing.': 'Send a broadcast photo or press “Without photo”.',
    'Tugma havolasini yuboring (https://...):': 'Send the button URL (https://...):', 'Rasm va izoh saqlandi. Havolali tugmalar qo\'shishingiz mumkin:': 'Photo and caption saved. You can add URL buttons:',
    'Post uchun rasm yuboring yoki «Rasmsiz» tugmasini bosing.': 'Send a photo for the post or press “Without photo”.',
    'Yangi miqdorni kiriting (qoshish uchun).': 'Enter the new amount (for adding).',
    'Yangi miqdorni kiriting (ayirish uchun).': 'Enter the new amount (for subtracting).'
  },
  ru: {
    'Ruxsat yo\'q.': 'Нет доступа.', 'Kanal topilmadi.': 'Канал не найден.', 'Post uchun rasm yuboring.': 'Отправьте фото для поста.',
    'Tugma matnini yuboring:': 'Отправьте текст кнопки:', 'Tugma rangini tanlang:': 'Выберите цвет кнопки:', 'Amal bekor qilindi.': 'Действие отменено.',
    'Kanalni tanlang:': 'Выберите канал:', 'Kanal username sini yuboring, masalan: @my_channel': 'Отправьте username канала, например: @my_channel',
    'Izoh saqlandi. Havolali tugmalar qo\'shishingiz mumkin:': 'Подпись сохранена. Можно добавить URL-кнопки:', 'Post tayyor. Havolali tugmalar qo\'shishingiz mumkin:': 'Пост готов. Можно добавить URL-кнопки:',
    'Havola http:// yoki https:// bilan boshlanishi kerak. Qayta yuboring:': 'Ссылка должна начинаться с http:// или https://. Отправьте ещё раз:', 'Kerakli amalni pastki menyudan tanlang.': 'Выберите действие в меню.',
    'Broadcast boshlanmagan.': 'Рассылка не начата.', 'Broadcast izohini yuboring:': 'Отправьте подпись рассылки:', 'Rasm saqlandi. Broadcast izohini yuboring:': 'Фото сохранено. Отправьте подпись рассылки:',
    'Post ma\'lumotlari topilmadi.': 'Данные поста не найдены.', 'Broadcast mazmuni topilmadi.': 'Содержимое рассылки не найдено.', 'Texnik xatolik yuz berdi. Keyinroq qayta urinib ko\'ring.': 'Произошла техническая ошибка. Попробуйте позже.',
    'Assalomu alaykum! Kanal postlarini boshqarish botiga xush kelibsiz.': 'Добро пожаловать в бот управления постами каналов.', 'Rasm va izoh saqlandi. Havolali tugmalar qo\'shishingiz mumkin:': 'Фото и подпись сохранены. Можно добавить URL-кнопки:', 'Endi post izohini yuboring yoki «Izohsiz» tugmasini bosing.': 'Отправьте подпись поста или нажмите «Без подписи».', 'Avval post yaratishni boshlang.': 'Сначала начните создание поста.', 'Tugma ma\'lumotlari topilmadi. Qaytadan boshlang.': 'Данные кнопки не найдены. Начните заново.', 'Rangli tugma qo\'shildi. Yana tugma qo\'shasizmi yoki postni yuboramizmi?': 'Цветная кнопка добавлена. Добавить ещё или отправить пост?', 'Majburiy obuna kanalining public username sini yuboring, masalan: @my_channel': 'Отправьте username канала обязательной подписки, например: @my_channel', 'Broadcast uchun rasm yuboring yoki «Rasmsiz» tugmasini bosing.': 'Отправьте фото рассылки или нажмите «Без фото».', 'Tugma havolasini yuboring (https://...):': 'Отправьте URL кнопки (https://...):',
    'Post uchun rasm yuboring yoki «Rasmsiz» tugmasini bosing.': 'Отправьте фото для поста или нажмите «Без фото».',
    'Yangi miqdorni kiriting (qoshish uchun).': 'Введите новую сумму (для пополнения).',
    'Yangi miqdorni kiriting (ayirish uchun).': 'Введите новую сумму (для списания).'
  },
  tr: {
    'Ruxsat yo\'q.': 'Erişim yok.', 'Kanal topilmadi.': 'Kanal bulunamadı.', 'Post için rasm yuboring.': 'Gönderi için fotoğraf gönderin.', 'Tugma matnini yuboring:': 'Buton metnini gönderin:', 'Tugma rangini tanlang:': 'Buton rengini seçin:', 'Amal bekor qilindi.': 'İşlem iptal edildi.', 'Kanalni tanlang:': 'Bir kanal seçin:', 'Kerakli amalni pastki menyudan tanlang.': 'Menüden bir işlem seçin:', 'Broadcast izohini yuboring:': 'Yayın açıklamasını gönderin:', 'Post ma\'lumotlari topilmadi.': 'Gönderi bilgileri bulunamadı.',
    'Post uchun rasm yuboring yoki «Rasmsiz» tugmasini bosing.': 'Gönderi için fotoğraf gönderin veya «Resimsiz» butonuna basın.',
    'Yangi miqdorni kiriting (qoshish uchun).': 'Yeni tutarı girin (ekleme için).',
    'Yangi miqdorni kiriting (ayirish uchun).': 'Yeni tutarı girin (çıkarma için).'
  },
  ar: { 'Ruxsat yo\'q.': 'لا يوجد صلاحية.', 'Kanal topilmadi.': 'لم يتم العثور على القناة.', 'Post uchun rasm yuboring.': 'أرسل صورة للمنشور.', 'Amal bekor qilindi.': 'تم إلغاء العملية.', 'Kanalni tanlang:': 'اختر قناة:', 'Tugma matnini yuboring:': 'أرسل نص الزر:', 'Tugma rangini tanlang:': 'اختر لون الزر:',
    'Post uchun rasm yuboring yoki «Rasmsiz» tugmasini bosing.': 'أرسل صورة للمنشور أو اضغط على «بدون صورة».',
    'Yangi miqdorni kiriting (qoshish uchun).': 'أدخل المبلغ الجديد (لإضافة).',
    'Yangi miqdorni kiriting (ayirish uchun).': 'أدخل المبلغ الجديد (للخصم).' },
  zh: { 'Ruxsat yo\'q.': '无权限。', 'Kanal topilmadi.': '未找到频道。', 'Post uchun rasm yuboring.': '请发送帖子图片。', 'Amal bekor qilindi.': '操作已取消。', 'Kanalni tanlang:': '请选择频道：', 'Tugma matnini yuboring:': '请发送按钮文字：', 'Tugma rangini tanlang:': '请选择按钮颜色：',
    'Post uchun rasm yuboring yoki «Rasmsiz» tugmasini bosing.': '请发送帖子图片，或按“无图”。',
    'Yangi miqdorni kiriting (qoshish uchun).': '输入新金额（用于加款）。',
    'Yangi miqdorni kiriting (ayirish uchun).': '输入新金额（用于扣款）。' },
  ko: { 'Ruxsat yo\'q.': '권한이 없습니다.', 'Kanal topilmadi.': '채널을 찾을 수 없습니다.', 'Post uchun rasm yuboring.': '게시물 사진을 보내세요.', 'Amal bekor qilindi.': '작업이 취소되었습니다.', 'Kanalni tanlang:': '채널을 선택하세요:', 'Tugma matnini yuboring:': '버튼 문구를 보내세요:', 'Tugma rangini tanlang:': '버튼 색상을 선택하세요:',
    'Post uchun rasm yuboring yoki «Rasmsiz» tugmasini bosing.': '게시물 사진을 보내거나 “사진 없음” 버튼을 누르세요.',
    'Yangi miqdorni kiriting (qoshish uchun).': '새 금액을 입력하세요 (추가용).',
    'Yangi miqdorni kiriting (ayirish uchun).': '새 금액을 입력하세요 (차감용).' },
  tg: { 'Ruxsat yo\'q.': 'Иҷозат нест.', 'Kanal topilmadi.': 'Канал ёфт нашуд.', 'Post uchun rasm yuboring.': 'Барои пост акс фиристед.', 'Amal bekor qilindi.': 'Амалиёт бекор шуд.', 'Kanalni tanlang:': 'Каналро интихоб кунед:', 'Tugma matnini yuboring:': 'Матни тугмаро фиристед:', 'Tugma rangini tanlang:': 'Ранги тугмаро интихоб кунед:',
    'Post uchun rasm yuboring yoki «Rasmsiz» tugmasini bosing.': 'Барои пост акс фиристед ё тугмаи «Бе акс» -ро пахш кунед.',
    'Yangi miqdorni kiriting (qoshish uchun).': 'Миқдори навро ворид кунед (барои илова).',
    'Yangi miqdorni kiriting (ayirish uchun).': 'Миқдори навро ворид кунед (барои кам кардан).' }
};
const keyboardTranslations = {
  en: { 'Kanal qo\'shish': 'Add channel', 'Post yaratish': 'Create post', 'Kanalni o\'chirish': 'Remove channel', 'Orqaga': 'Back', 'Havolali tugma qo\'shish': 'Add URL button', 'Postni yuborish': 'Publish post', 'Bekor qilish': 'Cancel', 'Ko\'k': 'Blue', 'Yashil': 'Green', 'Qizil': 'Red', 'Statistika': 'Statistics', 'Barchaga post yuborish': 'Broadcast post', 'Majburiy obunani sozlash': 'Set required subscription', 'Majburiy obunani o\'chirish': 'Disable required subscription', 'Kanalga obuna bo\'lish': 'Subscribe to channel', 'Obunani tekshirish': 'Check subscription' },
  ru: { 'Kanal qo\'shish': 'Добавить канал', 'Post yaratish': 'Создать пост', 'Kanalni o\'chirish': 'Удалить канал', 'Orqaga': 'Назад', 'Havolali tugma qo\'shish': 'Добавить URL-кнопку', 'Postni yuborish': 'Опубликовать', 'Bekor qilish': 'Отмена', 'Ko\'k': 'Синий', 'Yashil': 'Зелёный', 'Qizil': 'Красный', 'Statistika': 'Статистика', 'Barchaga post yuborish': 'Рассылка поста', 'Majburiy obunani sozlash': 'Настроить подписку', 'Majburiy obunani o\'chirish': 'Отключить подписку', 'Kanalga obuna bo\'lish': 'Подписаться', 'Obunani tekshirish': 'Проверить подписку' },
  tr: { 'Kanal qo\'shish': 'Kanal ekle', 'Post yaratish': 'Gönderi oluştur', 'Kanalni o\'chirish': 'Kanalı sil', 'Orqaga': 'Geri', 'Havolali tugma qo\'shish': 'URL butonu ekle', 'Postni yuborish': 'Gönderiyi yayınla', 'Bekor qilish': 'İptal', 'Ko\'k': 'Mavi', 'Yashil': 'Yeşil', 'Qizil': 'Kırmızı', 'Statistika': 'İstatistik', 'Barchaga post yuborish': 'Herkese gönder', 'Majburiy obunani sozlash': 'Zorunlu abonelik', 'Majburiy obuna kanallar ro\'yxati': 'Zorunlu abonelik kanalları listesi', 'Majburiy obunani o\'chirish': 'Aboneliği kapat', 'Kanalga obuna bo\'lish': 'Kanala abone ol', 'Obunani tekshirish': 'Aboneliği kontrol et' },
  ar: { 'Kanal qo\'shish': 'إضافة قناة', 'Post yaratish': 'إنشاء منشور', 'Kanalni o\'chirish': 'حذف القناة', 'Orqaga': 'رجوع', 'Havolali tugma qo\'shish': 'إضافة زر رابط', 'Postni yuborish': 'نشر المنشور', 'Bekor qilish': 'إلغاء', 'Ko\'k': 'أزرق', 'Yashil': 'أخضر', 'Qizil': 'أحمر', 'Statistika': 'الإحصائيات', 'Barchaga post yuborish': 'إرسال للجميع', 'Majburiy obunani sozlash': 'إعداد الاشتراك', 'Majburiy obunani o\'chirish': 'تعطيل الاشتراك', 'Kanalga obuna bo\'lish': 'اشترك بالقناة', 'Obunani tekshirish': 'تحقق من الاشتراك' },
  zh: { 'Kanal qo\'shish': '添加频道', 'Post yaratish': '创建帖子', 'Kanalni o\'chirish': '删除频道', 'Orqaga': '返回', 'Havolali tugma qo\'shish': '添加链接按钮', 'Postni yuborish': '发布帖子', 'Bekor qilish': '取消', 'Ko\'k': '蓝色', 'Yashil': '绿色', 'Qizil': '红色', 'Statistika': '统计', 'Barchaga post yuborish': '广播帖子', 'Majburiy obunani sozlash': '设置强制订阅', 'Majburiy obunani o\'chirish': '关闭强制订阅', 'Kanalga obuna bo\'lish': '订阅频道', 'Obunani tekshirish': '检查订阅' },
  ko: { 'Kanal qo\'shish': '채널 추가', 'Post yaratish': '게시물 만들기', 'Kanalni o\'chirish': '채널 삭제', 'Orqaga': '뒤로', 'Havolali tugma qo\'shish': 'URL 버튼 추가', 'Postni yuborish': '게시물 게시', 'Bekor qilish': '취소', 'Ko\'k': '파란색', 'Yashil': '초록색', 'Qizil': '빨간색', 'Statistika': '통계', 'Barchaga post yuborish': '전체 방송', 'Majburiy obunani sozlash': '필수 구독 설정', 'Majburiy obunani o\'chirish': '필수 구독 해제', 'Kanalga obuna bo\'lish': '채널 구독', 'Obunani tekshirish': '구독 확인' },
  tg: { 'Kanal qo\'shish': 'Иловаи канал', 'Post yaratish': 'Эҷоди пост', 'Kanalni o\'chirish': 'Нест кардани канал', 'Orqaga': 'Бозгашт', 'Havolali tugma qo\'shish': 'Иловаи тугмаи пайванд', 'Postni yuborish': 'Нашри пост', 'Bekor qilish': 'Бекор кардан', 'Ko\'k': 'Кабуд', 'Yashil': 'Сабз', 'Qizil': 'Сурх', 'Statistika': 'Омори', 'Barchaga post yuborish': 'Ирсол ба ҳама', 'Majburiy obunani sozlash': 'Танзими обуна', 'Majburiy obunani o\'chirish': 'Хомӯш кардани обуна', 'Kanalga obuna bo\'lish': 'Обуна ба канал', 'Obunani tekshirish': 'Санҷиши обуна' }
};
function localizeReply(ctx, message) {
  return message;
}
data.settings.requiredChannels ||= [];
data.settings.premiumStarsPrice ||= 50;
data.stats = { postsSent: 0, broadcastsSent: 0 };

let mongoWriteQueue = Promise.resolve();

function saveData(userIds = [], persistConfig = true) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).map(String))];
  const write = mongoWriteQueue.then(async () => {
    const userOperations = ids
      .map((telegramId) => [telegramId, data.users[telegramId]])
      .filter(([, account]) => account)
      .map(([telegramId, account]) => {
        const { miniAppPosts, miniAppSettings, ...persistedAccount } = account;
        return {
          updateOne: {
            filter: { telegramId: Number(telegramId) },
            update: { $set: { ...persistedAccount, telegramId: Number(telegramId) } },
            upsert: true
          }
        };
      });
    if (userOperations.length) await User.bulkWrite(userOperations, { ordered: false });
    if (persistConfig) {
      await BotConfig.updateOne({ configKey: 'main_config' }, {
        $set: {
          channels: data.settings.requiredChannels || [],
          settings: data.settings,
          stats: data.stats,
        }
      }, { upsert: true });
    }
  });
  mongoWriteQueue = write.catch((error) => {
    console.error('MongoDB persistence failed:', error.message);
  });
  return write;
}

function accountFromMongo(document) {
  const account = { ...document };
  delete account._id;
  delete account.__v;
  return account;
}

async function hydrateFromMongo() {
  await mongoConnection;
  let config = await BotConfig.findOne({ configKey: 'main_config' }).lean();
  const existingUsers = await User.countDocuments();

  if (!config && existingUsers === 0 && Object.keys(legacyData.users || {}).length) {
    const legacyUsers = Object.entries(legacyData.users).map(([telegramId, account]) => ({
      updateOne: {
        filter: { telegramId: Number(telegramId) },
        update: { $set: { ...account, telegramId: Number(telegramId), joinedAt: account.joinedAt || new Date() } },
        upsert: true
      }
    }));
    await User.bulkWrite(legacyUsers, { ordered: false });
  }

  if (!config) {
    const legacySettings = legacyData.settings || {};
    if (legacySettings.requiredChannel && !Array.isArray(legacySettings.requiredChannels)) {
      legacySettings.requiredChannels = [legacySettings.requiredChannel];
    }
    config = await BotConfig.create({
      configKey: 'main_config',
      channels: legacySettings.requiredChannels || [],
      settings: legacySettings,
      stats: legacyData.stats || { postsSent: 0, broadcastsSent: 0 },
    });
    config = config.toObject();
  }

  const accounts = await User.find({}).lean();
  data.users = Object.fromEntries(accounts.map((account) => [String(account.telegramId), accountFromMongo(account)]));
  data.settings = { ...data.settings, ...(config.settings || {}) };
  data.settings.requiredChannels = config.channels?.length ? config.channels : (data.settings.requiredChannels || []);
  data.stats = { ...data.stats, ...(config.stats || {}) };
  data.settings.requiredChannels ||= [];
  data.settings.premiumStarsPrice ||= 50;
}

function userData(userId) {
  const key = String(userId);
  if (!data.users[key]) {
    const usedIds = Object.values(data.users || {})
      .map((item) => Number(item.personalId))
      .filter((id) => Number.isFinite(id));
    const nextId = usedIds.length ? Math.max(...usedIds) + 1 : 1728000;

    data.users[key] = {
      channels: [],
      language: 'uz',
      personalId: nextId,
      username: '',
      nickname: '',
      premium: false,
      postLog: [],
      templates: [],
      publishedPosts: 0,
      publishedChannels: 0,
      lastPublishedAt: null,
      postStats: [],
      profileSeen: false
    };
  }

  data.users[key].channels ||= [];
  data.users[key].language = 'uz';
  data.users[key].premium ??= false;
  data.users[key].postLog ||= [];
  data.users[key].templates ||= [];
  data.users[key].publishedPosts ||= 0;
  data.users[key].publishedChannels ||= 0;
  data.users[key].lastPublishedAt ||= null;
  data.users[key].postStats ||= [];
  data.users[key].profileSeen ??= false;

  if (!data.users[key].personalId || String(data.users[key].personalId).length !== 7) {
    const usedIds = Object.values(data.users || {})
      .map((item) => Number(item.personalId))
      .filter((id) => Number.isFinite(id));
    const nextId = usedIds.length ? Math.max(...usedIds) + 1 : 1728000;
    data.users[key].personalId = nextId;
  }

  return data.users[key];
}

function userLanguage() {
  return 'uz';
}

async function ensureUserInMongo(ctx, includeReferral = false) {
  const telegramId = Number(ctx.from.id);
  const referralValue = Number(ctx.startPayload);
  const referredBy = includeReferral && Number.isSafeInteger(referralValue) && referralValue !== telegramId
    ? referralValue
    : null;
  const update = {
    $set: {
      username: ctx.from.username || '',
      nickname: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
      language: 'uz'
    },
    $setOnInsert: {
      telegramId,
      joinedAt: new Date(),
      referredBy,
    }
  };
  const document = await User.findOneAndUpdate({ telegramId }, update, {
    upsert: true,
    returnDocument: 'after',
    setDefaultsOnInsert: true
  }).lean();
  data.users[String(telegramId)] = accountFromMongo(document);
  userData(telegramId);
  return data.users[String(telegramId)];
}

function tr(ctx, key, fallback = key) {
  return text[key]?.[userLanguage(ctx)] || text[key]?.uz || fallback;
}

function isAdmin(ctx) {
  return Number(ctx.from?.id) === ADMIN_TG_ID;
}

const menuEmojis = {
  createPost: '✍️',
  channels: '📢',
  stats: '📊',
  profile: '👤',
  premium: '💎',
  help: '❓',
  settings: '⚙️'
};

function menuButton(key, label) {
  return `${menuEmojis[key]} ${label}`;
}

function mainKeyboard(ctx) {
  const keyboard = [
    [menuButton('createPost', tr(ctx, 'createPost')), menuButton('channels', tr(ctx, 'channels'))],
    [menuButton('stats', 'Post statistikasi'), menuButton('profile', tr(ctx, 'profile'))],
    [menuButton('premium', 'Premium'), menuButton('help', 'Yordam')],
    [menuButton('settings', 'Sozlamalar')]
  ];
  if (isAdmin(ctx)) keyboard.push([tr(ctx, 'admin')]);
  return Markup.keyboard(keyboard).resize();
}

function adminKeyboard(ctx) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(localizeReply(ctx, 'Statistika'), 'admin:stats'),
      Markup.button.callback(localizeReply(ctx, 'Barchaga post yuborish'), 'admin:broadcast')
    ],
    [
      Markup.button.callback('Premium to\'lov sozlamalari', 'admin:premium_settings'),
    ],
    [Markup.button.callback(localizeReply(ctx, 'Majburiy obunani sozlash'), 'admin:subscription')],
    [Markup.button.callback(localizeReply(ctx, 'Majburiy obuna kanallar ro\'yxati'), 'admin:required_list')],
    [Markup.button.callback(localizeReply(ctx, 'Majburiy obunani o\'chirish'), 'admin:subscription_off')],
    [Markup.button.callback('Userni qidirish', 'admin:user_search')]
  ]);
}

function adminUserSearchResultKeyboard(personalId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Userga xabar yuborish', `admin:message_user:${personalId}`)],
    [Markup.button.callback('Orqaga', 'admin:user_search')]
  ]);
}

function subscriptionKeyboard(ctx, channels) {
  const requiredChannels = Array.isArray(channels) ? channels : [channels];
  return Markup.inlineKeyboard([
    ...requiredChannels.map((channel) => [Markup.button.url(
      `${localizeReply(ctx, 'Kanalga obuna bo\'lish')} ${channel.title || channel.username}`,
      `https://t.me/${channel.username.replace(/^@/, '')}`
    )]),
    [Markup.button.callback(localizeReply(ctx, 'Obunani tekshirish'), 'check_subscription')]
  ]);
}

async function statsText() {
  const totalUsers = await User.countDocuments();
  const channelResult = await User.aggregate([
    { $project: { channelCount: { $size: { $ifNull: ['$channels', []] } } } },
    { $group: { _id: null, total: { $sum: '$channelCount' } } }
  ]);
  const channels = channelResult[0]?.total || 0;
  const posts = data.stats.postsSent || 0;
  const broadcasts = data.stats.broadcastsSent || 0;
  return { uz: `Bot statistikasi\n\nBarcha foydalanuvchilar: ${totalUsers}\nBarcha kanallar: ${channels}\nYuborilgan postlar: ${posts}\nBroadcastlar: ${broadcasts}`, en: `Bot statistics\n\nAll users: ${totalUsers}\nAll channels: ${channels}\nPosts sent: ${posts}\nBroadcasts: ${broadcasts}`, ru: `Статистика бота\n\nВсе пользователи: ${totalUsers}\nВсе каналы: ${channels}\nОтправлено постов: ${posts}\nРассылки: ${broadcasts}`, tr: `Bot istatistikası\n\nTüm kullanıcılar: ${totalUsers}\nTüm kanallar: ${channels}\nGönderilen gönderiler: ${posts}\nYayınlar: ${broadcasts}`, ar: `إحصائيات البوت\n\nجميع المستخدمين: ${totalUsers}\nجميع القنوات: ${channels}\nالمنشورات المرسلة: ${posts}\nالإرسالات: ${broadcasts}`, zh: `机器人统计\n\n用户总数：${totalUsers}\n频道总数：${channels}\n已发送帖子：${posts}\n广播：${broadcasts}`, ko: `봇 통계\n\n전체 사용자: ${totalUsers}\n전체 채널: ${channels}\n보낸 게시물: ${posts}\n방송: ${broadcasts}`, tg: `Омори бот\n\nҲамаи корбарон: ${totalUsers}\nҲамаи каналҳо: ${channels}\nПостҳои фиристодашуда: ${posts}\nИрсолҳо: ${broadcasts}` };
}

async function requiredSubscription(ctx) {
  if (isAdmin(ctx)) return true;
  const channels = await getRequiredChannels();
  if (!channels.length) return true;

  const notSubscribed = [];
  for (const channel of channels) {
    try {
      const member = await ctx.telegram.getChatMember(channel.id, ctx.from.id);
      if (!['creator', 'administrator', 'member'].includes(member.status)) {
        notSubscribed.push(channel);
      }
    } catch (error) {
      console.error('Subscription check failed:', error.response?.description || error.message);
      notSubscribed.push(channel);
    }
  }

  if (!notSubscribed.length) return true;
  await ctx.reply('Botdan foydalanish uchun majburiy kanallarga obuna bo\'ling.', subscriptionKeyboard(ctx, notSubscribed));
  return false;
}

async function checkRequiredSubscriptionChannel(ctx, username) {
  const chat = await ctx.telegram.getChat(username);
  if (chat.type !== 'channel' || !chat.username) throw new Error('Public username’li kanal yuboring.');
  const botInfo = await ctx.telegram.getMe();
  const member = await ctx.telegram.getChatMember(chat.id, botInfo.id);
  if (!['creator', 'administrator'].includes(member.status)) {
    throw new Error('Bot majburiy obuna kanalida administrator bo\'lishi kerak.');
  }
  return { id: chat.id, title: chat.title || username, username: `@${chat.username}` };
}

async function getRequiredChannels() {
  const config = await BotConfig.findOne({ configKey: 'main_config' }, { channels: 1 }).lean();
  if (config?.channels) return config.channels;
  const list = Array.isArray(data.settings?.requiredChannels) ? data.settings.requiredChannels : [];
  if (data.settings?.requiredChannel && !list.some((item) => item.id === data.settings.requiredChannel.id)) {
    list.push(data.settings.requiredChannel);
  }
  return list;
}

async function formatRequiredChannelList() {
  const channels = await getRequiredChannels();
  if (!channels.length) return 'Majburiy obuna kanallari yo\'q.';
  return channels.map((channel) => `${channel.title || channel.username} (${channel.username || ''})`).join('\n');
}

async function sendBroadcastToChat(ctx, chatId, post, replyMarkup) {
  await sendPostToChat(ctx, chatId, post, replyMarkup);
}

async function broadcastPost(ctx, post) {
  const accounts = await User.find({}, { telegramId: 1, channels: 1 }).lean();
  const requiredChannels = await getRequiredChannels();
  const userIds = new Set(accounts.map((account) => String(account.telegramId)));
  const channelIds = new Set();

  for (const account of accounts) {
    for (const channel of account.channels || []) {
      if (channel?.id) channelIds.add(String(channel.id));
    }
  }

  for (const channel of requiredChannels) {
    if (channel?.id) channelIds.add(String(channel.id));
  }

  const buttons = post.finalButtons || postButtons(post);
  const replyMarkup = postReplyMarkup(buttons);
  let sent = 0;

  const channelResults = await runWithConcurrency([...channelIds], 5, async (chatId) => {
    await sendBroadcastToChat(ctx, chatId, post, replyMarkup);
    return true;
  });
  sent += channelResults.filter((result) => result.status === 'fulfilled').length;
  channelResults.filter((result) => result.status === 'rejected').forEach((result) => {
    console.error('Broadcast to channel failed:', result.reason?.response?.description || result.reason?.message);
  });

  const userResults = await runWithConcurrency([...userIds], 5, async (chatId) => {
    for (const required of requiredChannels) {
      if (!required?.id) continue;
      const member = await ctx.telegram.getChatMember(required.id, Number(chatId));
      if (!['creator', 'administrator', 'member'].includes(member.status)) return false;
    }
    await sendBroadcastToChat(ctx, chatId, post, replyMarkup);
    return true;
  });
  sent += userResults.filter((result) => result.status === 'fulfilled' && result.value).length;
  userResults.filter((result) => result.status === 'rejected').forEach((result) => {
    console.error('Broadcast to user failed:', result.reason?.response?.description || result.reason?.message);
  });

  data.stats.broadcastsSent += 1;
  data.stats.postsSent += sent;
  await saveData([], true);
  return sent;
}

async function runWithConcurrency(items, limit, task) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        results[index] = { status: 'fulfilled', value: await task(items[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function channelKeyboard(ctx, channels) {
  return Markup.inlineKeyboard([
    ...channels.map((channel) => [Markup.button.callback(`${channel.title}`, `channel:${channel.id}`)]),
    [Markup.button.callback('Bir nechta chatga yuborish', 'compose_multi')],
    [Markup.button.callback(localizeReply(ctx, 'Kanal yoki guruh ulash'), 'add_channel')]
  ]);
}

function postChannelKeyboard(ctx, channels) {
  return Markup.inlineKeyboard([
    ...channels.map((channel) => [Markup.button.callback(channel.title, `compose:${channel.id}`)]),
    [Markup.button.callback('Bir nechta chatga yuborish', 'compose_multi')],
    [Markup.button.callback(localizeReply(ctx, 'Kanal yoki guruh ulash'), 'add_channel')]
  ]);
}

function multiChannelKeyboard(ctx, channels, selectedIds = []) {
  const selected = new Set(selectedIds.map((id) => String(id)));
  return Markup.inlineKeyboard([
    ...channels.map((channel) => [Markup.button.callback(
      `${selected.has(String(channel.id)) ? '✓ ' : ''}${channel.title}`,
      `multi_channel:${channel.id}`
    )]),
    [Markup.button.callback('Chatlarni tasdiqlash', 'multi_channels_done')],
    [Markup.button.callback(localizeReply(ctx, 'Bekor qilish'), 'cancel')]
  ]);
}

function channelActions(ctx, channelId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(localizeReply(ctx, 'Post yaratish'), `compose:${channelId}`)],
    [Markup.button.callback(localizeReply(ctx, 'Chatni o\'chirish'), `remove:${channelId}`)],
    [Markup.button.callback(localizeReply(ctx, 'Orqaga'), 'channels')]
  ]);
}

function composerKeyboard(ctx) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(localizeReply(ctx, 'Havolali tugma qo\'shish'), 'add_button')],
    [Markup.button.callback('Shablon sifatida saqlash', 'save_template')],
    [Markup.button.callback('Shablonlarim', 'templates')],
    [Markup.button.callback(localizeReply(ctx, 'Preview'), 'preview')],
    [Markup.button.callback(localizeReply(ctx, 'Bekor qilish'), 'cancel')]
  ]);
}

function templateKeyboard(templates) {
  return Markup.inlineKeyboard([
    ...templates.map((template) => [Markup.button.callback(`${template.name}`, `template:${template.id}`)]),
    [Markup.button.callback('Postga qaytish', 'templates_back')]
  ]);
}

function confirmationKeyboard(ctx) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(localizeReply(ctx, 'Tasdiqlash'), 'publish')],
    [Markup.button.callback(localizeReply(ctx, 'Bekor qilish'), 'cancel')]
  ]);
}

function postButtons(post) {
  return post.buttons || [];
}

function postReplyMarkup(buttons) {
  return buttons?.length ? Markup.inlineKeyboard(buttons).reply_markup : undefined;
}

function postHasContent(post) {
  return Boolean(post?.photo || post?.media || post?.caption);
}

async function sendPostToChat(ctx, chatId, post, replyMarkup) {
  const common = { reply_markup: replyMarkup };
  if (post.photo || post.mediaType === 'photo') {
    return ctx.telegram.sendPhoto(chatId, post.photo || post.media, {
      ...common,
      caption: post.caption || undefined,
      caption_entities: post.caption ? post.captionEntities : undefined
    });
  }
  if (post.mediaType === 'video') {
    return ctx.telegram.sendVideo(chatId, post.media, {
      ...common,
      caption: post.caption || undefined,
      caption_entities: post.caption ? post.captionEntities : undefined,
      supports_streaming: true
    });
  }
  if (post.mediaType === 'animation') {
    return ctx.telegram.sendAnimation(chatId, post.media, {
      ...common,
      caption: post.caption || undefined,
      caption_entities: post.caption ? post.captionEntities : undefined
    });
  }
  if (post.mediaType === 'document') {
    return ctx.telegram.sendDocument(chatId, post.media, {
      ...common,
      caption: post.caption || undefined,
      caption_entities: post.caption ? post.captionEntities : undefined
    });
  }
  return ctx.telegram.sendMessage(chatId, post.caption || ' ', {
    ...common,
    entities: post.captionEntities || undefined
  });
}

async function sendPreview(ctx) {
  const { post } = ctx.session;
  if (!postHasContent(post)) return ctx.reply('Post ma\'lumotlari topilmadi.');
  ctx.session.previewButtons = postButtons(post);
  const replyMarkup = postReplyMarkup(ctx.session.previewButtons);
  ctx.session.step = 'confirm';
  await sendPostToChat(ctx, ctx.from.id, post, replyMarkup);
  return ctx.reply('Preview tayyor. Yuborishni tasdiqlaysizmi?', confirmationKeyboard(ctx));
}

function buttonColorKeyboard(ctx) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Ko\'k', 'button_color:blue')],
    [Markup.button.callback('Yashil', 'button_color:green')],
    [Markup.button.callback('Qizil', 'button_color:red')],
    [Markup.button.callback(localizeReply(ctx, 'Bekor qilish'), 'cancel')]
  ]);
}

function buttonPlacementKeyboard(ctx) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Yangi qatorga qo\'shish', 'button_place:new')],
    [Markup.button.callback('Shu qatorga qo\'shish', 'button_place:same')],
    [Markup.button.callback(localizeReply(ctx, 'Bekor qilish'), 'cancel')]
  ]);
}

function isUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'tg:';
  } catch {
    return false;
  }
}

function normalizeChannel(value) {
  const trimmed = value.trim();
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

function normalizePersonalId(value) {
  const input = String(value).trim();
  return input.replace(/\D/g, '');
}

async function findUserByPersonalId(id) {
  const target = String(id).trim();
  const account = await User.findOne({ personalId: Number(target) }).lean();
  if (!account) return null;
  return { key: String(account.telegramId), account: accountFromMongo(account) };
}

function buildProfileText(ctx) {
  const account = userData(ctx.from.id);
  return `Profilim\n\n` +
    `Botdagi ID: ${account.personalId}\n` +
    `Telegram ID: ${ctx.from.id}\n` +
    `Foydalanuvchi nomi: ${ctx.from.username || '—'}\n` +
    `Ism: ${ctx.from.first_name || '—'}\n` +
    `Premium holati: ${account.premium ? 'Faol' : 'Faol emas'}`;
}

async function handleStart(ctx) {
  const account = await ensureUserInMongo(ctx, true);
  account.language = 'uz';
  await User.updateOne({ telegramId: Number(ctx.from.id) }, { $set: { language: 'uz' } });
  reset(ctx);
  if (!await requiredSubscription(ctx)) return;
  return ctx.reply('Assalomu alaykum! Kanal postlarini boshqarish botiga xush kelibsiz.', {
    reply_markup: mainKeyboard(ctx)
  });
}

async function chargeForPostIfNeeded(ctx) {
  const account = userData(ctx.from.id);
  const chargedAt = Date.now();
  const windowStart = chargedAt - 24 * 60 * 60 * 1000;
  const recentLog = Array.isArray(account.postLog) ? account.postLog.filter((ts) => Number(ts) >= windowStart) : [];
  if (!account.premium && recentLog.length >= 3) {
    return { ok: false, message: 'Limit tugadi. Premium tarifni sotib oling!' };
  }
  return { ok: true, chargedAt };
}


function premiumStarsPrice() {
  const price = Number(data.settings?.premiumStarsPrice);
  return Number.isSafeInteger(price) && price > 0 ? price : 50;
}

function buildPremiumText(ctx) {
  const account = userData(ctx.from.id);
  const status = account.premium ? 'Faol' : 'Faol emas';
  const price = premiumStarsPrice();
  return `<tg-emoji emoji-id="5393396291369725822">💎</tg-emoji> Premium\n\n` +
    `<tg-emoji emoji-id="5316727448644103237">👤</tg-emoji> Premium holati: ${status}\n` +
    `<tg-emoji emoji-id="5972094476821208559">📤</tg-emoji> Post yuborish limiti: cheklanmagan\n` +
    `<tg-emoji emoji-id="5972335630644943766">📢</tg-emoji> Kanallar soni: cheklanmagan\n\n` +
    `<tg-emoji emoji-id="5470060791883374114">✍️</tg-emoji> Bir postni bir nechta kanalga yuborish\n` +
    `<tg-emoji emoji-id="5370546867786523009">📝</tg-emoji> Post shablonlarini saqlash\n` +
    `<tg-emoji emoji-id="5258108352008823107">➕</tg-emoji> Tugmalarni bir qatorga joylash\n` +
    `<tg-emoji emoji-id="5431577498364158238">📊</tg-emoji> Post statistikasi\n` +
    `<tg-emoji emoji-id="5971957540378910955">🖼</tg-emoji> Video, GIF va hujjat postlari\n\n` +
    `<tg-emoji emoji-id="5974575468974705730">💳</tg-emoji> Tarif narxi: ${price} Stars\n\n` +
    `<tg-emoji emoji-id="5393396291369725822">💎</tg-emoji> Premium olish uchun quyidagi tugmani bosing:`;
}

function premiumInlineKeyboard() {
  return Markup.inlineKeyboard([
    [{
      ...Markup.button.callback(`💎 ${premiumStarsPrice()} Stars bilan Premium olish`, 'premium_paid'),
      icon_custom_emoji_id: '5393396291369725822'
    }]
  ]);
}

function parsePremiumInvoicePayload(payload) {
  const match = /^premium_stars:v1:(\d+):(\d+):([a-f0-9-]{36})$/i.exec(String(payload || ''));
  if (!match) return null;
  const telegramId = Number(match[1]);
  const amount = Number(match[2]);
  if (!Number.isSafeInteger(telegramId) || !Number.isSafeInteger(amount) || amount <= 0) return null;
  return { telegramId, amount };
}

function createPremiumInvoicePayload(telegramId, amount) {
  return `premium_stars:v1:${telegramId}:${amount}:${crypto.randomUUID()}`;
}

async function createPremiumInvoiceLink(telegramId) {
  const amount = premiumStarsPrice();
  return bot.telegram.createInvoiceLink({
    title: 'Premium obuna',
    description: 'Post Bot Premium imkoniyatlaridan foydalaning.',
    payload: createPremiumInvoicePayload(telegramId, amount),
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: 'Premium obuna', amount }]
  });
}

function premiumStatsText(ctx) {
  const account = userData(ctx.from.id);
  if (!account.premium) return 'Post statistikasi Premium foydalanuvchilar uchun mavjud.';
  const lastPublished = account.lastPublishedAt
    ? new Date(account.lastPublishedAt).toLocaleString('uz-UZ', { timeZone: BOT_TIMEZONE })
    : 'Hali post yuborilmagan';
  return `Post statistikasi\n\n` +
    `Yuborilgan postlar: ${account.publishedPosts || 0} ta\n` +
    `Kanallarga yuborilgan nusxalar: ${account.publishedChannels || 0} ta\n` +
    `Saqlangan shablonlar: ${account.templates?.length || 0} ta\n` +
    `Saqlangan statistika yozuvlari: ${account.postStats?.length || 0} ta\n` +
    `Oxirgi post: ${lastPublished}`;
}

async function checkChannelPostingAccess(ctx, username) {
  return findPostableChannel(ctx.telegram, ctx.from.id, username);
}

function chatPickerKeyboard() {
  const channelRights = { can_manage_chat: true, can_post_messages: true };
  const groupRights = { can_manage_chat: true };
  return {
    reply_markup: {
      keyboard: [
        [{
          text: 'Kanal tanlash',
          request_chat: {
            request_id: 73101,
            chat_is_channel: true,
            user_administrator_rights: channelRights,
            bot_administrator_rights: channelRights,
            request_title: true,
            request_username: true
          }
        }],
        [{
          text: 'Guruh tanlash',
          request_chat: {
            request_id: 73102,
            chat_is_channel: false,
            user_administrator_rights: groupRights,
            bot_administrator_rights: groupRights,
            bot_is_member: true,
            request_title: true,
            request_username: true
          }
        }],
        [{ text: 'Bekor qilish' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
      input_field_placeholder: 'Ulash uchun kanal yoki guruhni tanlang'
    }
  };
}

async function showChannels(ctx) {
  const channels = userData(ctx.from.id).channels;
  if (!channels.length) {
    return ctx.reply(
      'Hozircha kanal yoki guruh ulanmagan. Boshlash uchun chatni ulang.',
      Markup.inlineKeyboard([[Markup.button.callback(tr(ctx, 'addChannel'), 'add_channel')]])
    );
  }
  return ctx.reply('Boshqarish uchun kanal yoki guruhni tanlang:', channelKeyboard(ctx, channels));
}

async function startPostCreation(ctx) {
  const channels = userData(ctx.from.id).channels;
  if (!channels.length) {
    return ctx.reply(
      'Post yaratishdan oldin kanal yoki guruhni ulang.',
      Markup.inlineKeyboard([[Markup.button.callback(tr(ctx, 'addChannel'), 'add_channel')]])
    );
  }
  return ctx.reply('Post qaysi kanal yoki guruhga yuborilsin?', postChannelKeyboard(ctx, channels));
}

function helpText(ctx) {
  const commands = [
    'Botdan foydalanish:',
    '/post — yangi post yaratish',
    '/channels — kanallarni ko\'rish va boshqarish',
    '/stats — post statistikasi',
    '/profile — profilingiz',
    '/premium — premium tarif va to\'lov',
    '/help — buyruqlar bo\'yicha yordam'
  ];
  if (isAdmin(ctx)) commands.push('/admin — admin panel');
  commands.push(
    '',
    'Post yaratish uchun kanal yoki guruhni ro‘yxatdan tanlang. Siz chat administratori, bot esa kanalga post yuborish huquqiga ega administrator bo‘lishi kerak.'
  );
  return commands.join('\n');
}

function miniAppError(res, error) {
  const status = Number(error.statusCode) || 500;
  if (status >= 500) console.error('Mini App request failed:', error);
  return res.status(status).json({
    error: status >= 500 ? 'Serverda xatolik yuz berdi.' : error.message
  });
}

app.get('/app', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(projectRoot, 'index.html'));
});

app.get('/mini-app.js', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('application/javascript');
  res.sendFile(path.join(projectRoot, 'mini-app.js'));
});

app.use('/api/mini-app', express.json({ limit: '8mb' }), (req, res, next) => {
  try {
    req.miniAppUser = verifyTelegramInitData(req.get('X-Telegram-Init-Data'), token);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Telegram orqali Mini App’ni qayta oching.' });
  }
});

app.get('/api/mini-app/bootstrap', async (req, res) => {
  try {
    const account = await User.findOne({ telegramId: req.miniAppUser.id }).lean();
    if (!account) return res.status(404).json({ error: 'Avval botda /start buyrug‘ini bosing.' });
    const channels = account.channels || [];
    return res.json({
      user: {
        id: account.telegramId,
        name: [req.miniAppUser.first_name, req.miniAppUser.last_name].filter(Boolean).join(' '),
        username: req.miniAppUser.username || '',
        personalId: account.personalId || null,
        joinedAt: account.joinedAt || null,
        premium: Boolean(account.premium)
      },
      channels,
      statistics: buildMiniAppStatistics(account, channels),
      premium: {
        active: Boolean(account.premium),
        price: premiumStarsPrice(),
        currency: 'XTR'
      },
      isAdmin: Number(req.miniAppUser.id) === ADMIN_TG_ID
    });
  } catch (error) {
    return miniAppError(res, error);
  }
});

app.get('/api/mini-app/statistics', async (req, res) => {
  try {
    const account = await getMiniAppAccount(req.miniAppUser.id);
    return res.json({ statistics: buildMiniAppStatistics(account, account.channels || []) });
  } catch (error) {
    return miniAppError(res, error);
  }
});

function reset(ctx) {
  ctx.session = {};
}

bot.use(session());

bot.use(async (ctx, next) => {
  const isStart = /^\/start(?:@\w+)?(?:\s|$)/i.test(ctx.message?.text || '');
  const isPaymentUpdate = ctx.updateType === 'pre_checkout_query' || Boolean(ctx.message?.successful_payment);
  if (ctx.from && !isStart) {
    await ensureUserInMongo(ctx);
  }

  const originalReply = ctx.reply.bind(ctx);
  ctx.reply = (message, ...args) => originalReply(localizeReply(ctx, message), ...args);
  const callbackData = ctx.callbackQuery?.data;
  if (isStart || isPaymentUpdate || callbackData === 'check_subscription' || isAdmin(ctx)) return next();

  if (await requiredSubscription(ctx)) {
    return next();
  }
});

bot.start(async (ctx) => {
  return handleStart(ctx);
});

bot.command('profile', (ctx) => ctx.reply(buildProfileText(ctx), mainKeyboard(ctx)));
bot.command('help', (ctx) => ctx.reply(helpText(ctx), mainKeyboard(ctx)));
bot.command('post', startPostCreation);
bot.command('stats', (ctx) => ctx.reply(premiumStatsText(ctx), mainKeyboard(ctx)));
bot.command('settings', (ctx) => ctx.reply('Bot faqat o‘zbek tilida ishlaydi.', mainKeyboard(ctx)));
bot.command('premium', (ctx) => ctx.reply(buildPremiumText(ctx), {
  ...premiumInlineKeyboard(),
  parse_mode: 'HTML'
}));
bot.command('admin', (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.', mainKeyboard(ctx));
  return ctx.reply('Admin panel', adminKeyboard(ctx));
});

bot.action('premium:stats', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply(premiumStatsText(ctx), premiumInlineKeyboard());
});

bot.command('channels', showChannels);

// --- ESKI MA'LUMOTLARNI YUKLAB OLISH BUYRUG'I --

bot.hears([...new Set(['Post yuborish', ...Object.values(text.createPost), ...Object.values(text.createPost).map((label) => menuButton('createPost', label))])], startPostCreation);
bot.hears([...new Set(['Kanallar ro\'yxati', ...Object.values(text.channels), ...Object.values(text.channels).map((label) => menuButton('channels', label))])], showChannels);
bot.hears(Object.values(text.addChannel), (ctx) => {
  ctx.session = { step: 'channel' };
  return ctx.reply(
    'Ulash uchun kanal yoki guruhni tanlang. Chatni ro‘yxatdan ko‘rmasangiz, public kanal username’ini yuborishingiz mumkin.',
    chatPickerKeyboard()
  );
});

bot.hears([...Object.values(text.profile), ...Object.values(text.profile).map((label) => menuButton('profile', label))], (ctx) => {
  return ctx.reply(buildProfileText(ctx), mainKeyboard(ctx));
});

bot.hears(['Sozlamalar', menuButton('settings', 'Sozlamalar')], (ctx) => ctx.reply('Bot faqat o‘zbek tilida ishlaydi.', mainKeyboard(ctx)));
bot.hears(['Yordam', menuButton('help', 'Yordam')], (ctx) => ctx.reply(helpText(ctx), mainKeyboard(ctx)));

bot.hears(['Premium', menuButton('premium', 'Premium')], (ctx) => {
  return ctx.reply(buildPremiumText(ctx), {
    ...premiumInlineKeyboard(),
    parse_mode: 'HTML'
  });
});

bot.hears(['Post statistikasi', menuButton('stats', 'Post statistikasi')], (ctx) => {
  return ctx.reply(premiumStatsText(ctx), mainKeyboard(ctx));
});

bot.hears(Object.values(text.admin), (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  return ctx.reply('Admin panel', adminKeyboard(ctx));
});

bot.action('check_subscription', async (ctx) => {
  await ctx.answerCbQuery();
  if (await requiredSubscription(ctx)) {
    return ctx.reply('Obuna tasdiqlandi. Botdan foydalanishingiz mumkin.', mainKeyboard(ctx));
  }
});

bot.action('admin:user_search', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  ctx.session = { step: 'admin_user_search' };
  return ctx.reply('Userning botdagi personal ID raqamini yuboring:', adminKeyboard(ctx));
});

bot.action(/^admin:message_user:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  const targetId = normalizePersonalId(ctx.match[1]);
  const found = await findUserByPersonalId(targetId);
  if (!found) return ctx.reply('Bunday foydalanuvchi topilmadi.', adminKeyboard(ctx));

  ctx.session = { step: 'admin_user_message', targetKey: found.key, targetPersonalId: targetId };
  return ctx.reply('Foydalanuvchiga yuboriladigan xabarni yozing:', adminKeyboard(ctx));
});

bot.action('premium_paid', async (ctx) => {
  await ctx.answerCbQuery();
  const account = await User.findOne({ telegramId: Number(ctx.from.id) }).select('premium').lean();
  if (!account) return ctx.reply('Avval botda /start buyrug‘ini bosing.', mainKeyboard(ctx));
  if (account.premium) {
    return ctx.reply('Siz allaqachon premium tarifga egasiz.', mainKeyboard(ctx));
  }
  const invoiceLink = await createPremiumInvoiceLink(ctx.from.id);
  return ctx.reply('Telegram Stars orqali Premium obunani xarid qiling:', Markup.inlineKeyboard([
    [Markup.button.url(`${premiumStarsPrice()} Stars to‘lash`, invoiceLink)]
  ]));
});

bot.on('pre_checkout_query', async (ctx) => {
  const query = ctx.preCheckoutQuery;
  const invoice = parsePremiumInvoicePayload(query.invoice_payload);
  let valid = Boolean(invoice &&
    invoice.telegramId === Number(query.from.id) &&
    query.currency === 'XTR' &&
    query.total_amount === invoice.amount);

  if (valid) {
    try {
      const account = await User.findOne({ telegramId: Number(query.from.id) }).select('premium').lean();
      valid = Boolean(account && !account.premium);
    } catch (error) {
      console.error('Premium pre-checkout validation failed:', error.response?.description || error.message);
      valid = false;
    }
  }

  await ctx.answerPreCheckoutQuery(valid, valid ? undefined : 'To‘lov tasdiqlanmadi. Premium holatini tekshirib, qayta urinib ko‘ring.');
});

bot.action('admin:stats', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  const statistics = await statsText();
  return ctx.reply(statistics[userLanguage(ctx)] || statistics.uz, adminKeyboard(ctx));
});

bot.action('admin:subscription', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  ctx.session = { step: 'required_subscription_channel' };
  return ctx.reply('Majburiy obuna kanalining public username sini yuboring, masalan: @my_channel');
});

bot.action('admin:required_list', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  return ctx.reply(await formatRequiredChannelList(), adminKeyboard(ctx));
});

bot.action('admin:subscription_off', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  data.settings.requiredChannels = [];
  data.settings.requiredChannel = undefined;
  await BotConfig.findOneAndUpdate(
    { configKey: 'main_config' },
    { $set: { channels: [], 'settings.requiredChannels': [] }, $unset: { 'settings.requiredChannel': 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  await saveData([], true);
  return ctx.reply('Majburiy obuna o\'chirildi.', adminKeyboard(ctx));
});

bot.action('admin:premium_settings', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  ctx.session = { step: 'admin_premium_settings_menu' };
  return ctx.reply('Premium Stars tarif sozlamalari:', Markup.inlineKeyboard([
    [Markup.button.callback('Stars narxini o\'zgartirish', 'admin:premium_price_edit')],
    [Markup.button.callback('Orqaga', 'admin:back')]
  ]));
});

bot.action('admin:premium_price_edit', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  ctx.session = { step: 'admin_premium_stars_price_edit' };
  return ctx.reply(`Yangi Premium narxini Stars sonida kiriting (hozirgi: ${premiumStarsPrice()} Stars).`, adminKeyboard(ctx));
});

bot.action('admin:back', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  reset(ctx);
  return ctx.reply('Admin panel', adminKeyboard(ctx));
});

bot.action('admin:broadcast', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  ctx.session = { step: 'broadcast_photo', post: { buttons: [] }, broadcast: true };
  return ctx.reply('Broadcast uchun rasm, video, GIF yoki hujjat yuboring yoki «Rasmsiz» tugmasini bosing.', Markup.inlineKeyboard([
    [Markup.button.callback('Rasmsiz', 'broadcast_no_photo')],
    [Markup.button.callback('Bekor qilish', 'cancel')]
  ]));
});

bot.action('broadcast_no_photo', async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session?.broadcast) return ctx.reply('Broadcast boshlanmagan.');
  ctx.session.step = 'broadcast_caption';
  return ctx.reply('Broadcast izohini yuboring:');
});

bot.action('channels', async (ctx) => {
  await ctx.answerCbQuery();
  return showChannels(ctx);
});

bot.action('add_channel', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session = { step: 'channel' };
  return ctx.reply(
    'Ulash uchun kanal yoki guruhni tanlang. Chatni ro‘yxatdan ko‘rmasangiz, public kanal username’ini yuborishingiz mumkin.',
    chatPickerKeyboard()
  );
});

bot.action('compose_multi', async (ctx) => {
  await ctx.answerCbQuery();
  const account = userData(ctx.from.id);
  if (!account.premium) return ctx.reply('Bu funksiya Premium foydalanuvchilar uchun mavjud.', mainKeyboard(ctx));
  if (account.channels.length < 2) return ctx.reply('Bir nechta chatga yuborish uchun kamida 2 ta chat ulang.', mainKeyboard(ctx));
  ctx.session = { step: 'multi_channel_select', selectedChannels: [] };
  return ctx.reply('Post yuboriladigan chatlarni tanlang:', multiChannelKeyboard(ctx, account.channels));
});

bot.action(/^multi_channel:(-?\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session || ctx.session.step !== 'multi_channel_select') return ctx.reply('Post yaratishni qaytadan boshlang.');
  const account = userData(ctx.from.id);
  const channel = account.channels.find((item) => String(item.id) === ctx.match[1]);
  if (!channel) return ctx.reply('Chat topilmadi.');
  const selected = new Set((ctx.session.selectedChannels || []).map((id) => String(id)));
  if (selected.has(String(channel.id))) selected.delete(String(channel.id));
  else selected.add(String(channel.id));
  ctx.session.selectedChannels = [...selected];
  return ctx.editMessageReplyMarkup(multiChannelKeyboard(ctx, account.channels, ctx.session.selectedChannels).reply_markup);
});

bot.action('multi_channels_done', async (ctx) => {
  await ctx.answerCbQuery();
  const selectedIds = ctx.session?.selectedChannels || [];
  if (!selectedIds.length) return ctx.reply('Kamida bitta chatni tanlang.');
  const channels = userData(ctx.from.id).channels.filter((channel) => selectedIds.includes(String(channel.id)));
  ctx.session = { step: 'photo', selectedChannels: channels, post: { buttons: [] } };
  return ctx.reply('Post uchun rasm, video, GIF yoki hujjat yuboring yoki «Rasmsiz» tugmasini bosing.', Markup.inlineKeyboard([
    [Markup.button.callback('Rasmsiz', 'no_photo')],
    [Markup.button.callback('Bekor qilish', 'cancel')]
  ]));
});

bot.action(/^channel:(-?\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const channel = userData(ctx.from.id).channels.find((item) => String(item.id) === ctx.match[1]);
  if (!channel) return ctx.reply('Chat topilmadi.');
  ctx.session ||= {};
  ctx.session.selectedChannel = channel;
  return ctx.reply(channel.username ? `${channel.title} (${channel.username})` : channel.title, channelActions(ctx, channel.id));
});



bot.action(/^remove:(-?\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const account = userData(ctx.from.id);
  account.channels = account.channels.filter((item) => String(item.id) !== ctx.match[1]);
  await saveData([ctx.from.id], false);
  return ctx.reply('Chat ro\'yxatdan o\'chirildi.', mainKeyboard(ctx));
});

bot.action(/^compose:(-?\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const channel = userData(ctx.from.id).channels.find((item) => String(item.id) === ctx.match[1]);
  if (!channel) return ctx.reply('Chat topilmadi.');
  ctx.session = { step: 'photo', selectedChannels: [channel], post: { buttons: [] } };
  return ctx.reply('Post uchun rasm, video, GIF yoki hujjat yuboring yoki «Rasmsiz» tugmasini bosing.', Markup.inlineKeyboard([
    [Markup.button.callback('Rasmsiz', 'no_photo')],
    [Markup.button.callback('Bekor qilish', 'cancel')]
  ]));
});

function saveComposerMedia(ctx, mediaType, mediaId, message) {
  if (!ctx.session || !['photo', 'broadcast_photo'].includes(ctx.session.step)) return null;
  ctx.session.post.mediaType = mediaType;
  ctx.session.post.media = mediaId;
  if (mediaType === 'photo') ctx.session.post.photo = mediaId;

  if (ctx.session.broadcast && message.caption !== undefined) {
    ctx.session.post.caption = message.caption;
    ctx.session.post.captionEntities = message.caption_entities || [];
    ctx.session.step = 'buttons';
    return ctx.reply('Media va izoh saqlandi. Havolali tugmalar qo\'shishingiz mumkin:', composerKeyboard(ctx));
  }
  if (ctx.session.broadcast) {
    ctx.session.step = 'broadcast_caption';
    return ctx.reply('Media saqlandi. Broadcast izohini yuboring:');
  }
  if (message.caption !== undefined) {
    ctx.session.post.caption = message.caption;
    ctx.session.post.captionEntities = message.caption_entities || [];
    ctx.session.step = 'buttons';
    return ctx.reply('Media va izoh saqlandi. Havolali tugmalar qo\'shishingiz mumkin:', composerKeyboard(ctx));
  }
  ctx.session.step = 'caption';
  return ctx.reply('Endi post izohini yuboring yoki «Izohsiz» tugmasini bosing.', Markup.inlineKeyboard([
    [Markup.button.callback('Izohsiz', 'no_caption')],
    [Markup.button.callback('Bekor qilish', 'cancel')]
  ]));
}

bot.on('photo', async (ctx) => {
  const message = ctx.message;
  return saveComposerMedia(ctx, 'photo', message.photo.at(-1).file_id, message);
});

bot.on('video', (ctx) => saveComposerMedia(ctx, 'video', ctx.message.video.file_id, ctx.message));
bot.on('animation', (ctx) => saveComposerMedia(ctx, 'animation', ctx.message.animation.file_id, ctx.message));
bot.on('document', (ctx) => saveComposerMedia(ctx, 'document', ctx.message.document.file_id, ctx.message));

bot.action('no_photo', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.step = 'caption';
  return ctx.reply('Endi post izohini yuboring yoki «Izohsiz» tugmasini bosing.', Markup.inlineKeyboard([
    [Markup.button.callback('Izohsiz', 'no_caption')],
    [Markup.button.callback('Bekor qilish', 'cancel')]
  ]));
});

bot.action('no_caption', async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session.post) return ctx.reply('Avval post yaratishni boshlang.');
  ctx.session.post.caption = '';
  ctx.session.post.captionEntities = [];
  ctx.session.step = 'buttons';
  return ctx.reply('Post tayyor. Havolali tugmalar qo\'shishingiz mumkin:', composerKeyboard(ctx));
});

bot.action('add_button', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.step = 'button_text';
  return ctx.reply('Tugma matnini yuboring:');
});

bot.action('save_template', async (ctx) => {
  await ctx.answerCbQuery();
  const post = ctx.session?.post;
  if (!postHasContent(post)) return ctx.reply('Avval post mazmunini kiriting.');
  const account = userData(ctx.from.id);
  if (!account.premium) return ctx.reply('Shablon saqlash Premium foydalanuvchilar uchun mavjud.', mainKeyboard(ctx));
  account.templates ||= [];
  account.templates.push({
    id: Date.now(),
    name: `Shablon ${account.templates.length + 1}`,
    post: JSON.parse(JSON.stringify(post)),
    createdAt: new Date()
  });
  account.templates = account.templates.slice(-20);
  await saveData([ctx.from.id], false);
  return ctx.reply('Post shablon sifatida saqlandi', composerKeyboard(ctx));
});

bot.action('templates', async (ctx) => {
  await ctx.answerCbQuery();
  const account = userData(ctx.from.id);
  if (!account.premium) return ctx.reply('Shablonlar Premium foydalanuvchilar uchun mavjud.', mainKeyboard(ctx));
  if (!account.templates?.length) return ctx.reply('Saqlangan shablonlar yo\'q.', composerKeyboard(ctx));
  return ctx.reply('Shablonni tanlang:', templateKeyboard(account.templates));
});

bot.action(/^template:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const template = userData(ctx.from.id).templates?.find((item) => String(item.id) === ctx.match[1]);
  if (!template) return ctx.reply('Shablon topilmadi.', composerKeyboard(ctx));
  ctx.session.post = JSON.parse(JSON.stringify(template.post));
  ctx.session.step = 'buttons';
  return ctx.reply('Shablon yuklandi. Uni ko\'rib chiqing yoki o\'zgartiring:', composerKeyboard(ctx));
});

bot.action('templates_back', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('Post sozlamalari:', composerKeyboard(ctx));
});

bot.action(/^button_color:(blue|green|red)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const sessionState = ctx.session || {};
  if (!sessionState.post || !sessionState.pendingButtonText || !sessionState.pendingButtonUrl) {
    return ctx.reply('Tugma ma\'lumotlari topilmadi. Qaytadan boshlang.');
  }
  sessionState.pendingButtonColor = {
    blue: 'primary',
    green: 'success',
    red: 'danger'
  }[ctx.match[1]];
  return ctx.reply('Tugma qatorini tanlang:', buttonPlacementKeyboard(ctx));
});

bot.action(/^button_place:(new|same)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const sessionState = ctx.session || {};
  if (!sessionState.post || !sessionState.pendingButtonText || !sessionState.pendingButtonUrl || !sessionState.pendingButtonColor) {
    return ctx.reply('Tugma ma\'lumotlari topilmadi. Qaytadan boshlang.');
  }

  sessionState.post.buttons ||= [];
  const button = {
    text: sessionState.pendingButtonText,
    url: sessionState.pendingButtonUrl,
    style: sessionState.pendingButtonColor
  };
  if (ctx.match[1] === 'same' && sessionState.post.buttons.length) {
    sessionState.post.buttons.at(-1).push(button);
  } else {
    sessionState.post.buttons.push([button]);
  }
  sessionState.pendingButtonText = undefined;
  sessionState.pendingButtonUrl = undefined;
  sessionState.pendingButtonColor = undefined;
  sessionState.step = 'buttons';
  return ctx.reply('Tugma qo\'shildi. Yana tugma qo\'shasizmi yoki postni yuboramizmi?', composerKeyboard(ctx));
});

bot.action('preview', async (ctx) => {
  await ctx.answerCbQuery();
  return sendPreview(ctx);
});

bot.action('publish', async (ctx) => {
  await ctx.answerCbQuery();
  const sessionState = ctx.session;
  if (sessionState.publishing) return ctx.reply('Post yuborilmoqda. Iltimos, kuting.');
  sessionState.publishing = true;

  try {
    const { selectedChannel, selectedChannels, post } = sessionState;
    if (sessionState.broadcast) {
      if (!postHasContent(post)) return ctx.reply('Broadcast mazmuni topilmadi.');
      const sent = await broadcastPost(ctx, { ...post, finalButtons: sessionState.previewButtons });
      reset(ctx);
      return ctx.reply(`Broadcast ${sent} ta chatga yuborildi.`, mainKeyboard(ctx));
    }

    const channels = selectedChannels?.length ? selectedChannels : selectedChannel ? [selectedChannel] : [];
    if (!channels.length || !postHasContent(post)) return ctx.reply('Post ma\'lumotlari topilmadi.');

    const chargeResult = await chargeForPostIfNeeded(ctx);
    if (!chargeResult.ok) return ctx.reply(chargeResult.message, mainKeyboard(ctx));

    const buttons = sessionState.previewButtons || postButtons(post);
    const replyMarkup = postReplyMarkup(buttons);
    const results = await Promise.allSettled(
      channels.map((channel) => sendPostToChat(ctx, channel.id, post, replyMarkup))
    );
    const sentChannels = channels.filter((channel, index) => results[index].status === 'fulfilled');
    for (const result of results.filter((item) => item.status === 'rejected')) {
      console.error('Post send failed:', result.reason?.response?.description || result.reason?.message);
    }
    if (!sentChannels.length) {
      const account = userData(ctx.from.id);
      account.postLog = account.postLog.filter((timestamp) => timestamp !== chargeResult.chargedAt);
      return ctx.reply('Postni hech qaysi kanalga yuborib bo\'lmadi. Kanal ruxsatlarini tekshiring.', mainKeyboard(ctx));
    }

    const publishedAt = new Date();
    const statEntry = {
      publishedAt,
      channelIds: sentChannels.map((channel) => channel.id),
      channelCount: sentChannels.length,
      mediaType: post.mediaType || (post.photo ? 'photo' : 'text')
    };
    const updatedAccount = await User.findOneAndUpdate(
      { telegramId: Number(ctx.from.id) },
      {
        $inc: { publishedPosts: 1, publishedChannels: sentChannels.length },
        $set: { lastPublishedAt: publishedAt },
        $push: {
          postStats: { $each: [statEntry], $slice: -100 },
          postLog: { $each: [chargeResult.chargedAt], $slice: -100 }
        }
      },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
    ).lean();
    data.users[String(ctx.from.id)] = accountFromMongo(updatedAccount);
    data.stats.postsSent += sentChannels.length;
    await saveData([], true);
    reset(ctx);
    return ctx.reply(`Post ${sentChannels.length} ta kanalga muvaffaqiyatli yuborildi.`, mainKeyboard(ctx));
  } finally {
    if (ctx.session === sessionState) delete sessionState.publishing;
  }
});

bot.action('cancel', async (ctx) => {
  await ctx.answerCbQuery();
  reset(ctx);
  return ctx.reply('Amal bekor qilindi', mainKeyboard(ctx));
});

bot.on('message', async (ctx, next) => {
  const payment = ctx.message.successful_payment;
  if (payment) {
    const invoice = parsePremiumInvoicePayload(payment.invoice_payload);
    const chargeId = payment.telegram_payment_charge_id;
    if (!invoice ||
      invoice.telegramId !== Number(ctx.from.id) ||
      payment.currency !== 'XTR' ||
      payment.total_amount !== invoice.amount ||
      !chargeId) {
      console.error('Invalid Premium Stars payment received:', {
        telegramId: ctx.from.id,
        currency: payment.currency,
        totalAmount: payment.total_amount,
        invoicePayload: payment.invoice_payload
      });
      return ctx.reply('To‘lovni tekshirishda muammo yuz berdi. Yordam uchun administratorga murojaat qiling.');
    }

    try {
      const account = await User.findOneAndUpdate(
        { telegramId: Number(ctx.from.id), telegramPaymentChargeIds: { $ne: chargeId } },
        {
          $set: { premium: true, premiumPurchasedAt: new Date() },
          $addToSet: { telegramPaymentChargeIds: chargeId }
        },
        { returnDocument: 'after' }
      ).lean();
      if (!account) {
        const existing = await User.findOne({ telegramId: Number(ctx.from.id) }).select('telegramPaymentChargeIds').lean();
        if (existing?.telegramPaymentChargeIds?.includes(chargeId)) {
          return ctx.reply('Bu to‘lov avval qayd etilgan.', mainKeyboard(ctx));
        }
        throw new Error('Premium payment user record was not updated.');
      }
      data.users[String(ctx.from.id)] = accountFromMongo(account);
      data.users[String(ctx.from.id)] = accountFromMongo(account);
      return ctx.reply('⭐ To‘lov muvaffaqiyatli qabul qilindi. Premium faollashtirildi.', mainKeyboard(ctx));
    } catch (error) {
      console.error('Premium Stars payment activation failed:', error.response?.description || error.message);
      await bot.telegram.sendMessage(ADMIN_TG_ID,
        `Premium Stars to‘lovi kelib tushdi, ammo faollashtirishda xatolik yuz berdi.\nFoydalanuvchi ID: ${ctx.from.id}\nTo‘lov ID: ${chargeId}`
      ).catch((notifyError) => console.error('Premium payment alert failed:', notifyError.message));
      return ctx.reply('To‘lov qabul qilindi, ammo Premium faollashtirilmadi. Administratorga murojaat qiling.');
    }
  }

  const sharedChat = ctx.message.chat_shared;
  if (!sharedChat) return next();
  if (ctx.chat?.type !== 'private' || ![73101, 73102].includes(sharedChat.request_id)) return;

  const expectedType = sharedChat.request_id === 73101 ? 'channel' : 'group';
  try {
    const channel = await findPostableChat(ctx.telegram, ctx.from.id, sharedChat.chat_id, expectedType);
    const account = userData(ctx.from.id);
    if (account.channels.some((item) => Number(item.id) === Number(channel.id))) {
      reset(ctx);
      return ctx.reply('Bu kanal yoki guruh allaqachon ulangan.', mainKeyboard(ctx));
    }
    if (!account.premium && account.channels.length >= 1) {
      reset(ctx);
      return ctx.reply('Bepul tarifda faqat bitta kanal yoki guruh ulash mumkin. Premium tarifni tanlang.', mainKeyboard(ctx));
    }
    account.channels.push(channel);
    await saveData([ctx.from.id], false);
    reset(ctx);
    return ctx.reply(`${channel.title} chat ro‘yxatingizga qo‘shildi.`, mainKeyboard(ctx));
  } catch (error) {
    reset(ctx);
    console.error('Shared chat validation failed:', error.response?.description || error.message);
    return ctx.reply(`${error.message}\n\nBot chatda administrator ekanini tekshiring va qayta tanlang.`, mainKeyboard(ctx));
  }
});

bot.on('text', async (ctx) => {
  const sessionState = ctx.session || {};
  const text = ctx.message.text;
  const trimmedText = text.trim();

  if (sessionState.step === 'admin_premium_stars_price_edit') {
    if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
    const price = Number(trimmedText);
    if (!Number.isSafeInteger(price) || price <= 0) {
      return ctx.reply('Stars narxini musbat butun son ko‘rinishida kiriting.', adminKeyboard(ctx));
    }
    data.settings.premiumStarsPrice = price;
    await saveData([], true);
    reset(ctx);
    return ctx.reply(`Premium narxi yangilandi: ${price} Stars`, adminKeyboard(ctx));
  }

  if (sessionState.step === 'required_subscription_channel') {
    if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
    try {
      const channel = await checkRequiredSubscriptionChannel(ctx, normalizeChannel(trimmedText));
      data.settings.requiredChannels ||= [];
      if (!data.settings.requiredChannels.some((item) => item.id === channel.id)) {
        data.settings.requiredChannels.push(channel);
      }
      data.settings.requiredChannel = channel;
      await BotConfig.findOneAndUpdate(
        { configKey: 'main_config' },
        { $set: { channels: data.settings.requiredChannels, 'settings.requiredChannels': data.settings.requiredChannels, 'settings.requiredChannel': channel } },
        { upsert: true, returnDocument: 'after' }
      );
      await saveData([], true);
      reset(ctx);
      return ctx.reply(`${channel.title} majburiy obuna kanali qilib sozlandi.`, adminKeyboard(ctx));
    } catch (error) {
      return ctx.reply(`${error.message}`);
    }
  }

  if (sessionState.step === 'channel') {
    if (trimmedText === 'Bekor qilish') {
      reset(ctx);
      return ctx.reply('Amal bekor qilindi.', mainKeyboard(ctx));
    }
    try {
      const channel = await checkChannelPostingAccess(ctx, normalizeChannel(trimmedText));
      const account = userData(ctx.from.id);
      if (!account.premium && account.channels.length >= 1) {
        return ctx.reply('Limit tugadi. Premium tarifni sotib oling!', mainKeyboard(ctx));
      }
      if (!account.channels.some((item) => item.id === channel.id)) account.channels.push(channel);
      await saveData([ctx.from.id], false);
      reset(ctx);
      return ctx.reply(`${channel.title} kanal ro\'yxatingizga qo\'shildi.`, mainKeyboard(ctx));
    } catch (error) {
      return ctx.reply(`${error.message}\n\nUsername ni to\'g\'ri yuboring va botga barcha admin huquqlarini bering.`);
    }
  }

  if (sessionState.step === 'caption') {
    sessionState.post.caption = text;
    sessionState.post.captionEntities = ctx.message.entities || [];
    sessionState.step = 'buttons';
    return ctx.reply('Izoh saqlandi. Havolali tugmalar qo\'shishingiz mumkin:', composerKeyboard(ctx));
  }

  if (sessionState.step === 'broadcast_caption') {
    sessionState.post.caption = text;
    sessionState.post.captionEntities = ctx.message.entities || [];
    sessionState.step = 'buttons';
    return ctx.reply('Izoh saqlandi. Havolali tugmalar qo\'shishingiz mumkin:', composerKeyboard(ctx));
  }

  if (sessionState.step === 'button_text') {
    sessionState.pendingButtonText = text;
    sessionState.step = 'button_url';
    return ctx.reply('Endi tugma havolasini yuboring (https://...):');
  }

  if (sessionState.step === 'button_url') {
    if (!isUrl(trimmedText)) return ctx.reply('Havola http:// yoki http]s:// bilan boshlanishi kerak. Qayta yuboring:');
    sessionState.pendingButtonUrl = trimmedText;
    sessionState.step = 'button_color';
    return ctx.reply('Tugma rangini tanlang:', buttonColorKeyboard(ctx));
  }

  if (sessionState.step === 'admin_user_search') {
    if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
    const target = normalizePersonalId(trimmedText);
    const found = await findUserByPersonalId(target);
    if (!found) return ctx.reply('Bunday foydalanuvchi topilmadi.', adminKeyboard(ctx));
    const account = found.account;
    const detail = `User ma\'lumotlari\n\n` +
      `Username: ${account.username || '—'}\n` +
      `Nickname: ${account.nickname || '—'}\n` +
      `Bot personal ID: ${account.personalId || '—'}\n` +
      `Telegram ID: ${found.key}\n` +
      `Premium status: ${account.premium ? 'Premium mavjud' : 'Premium yo\'q'}`;
    ctx.session = { step: 'admin_user_search_result', targetKey: found.key, targetPersonalId: account.personalId };
    return ctx.reply(detail, adminUserSearchResultKeyboard(account.personalId));
  }

  if (sessionState.step === 'admin_user_message') {
    if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
    const targetChat = Number(sessionState.targetKey);
    if (!Number.isFinite(targetChat)) return ctx.reply('Foydalanuvchi topilmadi.', adminKeyboard(ctx));

    try {
      await bot.telegram.sendMessage(targetChat, trimmedText, {
        entities: Array.isArray(ctx.message.entities) ? ctx.message.entities : undefined
      });
      reset(ctx);
      return ctx.reply('Xabar foydalanuvchiga yuborildi.', adminKeyboard(ctx));
    } catch (error) {
      console.error('Admin user direct message failed:', error.response?.description || error.message);
      reset(ctx);
      return ctx.reply('Xabar yuborishda xatolik yuz berdi. Foydalanuvchi botga start bosgan yoki chatni ochgan bo\'lishi kerak.', adminKeyboard(ctx));
    }
  }

  return ctx.reply('Kerakli amalni pastki menyudan tanlang.', mainKeyboard(ctx));
});

bot.catch((error, ctx) => {
  console.error(`Update ${ctx.updateType} failed:`, error.response?.description || error.message);
  safeAnswerCbQuery(ctx);
  if (ctx?.reply) {
    ctx.reply('Texnik xatolik yuz berdi. Keyinroq qayta urinib ko\'ring.').catch(() => {});
  }
});

async function setupBotAbout() {
  try {
    const aboutText = `Kanallar uchun tugmali postlar yaratish boti.\nБот для создания постов с кнопками для каналов.`;
    await bot.telegram.setMyShortDescription(aboutText);
    console.log("Botning 'About' qismi muvaffaqiyatli yangilandi!");
  } catch (error) {
    console.error("About qismini yangilashda xatolik yuz berdi:", error.message);
  }
}

async function setupBotCommands() {
  try {
    const commands = [
      { command: 'start', description: 'Botni boshlash' },
      { command: 'help', description: 'Buyruqlar va foydalanish bo‘yicha yordam' },
      { command: 'post', description: 'Yangi kanal posti yaratish' },
      { command: 'channels', description: 'Kanallarni ko‘rish va boshqarish' },
      { command: 'stats', description: 'Post statistikasi' },
      { command: 'profile', description: 'Profil ma’lumotlari' },
      { command: 'premium', description: 'Premium tarif va to‘lov' }
    ];
    await bot.telegram.setMyCommands(commands);
    await bot.telegram.setMyCommands(
      [...commands, { command: 'admin', description: 'Admin panel' }],
      { scope: { type: 'chat', chat_id: ADMIN_TG_ID } }
    );
  } catch (error) {
    console.error('Bot buyruqlar menyusini yangilashda xatolik:', error.response?.description || error.message);
  }
}

function miniAppStatusError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function getMiniAppAccount(telegramId) {
  const account = await User.findOne({ telegramId }).lean();
  if (!account) throw miniAppStatusError('Avval botda /start buyrug‘ini bosing.', 404);
  return account;
}

app.use('/api/mini-app/posts', (req, res) => {
  return res.status(410).json({ error: 'Mini App orqali post yuborish va rejalashtirish o‘chirilgan.' });
});

app.post('/api/mini-app/channels', async (req, res) => {
  try {
    const account = await getMiniAppAccount(req.miniAppUser.id);
    const username = normalizeChannel(String(req.body?.username || ''));
    if (!/^@[A-Za-z0-9_]{5,32}$/.test(username)) throw miniAppStatusError('Kanal username’ini @belgisi bilan kiriting.');
    const channel = await checkChannelPostingAccess({ telegram: bot.telegram, from: { id: req.miniAppUser.id } }, username);
    if ((account.channels || []).some((item) => Number(item.id) === Number(channel.id))) {
      throw miniAppStatusError('Bu kanal allaqachon qo‘shilgan.', 409);
    }
    if (!account.premium && (account.channels || []).length >= 1) {
      throw miniAppStatusError('Bepul tarifda faqat bitta kanal yoki guruh ulash mumkin. Premium tarifni tanlang.', 403);
    }
    await User.updateOne({ telegramId: account.telegramId }, { $push: { channels: channel } });
    const updated = await getMiniAppAccount(account.telegramId);
    return res.status(201).json({ channels: updated.channels });
  } catch (error) {
    return miniAppError(res, error);
  }
});

app.post('/api/mini-app/channels/select', async (req, res) => {
  try {
    const account = await getMiniAppAccount(req.miniAppUser.id);
    const chatId = Number(req.body?.chatId);
    const chatType = req.body?.chatType;
    if (!Number.isSafeInteger(chatId) || !['channel', 'group'].includes(chatType)) {
      throw miniAppStatusError('Tanlangan kanal yoki guruh ma’lumoti noto‘g‘ri.');
    }
    const channel = await findPostableChat(bot.telegram, req.miniAppUser.id, chatId, chatType);
    if ((account.channels || []).some((item) => Number(item.id) === Number(channel.id))) {
      throw miniAppStatusError('Bu kanal yoki guruh allaqachon ulangan.', 409);
    }
    if (!account.premium && (account.channels || []).length >= 1) {
      throw miniAppStatusError('Bepul tarifda faqat bitta kanal yoki guruh ulash mumkin. Premium tarifni tanlang.', 403);
    }
    await User.updateOne({ telegramId: account.telegramId }, { $push: { channels: channel } });
    const updated = await getMiniAppAccount(account.telegramId);
    return res.status(201).json({ channels: updated.channels });
  } catch (error) {
    return miniAppError(res, error);
  }
});

app.delete('/api/mini-app/channels/:channelId', async (req, res) => {
  try {
    const channelId = Number(req.params.channelId);
    if (!Number.isSafeInteger(channelId)) throw miniAppStatusError('Kanal ID noto‘g‘ri.');
    const account = await getMiniAppAccount(req.miniAppUser.id);
    const channels = account.channels || [];
    if (!channels.some((channel) => Number(channel.id) === channelId)) {
      throw miniAppStatusError('Kanal topilmadi.', 404);
    }
    const updatedChannels = channels.filter((channel) => Number(channel.id) !== channelId);
    await User.updateOne({ telegramId: account.telegramId }, { $set: { channels: updatedChannels } });
    return res.json({ channels: updatedChannels });
  } catch (error) {
    return miniAppError(res, error);
  }
});

app.post('/api/mini-app/premium/invoice', async (req, res) => {
  try {
    const account = await getMiniAppAccount(req.miniAppUser.id);
    if (account.premium) throw miniAppStatusError('Siz allaqachon Premium tarifidasiz.', 409);
    const url = await createPremiumInvoiceLink(account.telegramId);
    return res.json({ url });
  } catch (error) {
    return miniAppError(res, error);
  }
});

app.use('/api/mini-app', (error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'So‘rov JSON formati noto‘g‘ri.' });
  }
  console.error('Mini App middleware failed:', error);
  return res.status(500).json({ error: 'Serverda xatolik yuz berdi.' });
});

let pollingLeaseTimer;
let leaseRenewalRunning = false;
let shutdownRequested = false;
let shutdownPromise;

async function acquirePollingLease() {
  await BotConfig.init();
  let waitingForLease = false;

  while (!shutdownRequested) {
    const now = new Date();
    try {
      const lease = await BotConfig.findOneAndUpdate({
        configKey: POLLING_LEASE_KEY,
        $or: [
          { leaseExpiresAt: { $lte: now } },
          { leaseOwner: botInstanceId }
        ]
      }, {
        $set: {
          leaseOwner: botInstanceId,
          leaseExpiresAt: createLeaseExpiry(now.getTime())
        }
      }, {
        upsert: true,
        returnDocument: 'after'
      }).lean();

      if (lease?.leaseOwner === botInstanceId) {
        console.log('Telegram polling lease olindi.');
        return;
      }
    } catch (error) {
      if (error.code !== 11000) throw error;
    }

    if (!waitingForLease) {
      console.log('Boshqa server nusxasi Telegram update’larini qabul qilmoqda. Bu nusxa polling lease bo‘shashini kutmoqda.');
      waitingForLease = true;
    }
    const activeLease = await BotConfig.findOne(
      { configKey: POLLING_LEASE_KEY },
      { leaseExpiresAt: 1 }
    ).lean();
    const retryDelay = getLeaseRetryDelay(activeLease?.leaseExpiresAt);
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }

  throw new Error('Bot polling lease olinmasdan ishga tushirish to\'xtatildi.');
}

function renewPollingLease() {
  pollingLeaseTimer = setInterval(async () => {
    if (leaseRenewalRunning) return;
    leaseRenewalRunning = true;
    try {
      const result = await BotConfig.updateOne({
        configKey: POLLING_LEASE_KEY,
        leaseOwner: botInstanceId
      }, {
        $set: { leaseExpiresAt: createLeaseExpiry() }
      });
      if (result.matchedCount !== 1) {
        throw new Error('Bot polling lease boshqa server nusxasiga o\'tdi.');
      }
    } catch (error) {
      console.error('Bot polling lease yangilanmadi; bot to\'xtatilmoqda:', error);
      clearInterval(pollingLeaseTimer);
      bot.stop('POLLING_LEASE_LOST');
      process.exit(1);
    } finally {
      leaseRenewalRunning = false;
    }
  }, POLLING_LEASE_RENEW_INTERVAL_MS);
}

function shutdown(signal) {
  if (shutdownPromise) return shutdownPromise;
  shutdownRequested = true;
  clearInterval(pollingLeaseTimer);
  bot.stop(signal);

  shutdownPromise = (async () => {
    await new Promise((resolve) => {
      server.close((error) => {
        if (error) console.error('HTTP server shutdown failed:', error);
        resolve();
      });
    });
    try {
      const result = await BotConfig.updateOne({
        configKey: POLLING_LEASE_KEY,
        leaseOwner: botInstanceId
      }, {
        $set: { leaseExpiresAt: new Date(0) }
      });
      if (result.matchedCount) console.log('Telegram polling lease bo‘shatildi.');
    } catch (error) {
      console.error('Bot polling lease bo\'shatilmadi:', error);
    }

    await mongoose.disconnect();
  })();
  return shutdownPromise;
}

async function startBot() {
  await hydrateFromMongo();
  await acquirePollingLease();
  renewPollingLease();
  await bot.launch();
  try {
    console.log('Bot ishga tushdi.');
    await setupBotCommands();
    await setupBotAbout();
  } catch (error) {
    console.error('Bot setup failed:', error);
  }
}

startBot().catch((error) => {
  console.error('Bot startup failed:', error);
  process.exitCode = 1;
  shutdown('STARTUP_FAILED').catch((shutdownError) => {
    console.error('Bot startup cleanup failed:', shutdownError);
  });
});

process.once('SIGINT', () => shutdown('SIGINT').catch((error) => {
  console.error('Bot shutdown failed:', error);
  process.exitCode = 1;
}));
process.once('SIGTERM', () => shutdown('SIGTERM').catch((error) => {
  console.error('Bot shutdown failed:', error);
  process.exitCode = 1;
}));