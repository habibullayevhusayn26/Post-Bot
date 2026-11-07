const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();
const telegramInitData = tg?.initData ||
  new URLSearchParams(window.location.hash.slice(1)).get('tgWebAppData') ||
  '';

const $ = (selector) => document.querySelector(selector);
const apiBase = '/api/mini-app';
const state = {
  channels: [],
  user: null,
  statistics: null,
  premium: null,
  isAdmin: false,
  tab: 0
};
let toastTimer;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function formatDate(value) {
  if (!value) return 'Hali post yuborilmagan';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Hali post yuborilmagan'
    : date.toLocaleString('uz-UZ', { dateStyle: 'medium', timeStyle: 'short' });
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('on'), 3000);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    tg?.setHeaderColor(theme === 'dark' ? '#000000' : '#f2f2f7');
    tg?.setBackgroundColor(theme === 'dark' ? '#000000' : '#f2f2f7');
  } catch (error) {
    console.warn('Telegram theme could not be updated:', error);
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': telegramInitData,
      ...(options.headers || {})
    }
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Server javobi noto‘g‘ri. Keyinroq qayta urinib ko‘ring.');
  }
  if (!response.ok) throw new Error(result.error || 'So‘rov bajarilmadi.');
  return result;
}

function renderStatistics() {
  const statistics = state.statistics || {};
  $('#statsSummary').innerHTML = [
    ['Yuborilgan postlar', statistics.publishedPosts || 0],
    ['Kanallarga yuborilgan nusxalar', statistics.publishedChannels || 0],
    ['Saqlangan shablonlar', statistics.templateCount || 0],
    ['Oxirgi post', formatDate(statistics.lastPublishedAt)]
  ].map(([label, value]) =>
    `<div class="row"><div class="t"><b>${esc(label)}</b></div><span class="v">${esc(value)}</span></div>`
  ).join('');

  const records = Array.isArray(statistics.records) ? statistics.records : [];
  $('#recentPosts').innerHTML = records.length
    ? records.map((record) => {
      const channelNames = (record.channels || []).map((channel) => channel.name).join(', ');
      const mediaName = record.mediaType === 'photo' ? 'Rasmli post' : 'Matnli post';
      return `<div class="row"><div class="t"><b>${esc(mediaName)}</b><small>${esc(channelNames || `${record.channelCount || 0} ta kanal`)}</small></div><span class="v">${esc(formatDate(record.publishedAt))}</span></div>`;
    }).join('')
    : '<div class="empty">Hali yuborilgan postlar statistikasi yo‘q.</div>';
}

function renderChannels() {
  $('#chs').innerHTML = state.channels.length
    ? state.channels.map((channel, index) =>
      `<div class="row"><div class="ic" style="background:${['#007aff', '#ff9500', '#34c759', '#5856d6'][index % 4]}">${esc((channel.title || 'K').slice(0, 1))}</div><div class="t"><b>${esc(channel.title || channel.username || channel.id)}</b><small>${esc(channel.username || channel.id)}</small></div><button class="v" data-remove-channel="${esc(channel.id)}" aria-label="Kanalni o‘chirish">O‘chirish</button></div>`
    ).join('')
    : '<div class="empty">Kanal ulanmagan. Kanalni ulash uchun pastdagi tugmani bosing.</div>';
}

function renderProfile() {
  const user = state.user || {};
  const profileRows = [
    ['Ism', user.name || 'Ko‘rsatilmagan'],
    ['Foydalanuvchi nomi', user.username ? `@${user.username}` : 'Ko‘rsatilmagan'],
    ['Telegram ID', user.id || '—'],
    ['Botdagi ID', user.personalId || '—'],
    ['A’zo bo‘lgan sana', formatDate(user.joinedAt)]
  ];
  if (state.isAdmin) profileRows.push(['Admin panel', 'Admin buyruqlari botdagi /admin bo‘limida.']);
  $('#profileInfo').innerHTML = profileRows.map(([label, value]) =>
    `<div class="row"><div class="t"><b>${esc(label)}</b></div><span class="v">${esc(value)}</span></div>`
  ).join('');

  const premium = state.premium || {};
  $('#premiumInfo').innerHTML = [
    ['Holat', premium.active ? 'Faol' : 'Faol emas'],
    ['Tarif narxi', `${Number(premium.price) || 10000} so‘m`],
    ['To‘lov kartasi', premium.cardNumber || '—']
  ].map(([label, value]) =>
    `<div class="row"><div class="t"><b>${esc(label)}</b></div><span class="v">${esc(value)}</span></div>`
  ).join('');
  $('#premiumRequest').hidden = Boolean(premium.active);
}

function render() {
  renderStatistics();
  renderChannels();
  renderProfile();
}

async function reload() {
  const data = await request('/bootstrap');
  state.channels = Array.isArray(data.channels) ? data.channels : [];
  state.user = data.user || {};
  state.statistics = data.statistics || {};
  state.premium = data.premium || {};
  state.isAdmin = Boolean(data.isAdmin);
  render();
}

