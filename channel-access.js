class ChannelAccessError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ChannelAccessError';
    this.statusCode = 400;
  }
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

  let botMember;
  try {
    const bot = await telegram.getMe();
    botMember = await telegram.getChatMember(chat.id, bot.id);
  } catch {
    throw new ChannelAccessError('Botni kanalga administrator qilib qo‘shing va qayta urinib ko‘ring.');
  }
  if (!['creator', 'administrator'].includes(botMember.status)) {
    throw new ChannelAccessError('Botni kanalga administrator qilib qo‘shing va qayta urinib ko‘ring.');
  }
  if (botMember.status !== 'creator' && botMember.can_post_messages !== true) {
    throw new ChannelAccessError('Bot administratoriga post yuborish huquqini bering.');
  }

  let userMember;
  try {
    userMember = await telegram.getChatMember(chat.id, userId);
  } catch {
    throw new ChannelAccessError('Kanalni ulash uchun siz kanal egasi yoki administratori bo‘lishingiz kerak.');
  }
  if (!['creator', 'administrator'].includes(userMember.status)) {
    throw new ChannelAccessError('Kanalni ulash uchun siz kanal egasi yoki administratori bo‘lishingiz kerak.');
  }

  return {
    id: chat.id,
    title: chat.title || `@${chat.username}`,
    username: `@${chat.username}`
  };
}

module.exports = { ChannelAccessError, findPostableChannel };
