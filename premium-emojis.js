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
  const matches = (terms) => terms.some((term) => label.includes(term));

  if (matches(['🔵', 'ko‘k', "ko'k", 'blue'])) return EMOJIS.blue;
  if (matches(['🟢', 'yashil', 'green'])) return EMOJIS.green;
  if (matches(['🔴', 'qizil', 'red'])) return EMOJIS.red;
  if (matches(['qidir', 'search', 'izlash'])) return EMOJIS.search;
  if (matches(['sozlama', 'settings', 'sozlash'])) return EMOJIS.settings;
  if (matches(['karta', 'to‘lov', "to'lov", 'payment', 'narx'])) return EMOJIS.payment;
  if (matches(['premium'])) return EMOJIS.premium;
  if (matches(['profil', 'foydalanuvchi', 'username', 'telegram id', 'botdagi id', 'user'])) return EMOJIS.user;
  if (matches(['statistik', 'statistika', 'ko‘rsatkich', "ko'rsatkich"])) return EMOJIS.stats;
  if (matches(['yordam', 'savol', 'qanday', 'help'])) return EMOJIS.help;
  if (matches(['ruxsat yo‘q', "ruxsat yo'q", 'taqiql', 'blok'])) return EMOJIS.blocked;
  if (matches(['o‘chir', "o'chir", 'delete', 'remove', 'trash'])) return EMOJIS.delete;
  if (matches(['bekor', 'cancel', 'rad et', 'rad qil', '❌'])) return EMOJIS.cancel;
  if (matches(['orqaga', 'back'])) return EMOJIS.back;
  if (matches(['havola', 'url', 'link'])) return EMOJIS.link;
  if (matches(['kanal', 'obuna', 'broadcast', 'barchaga', 'e’lon', "e'lon"])) return EMOJIS.announce;
  if (matches(['rasm', 'foto', 'image', 'photo'])) return EMOJIS.image;
  if (matches(['tasdiq', 'muvaffaqiyat', 'yuborildi', 'faol', 'tayyor', '✅'])) return EMOJIS.done;
  if (matches(['yubor', 'jo‘nat', "jo'nat", 'publish', 'send'])) return EMOJIS.send;
  if (matches(['o‘sish', "o'sish", 'o‘sish', 'growth'])) return EMOJIS.growth;
  if (matches(['maxfiy', 'lock', 'parol'])) return EMOJIS.lock;
  if (matches(['qo‘sh', "qo'sh", 'yangi', 'add'])) return EMOJIS.add;
  if (matches(['post', 'yoz', 'matn', 'izoh', 'shablon', 'caption'])) return EMOJIS.write;
  if (matches(['xabar', 'message'])) return EMOJIS.message;
  return EMOJIS.message;
}

function decorateButton(button) {
  if (typeof button === 'string') {
    return prefixButtonEmoji(button);
  }
  if (!button || typeof button !== 'object' || typeof button.text !== 'string') return button;
  const decorated = { ...button, text: prefixButtonEmoji(button.text) };
  if (CUSTOM_EMOJI_IDS.has(String(decorated.icon_custom_emoji_id))) {
    delete decorated.icon_custom_emoji_id;
  }
  return decorated;
}

function prefixButtonEmoji(text) {
  const emoji = getEmojiForText(text);
  if (Object.values(EMOJIS).some(({ emoji: knownEmoji }) => text.startsWith(knownEmoji))) {
    return text;
  }
  return `${emoji.emoji} ${text}`;
}

function decorateReplyMarkup(replyMarkup) {
  if (!replyMarkup || typeof replyMarkup !== 'object') return replyMarkup;
  const result = { ...replyMarkup };
  if (Array.isArray(result.keyboard)) {
    result.keyboard = result.keyboard.map((row) =>
      Array.isArray(row) ? row.map(decorateButton) : row
    );
  }
  if (Array.isArray(result.inline_keyboard)) {
    result.inline_keyboard = result.inline_keyboard.map((row) =>
      Array.isArray(row) ? row.map(decorateButton) : row
    );
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

  const emoji = getEmojiForText(text);
  const prefixLength = emoji.emoji.length + 1;
  if (parseMode === 'HTML') {
    if (Array.isArray(entities)) {
      payload[entityKey] = entities.map((entity) => ({ ...entity, offset: entity.offset + prefixLength }));
    }
    return `<tg-emoji emoji-id="${emoji.id}">${emoji.emoji}</tg-emoji> ${text}`;
  }
  if (parseMode === 'MarkdownV2') {
    return `![](tg://emoji?id=${emoji.id}) ${text}`;
  }
  if (parseMode) return `${emoji.emoji} ${text}`;

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
        const emoji = Object.values(EMOJIS).find(({ id }) =>
          id === String(button.icon_custom_emoji_id)
        );
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
    const tagPrefix = /^<tg-emoji emoji-id="(\d+)">([^<]+)<\/tg-emoji> /.exec(text);
    const markdownPrefix = /^!\[\]\(tg:\/\/emoji\?id=(\d+)\) /.exec(text);
    const prefix = tagPrefix || markdownPrefix;
    const hadMarkupPrefix = Boolean(prefix && CUSTOM_EMOJI_IDS.has(prefix[1]));
    if (hadMarkupPrefix) {
      const emoji = tagPrefix
        ? prefix[2]
        : Object.values(EMOJIS).find(({ id }) => id === prefix[1]).emoji;
      result[textKey] = `${emoji} ${text.slice(prefix[0].length)}`;
      changed = true;
    }

    const entities = result[entityKey];
    if (!Array.isArray(entities) || hadMarkupPrefix) continue;
    const customPrefix = entities.find((entity) =>
      entity.type === 'custom_emoji' &&
      entity.offset === 0 &&
      CUSTOM_EMOJI_IDS.has(String(entity.custom_emoji_id))
    );
    if (!customPrefix) continue;
    result[entityKey] = entities
      .filter((entity) => entity !== customPrefix);
    changed = true;
  }
  return changed ? result : null;
}

function isCustomEmojiError(error) {
  const description = String(error?.response?.description || error?.description || error?.message || '');
  return error?.response?.error_code === 400 &&
    /custom.?emoji|icon_custom_emoji_id|can't parse entities|unsupported start tag/i.test(description);
}

module.exports = {
  CUSTOM_EMOJI_IDS,
  EMOJIS,
  decorateReplyMarkup,
  decorateTelegramPayload,
  getEmojiForText,
  isCustomEmojiError,
  removePremiumEmoji
};
