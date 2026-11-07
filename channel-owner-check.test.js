const assert = require('node:assert/strict');
const test = require('node:test');
const { ChannelAccessError, findPostableChannel, findPostableChat } = require('./channel-access');

function telegramMock(userMember, botMember, chat = { id: -1001, type: 'channel', title: 'Test kanal', username: 'test_channel' }) {
  return {
    getChat: async () => chat,
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

test('allows an owner to connect a group when the bot is an administrator', async () => {
  const group = await findPostableChat(
    telegramMock(
      { status: 'creator' },
      { status: 'administrator' },
      { id: -2001, type: 'supergroup', title: 'Test guruh' }
    ),
    42,
    -2001,
    'group'
  );
  assert.deepEqual(group, { id: -2001, title: 'Test guruh', username: '' });
});

test('rejects a selected group when its owner is not an administrator', async () => {
  await assert.rejects(
    findPostableChat(
      telegramMock(
        { status: 'member' },
        { status: 'administrator' },
        { id: -2001, type: 'group', title: 'Test guruh' }
      ),
      42,
      -2001,
      'group'
    ),
    (error) => error instanceof ChannelAccessError && /egasi yoki administratori/.test(error.message)
  );
});

test('rejects a bot that is not an administrator of the selected group', async () => {
  await assert.rejects(
    findPostableChat(
      telegramMock(
        { status: 'creator' },
        { status: 'member' },
        { id: -2001, type: 'group', title: 'Test guruh' }
      ),
      42,
      -2001,
      'group'
    ),
    (error) => error instanceof ChannelAccessError && /Bot tanlangan chatda administrator/.test(error.message)
  );
});

test('rejects a selected chat whose actual type differs from the requested type', async () => {
  await assert.rejects(
    findPostableChat(
      telegramMock(
        { status: 'creator' },
        { status: 'administrator', can_post_messages: true }
      ),
      42,
      -1001,
      'group'
    ),
    (error) => error instanceof ChannelAccessError && /guruh tanlash so‘rovida kanal/i.test(error.message)
  );
});
