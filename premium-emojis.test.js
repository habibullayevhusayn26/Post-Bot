const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const botSource = fs.readFileSync('bot.js', 'utf8');
const helperStart = botSource.indexOf('const EMOJIS = Object.freeze({');
const helperEnd = botSource.indexOf('\nconst token = process.env.BOT_TOKEN;', helperStart);
assert.notEqual(helperStart, -1, 'emoji implementation must remain in bot.js');
assert.notEqual(helperEnd, -1, 'emoji implementation must be before bot startup');
const helperModule = { exports: {} };
vm.runInNewContext(
  `${botSource.slice(helperStart, helperEnd)}\nmodule.exports = { EMOJIS, decorateReplyMarkup, decorateTelegramPayload, getEmojiForText, isButtonStyleError, isCustomEmojiError, removeButtonStyles, removePremiumEmoji };`,
  { module: helperModule }
);
const {
  EMOJIS,
  decorateReplyMarkup,
  decorateTelegramPayload,
  getEmojiForText,
  isButtonStyleError,
  isCustomEmojiError,
  removeButtonStyles,
  removePremiumEmoji
} = helperModule.exports;

test('maps each supplied premium emoji to its Telegram custom emoji ID', () => {
  assert.equal(Object.keys(EMOJIS).length, 27);
  assert.equal(EMOJIS.phone.id, '5407025283456835913');
  assert.equal(EMOJIS.message.id, '5393314064220843793');
});

test('chooses a matching emoji for Uzbek labels and falls back to a message emoji', () => {
  assert.equal(getEmojiForText('Statistika').id, EMOJIS.stats.id);
  assert.equal(getEmojiForText('Kanal qo‘shish').id, EMOJIS.announce.id);
  assert.equal(getEmojiForText('Yangi').id, EMOJIS.add.id);
  assert.equal(getEmojiForText('Noma’lum amal').id, EMOJIS.message.id);
});

test('adds premium emoji icons and Telegram button colors to inline and reply keyboards', () => {
  const decorated = decorateReplyMarkup({
    inline_keyboard: [[{ text: 'Postni tasdiqlash', callback_data: 'publish' }]],
    keyboard: [[
      '✍️ Post yaratish',
      '📢 Kanallarim',
      '📊 Post statistikasi',
      '👤 Profilim',
      '💎 Premium',
      '❓ Yordam',
      '⚙️ Sozlamalar'
    ]]
  });

  assert.equal(decorated.inline_keyboard[0][0].text, 'Postni tasdiqlash');
  assert.equal(decorated.inline_keyboard[0][0].icon_custom_emoji_id, EMOJIS.done.id);
  assert.equal(decorated.inline_keyboard[0][0].style, 'success');
  assert.equal(decorated.keyboard[0][0].text, 'Post yaratish');
  assert.equal(decorated.keyboard[0][0].icon_custom_emoji_id, EMOJIS.write.id);
  assert.equal(decorated.keyboard[0][0].style, 'success');
  assert.equal(decorated.keyboard[0][1].icon_custom_emoji_id, EMOJIS.announce.id);
  assert.equal(decorated.keyboard[0][1].style, 'primary');
  assert.equal(decorated.keyboard[0][2].icon_custom_emoji_id, EMOJIS.stats.id);
  assert.equal(decorated.keyboard[0][2].style, 'primary');
  assert.equal(decorated.keyboard[0][3].icon_custom_emoji_id, EMOJIS.user.id);
  assert.equal(decorated.keyboard[0][3].style, 'primary');
  assert.equal(decorated.keyboard[0][4].icon_custom_emoji_id, EMOJIS.premium.id);
  assert.equal(decorated.keyboard[0][4].style, 'success');
  assert.equal(decorated.keyboard[0][5].icon_custom_emoji_id, EMOJIS.help.id);
  assert.equal(decorated.keyboard[0][5].style, 'primary');
  assert.equal(decorated.keyboard[0][6].icon_custom_emoji_id, EMOJIS.settings.id);
  assert.equal(decorated.keyboard[0][6].style, 'primary');
});

test('maps destructive and user-selected button colors to Telegram styles', () => {
  const decorated = decorateReplyMarkup({
    inline_keyboard: [[
      { text: '❌ Bekor qilish', callback_data: 'cancel' },
      { text: 'Yashil', callback_data: 'green', style: 'success' },
      { text: 'Saqlash', callback_data: 'save', style: 'danger' }
    ]]
  });

  assert.equal(decorated.inline_keyboard[0][0].text, 'Bekor qilish');
  assert.equal(decorated.inline_keyboard[0][0].icon_custom_emoji_id, EMOJIS.cancel.id);
  assert.equal(decorated.inline_keyboard[0][0].style, 'danger');
  assert.equal(decorated.inline_keyboard[0][1].style, 'success');
  assert.equal(decorated.inline_keyboard[0][2].style, 'danger');
});

test('prefixes plain text with a custom emoji entity and shifts existing entity offsets', () => {
  const decorated = decorateTelegramPayload('sendMessage', {
    text: 'Statistika tayyor',
    entities: [{ type: 'bold', offset: 0, length: 10 }]
  });

  assert.equal(decorated.text, '📊 Statistika tayyor');
  assert.deepEqual(JSON.parse(JSON.stringify(decorated.entities)), [
    { type: 'custom_emoji', offset: 0, length: 2, custom_emoji_id: EMOJIS.stats.id },
    { type: 'bold', offset: 3, length: 10 }
  ]);
});

