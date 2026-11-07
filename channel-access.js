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

module.exports = { ChannelAccessError, findPostableChannel, findPostableChat };