async function refreshStatistics() {
  try {
    const data = await request('/statistics');
    state.statistics = data.statistics || {};
    renderStatistics();
    toast('Statistika yangilandi.');
  } catch (error) {
    toast(error.message);
  }
}

function tab(index, button) {
  if (index === state.tab) return;
  document.querySelectorAll('.tab').forEach((element, key) => {
    if (key === state.tab) element.style.setProperty('--x', index > state.tab ? '-28px' : '28px');
    else if (key !== index) element.style.setProperty('--x', key < index ? '-28px' : '28px');
    element.classList.toggle('on', key === index);
  });
  state.tab = index;
  document.querySelectorAll('#bar button').forEach((element) => element.classList.remove('on'));
  button.classList.add('on');
  tg?.HapticFeedback?.impactOccurred('light');
  if (index === 0) request('/statistics')
    .then(({ statistics }) => {
      state.statistics = statistics || {};
      renderStatistics();
    })
    .catch((error) => toast(error.message));
}

function showError(error) {
  const message = esc(error.message);
  $('#statsSummary').innerHTML = `<div class="empty">${message}</div>`;
  $('#recentPosts').innerHTML = `<div class="empty">${message}</div>`;
  $('#chs').innerHTML = `<div class="empty">${message}</div>`;
  $('#profileInfo').innerHTML = `<div class="empty">${message}</div>`;
  $('#premiumInfo').innerHTML = '<div class="empty">Ma’lumot yuklanmadi.</div>';
  toast(error.message);
}

function dim(value) {
  $('#dim').classList.toggle('on', value);
}

function closeAll() {
  ['#channelSheet', '#al'].forEach((selector) => $(selector).classList.remove('on'));
  dim(false);
}

function addChannel() {
  $('#channelUsername').value = '';
  dim(true);
  $('#channelSheet').classList.add('on');
  $('#channelUsername').focus();
}

async function submitChannel() {
  const username = $('#channelUsername').value.trim();
  if (!username) {
    toast('Kanal username’ini kiriting.');
    return;
  }
  try {
    const data = await request('/channels', {
      method: 'POST',
      body: JSON.stringify({ username })
    });
    state.channels = data.channels || [];
    closeAll();
    renderChannels();
    toast('Kanal muvaffaqiyatli ulandi.');
  } catch (error) {
    toast(error.message);
  }
}

function confirmAction(title, message, action) {
  $('#alT').textContent = title;
  $('#alM').textContent = message;
  $('#alY').onclick = action;
  dim(true);
  $('#al').classList.add('on');
}

function removeChannel(id) {
  confirmAction('Kanalni uzasizmi?', 'Kanal ro‘yxatingizdan o‘chiriladi.', async () => {
    try {
      const data = await request(`/channels/${encodeURIComponent(id)}`, { method: 'DELETE' });
      state.channels = data.channels || [];
      closeAll();
      renderChannels();
      toast('Kanal ro‘yxatdan o‘chirildi.');
    } catch (error) {
      closeAll();
      toast(error.message);
    }
  });
}

function chooseReceipt() {
  $('#receipt').value = '';
  $('#receipt').click();
}

async function submitReceipt() {
  const file = $('#receipt').files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png'].includes(file.type)) {
    toast('5 MB gacha bo‘lgan JPG yoki PNG to‘lov chekini tanlang.');
    return;
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    const result = await request('/premium/request', {
      method: 'POST',
      body: JSON.stringify({ photoData: btoa(binary), photoMimeType: file.type })
    });
    toast(result.message || 'To‘lov cheki adminga yuborildi.');
  } catch (error) {
    toast(error.message);
  }
}

async function downloadMedia() {
  const url = $('#mediaUrl').value.trim();
  if (!url) {
    toast('Media havolasini kiriting.');
    return;
  }
  const button = $('#mediaDownload');
  button.disabled = true;
  try {
    const result = await request('/media', {
      method: 'POST',
      body: JSON.stringify({ url })
    });
    toast(result.message || 'Media bot chatiga yuborildi.');
    $('#mediaUrl').value = '';
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

document.querySelectorAll('.tab').forEach((element, index) => {
  element.style.setProperty('--x', index ? '28px' : '0px');
});
$('#chs').addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-channel]');
  if (button) removeChannel(button.dataset.removeChannel);
});
$('#channelUsername').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') submitChannel();
});
$('#receipt').addEventListener('change', submitReceipt);

const initialTheme = localStorage.getItem('mini-app-theme') || (tg?.colorScheme === 'dark' ? 'dark' : 'light');
setTheme(initialTheme);
$('#dk').classList.toggle('on', initialTheme === 'dark');
$('#dk').addEventListener('click', () => {
  const theme = $('#dk').classList.contains('on') ? 'light' : 'dark';
  $('#dk').classList.toggle('on');
  localStorage.setItem('mini-app-theme', theme);
  setTheme(theme);
});

if (telegramInitData) {
  reload().catch(showError);
} else {
  showError(new Error('Telegram tasdiqlash ma’lumoti topilmadi. Mini App’ni bot tugmasi orqali qayta oching.'));
}
