const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const botSource = fs.readFileSync('bot.js', 'utf8');
const htmlSource = fs.readFileSync('index.html', 'utf8');
const appSource = fs.readFileSync('mini-app.js', 'utf8');

test('Mini App post APIs are disabled and scheduled sends are not started', () => {
  assert.match(botSource, /app\.use\('\/api\/mini-app\/posts',[\s\S]*?status\(410\)/);
  assert.doesNotMatch(botSource, /app\.(?:post|patch|delete)\('\/api\/mini-app\/posts/);
  assert.doesNotMatch(botSource, /processScheduledMiniAppPosts|scheduledPostsTimer/);
});

test('Mini App interface only loads the non-publishing application script', () => {
  assert.match(htmlSource, /<script src="\/mini-app\.js"><\/script>/);
  assert.doesNotMatch(htmlSource, /Hozir yuborish|Yuborish vaqti|Yangi post/);
  assert.doesNotMatch(appSource, /\/posts(?:\/|['"`])/);
  assert.doesNotMatch(appSource, /function sendNow|function sched|function save\(/);
});

test('Mini App is not exposed as a bot keyboard button or slash command', () => {
  assert.doesNotMatch(botSource, /Markup\.button\.webApp|miniAppKeyboard/);
  assert.doesNotMatch(botSource, /bot\.command\('app'|command: 'app'/);
});

test('media download feature is removed from the bot and Mini App', () => {
  assert.doesNotMatch(botSource, /Video saqlash|media_url|downloadWithYtDlp|sendMediaFromUrl|\/api\/mini-app\/media/);
  assert.doesNotMatch(htmlSource, /Media saqlash|mediaUrl|mediaDownload/);
  assert.doesNotMatch(appSource, /downloadMedia|\/media(?:['"`])/);
});

test('bot offers Telegram channel and group selection and validates shared chats', () => {
  assert.match(botSource, /request_chat:\s*\{[\s\S]*?chat_is_channel:\s*true/);
  assert.match(botSource, /request_chat:\s*\{[\s\S]*?chat_is_channel:\s*false/);
  assert.match(botSource, /bot\.on\('message',[\s\S]*?ctx\.message\.chat_shared/);
  assert.match(botSource, /findPostableChat\(ctx\.telegram,\s*ctx\.from\.id,\s*sharedChat\.chat_id,\s*expectedType\)/);
});

test('Mini App requests channel or group selection and verifies it on the server', () => {
  assert.match(appSource, /tg\.requestChat/);
  assert.match(appSource, /\/channels\/select/);
  assert.match(botSource, /app\.post\('\/api\/mini-app\/channels\/select'/);
  assert.match(botSource, /findPostableChat\(bot\.telegram,\s*req\.miniAppUser\.id,\s*chatId,\s*chatType\)/);
});