test('formats plain outgoing messages as HTML and escapes message text', () => {
  const decorated = decorateTelegramPayload('sendMessage', {
    text: 'Matn <maxsus> & oddiy'
  });

  assert.equal(decorated.parse_mode, 'HTML');
  assert.equal(
    decorated.text,
    `<tg-emoji emoji-id="${EMOJIS.write.id}">✍️</tg-emoji> Matn &lt;maxsus&gt; &amp; oddiy`
  );
  assert.equal(removePremiumEmoji(decorated).text, '✍️ Matn &lt;maxsus&gt; &amp; oddiy');
});

test('adds premium emoji to a regular greeting message sent by the bot', () => {
  const decorated = decorateTelegramPayload('sendMessage', {
    text: 'Assalomu alaykum! Kanal postlarini boshqarish botiga xush kelibsiz.'
  });

  assert.equal(decorated.parse_mode, 'HTML');
  assert.match(decorated.text, /^<tg-emoji emoji-id="\d+">📢<\/tg-emoji> /);
});

test('bot sends every Telegram payload through the in-file emoji decorator', () => {
  assert.match(botSource, /const decoratedPayload = decorateTelegramPayload\(method, payload\)/);
});

test('prefixes HTML captions without changing HTML parse mode', () => {
  const decorated = decorateTelegramPayload('sendPhoto', {
    caption: '<b>Post matni</b>',
    parse_mode: 'HTML'
  });

  assert.equal(
    decorated.caption,
    `<tg-emoji emoji-id="${EMOJIS.write.id}">✍️</tg-emoji> <b>Post matni</b>`
  );
  assert.equal(decorated.parse_mode, 'HTML');
  assert.equal(removePremiumEmoji(decorated).caption, '✍️ <b>Post matni</b>');
});

test('removes generated premium emoji metadata for an API-compatible retry', () => {
  const decorated = decorateTelegramPayload('sendMessage', {
    text: 'Statistika tayyor',
    entities: [{ type: 'bold', offset: 0, length: 10 }],
    reply_markup: { inline_keyboard: [[{ text: 'Statistika', callback_data: 'stats' }]] }
  });
  const fallback = removePremiumEmoji(decorated);

  assert.equal(fallback.text, '📊 Statistika tayyor');
  assert.deepEqual(JSON.parse(JSON.stringify(fallback.entities)), [{ type: 'bold', offset: 3, length: 10 }]);
  assert.equal(fallback.reply_markup.inline_keyboard[0][0].icon_custom_emoji_id, undefined);
});

test('keeps visible standard emoji labels without relying on premium button icons', () => {
  const decorated = decorateTelegramPayload('sendMessage', {
    text: 'Menyu',
    reply_markup: {
      keyboard: [['Profilim']],
      inline_keyboard: [[{ text: 'Statistika', callback_data: 'stats' }]]
    }
  });
  const fallback = removePremiumEmoji(decorated);

  assert.equal(fallback.reply_markup.keyboard[0][0].text, '👤 Profilim');
  assert.equal(fallback.reply_markup.keyboard[0][0].style, 'primary');
  assert.equal(fallback.reply_markup.inline_keyboard[0][0].text, '📊 Statistika');
  assert.equal(fallback.reply_markup.inline_keyboard[0][0].style, 'primary');
  assert.equal(fallback.reply_markup.inline_keyboard[0][0].icon_custom_emoji_id, undefined);
});

test('removes unsupported button styles while preserving button text and callbacks', () => {
  const decorated = decorateTelegramPayload('sendMessage', {
    text: 'Menyu',
    reply_markup: {
      keyboard: [['Profilim']],
      inline_keyboard: [[{ text: 'Bekor qilish', callback_data: 'cancel' }]]
    }
  });
  const compatible = removeButtonStyles(removePremiumEmoji(decorated));

  assert.equal(compatible.reply_markup.keyboard[0][0].text, '👤 Profilim');
  assert.equal(compatible.reply_markup.keyboard[0][0].style, undefined);
  assert.equal(compatible.reply_markup.inline_keyboard[0][0].text, '❌ Bekor qilish');
  assert.equal(compatible.reply_markup.inline_keyboard[0][0].callback_data, 'cancel');
  assert.equal(compatible.reply_markup.inline_keyboard[0][0].style, undefined);
});

test('recognizes Telegram errors caused by unavailable custom emoji', () => {
  assert.equal(isCustomEmojiError({ response: { error_code: 400, description: 'icon_custom_emoji_id is invalid' } }), true);
  assert.equal(isCustomEmojiError({ response: { error_code: 403, description: 'icon_custom_emoji_id is invalid' } }), false);
  assert.equal(isCustomEmojiError({ response: { error_code: 400, description: 'chat not found' } }), false);
});

test('recognizes unsupported Telegram keyboard styles for compatibility fallback', () => {
  assert.equal(isButtonStyleError({ response: { error_code: 400, description: 'BUTTON_STYLE_INVALID' } }), true);
  assert.equal(isButtonStyleError({ response: { error_code: 400, description: 'Bad Request: can\'t parse inline keyboard button' } }), true);
  assert.equal(isButtonStyleError({ response: { error_code: 400, description: 'chat not found' } }), false);
});
