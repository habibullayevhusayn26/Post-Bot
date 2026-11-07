const assert = require('node:assert/strict');
const test = require('node:test');
const { ChannelAccessError, findPostableChannel } = require('./channel-access');

function telegramMock(userMember, botMember) {
  return {
    getChat: async () => ({ id: -1001, type: 'channel', title: 'Test kanal', username: 'test_channel' }),
    getChatMember: async (chatId, userId) => userId === 42 ? userMember : botMember,
    getMe: async () => ({ id: 7 })
  };
}

test('allows an owner to connect a channel when the bot can post', async () => {
  const channel = await findPostableChannel(
    telegramMock({ status: 'creator' }, { status: 'administrator', can_post_messages: true }),
    42,
    '@test_channel'
  );
  assert.deepEqual(channel, { id: -1001, title: 'Test kanal', username: '@test_channel' });
});

test('allows an administrator without unrelated moderation permissions', async () => {
  const channel = await findPostableChannel(
    telegramMock({ status: 'administrator' }, { status: 'administrator', can_post_messages: true }),
    42,
    '@test_channel'
  );
  assert.equal(channel.id, -1001);
});

test('rejects users who are not channel administrators', async () => {
  await assert.rejects(
    findPostableChannel(telegramMock({ status: 'member' }, { status: 'administrator', can_post_messages: true }), 42, '@test_channel'),
    (error) => error instanceof ChannelAccessError && /egasi yoki administratori/.test(error.message)
  );
});

test('rejects bots without the channel post permission', async () => {
  await assert.rejects(
    findPostableChannel(telegramMock({ status: 'creator' }, { status: 'administrator', can_post_messages: false }), 42, '@test_channel'),
    (error) => error instanceof ChannelAccessError && /post yuborish huquqini/.test(error.message)
  );
});
