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
