# Telegram kanal post bot

## Ishga tushirish

1. Node.js 20.19 yoki undan yangisini o‘rnating.
2. Terminalda loyiha papkasiga kiring va `npm install` buyrug‘ini bajaring.
3. `.env.example` faylidan nusxa olib `.env` nomli fayl yarating:

```powershell
Copy-Item .env.example .env
```

4. `.env` ichiga BotFather bergan tokenni `BOT_TOKEN=` dan keyin yozing.
5. Botni ishga tushiring:

```powershell
npm start
```

Loyihadagi asosiy JavaScript fayllari: `app.js` (bot/server), `mini-app.js` (Mini App interfeysi) va `channel.js` (chat ruxsatlari, Mini App yordamchilari va polling lease).

Botdagi **Kanal yoki guruh ulash** tugmasi orqali chatni Telegram ro‘yxatidan tanlang. Siz chat administratori bo‘lishingiz, bot esa administrator bo‘lishi kerak; kanalda botga post yuborish huquqini bering. Ro‘yxatdan tanlash imkoni bo‘lmasa, public kanalni `@my_channel` username’i bilan ulash mumkin.

## Mini App

Mini App’ni serverga deploy qilish uchun botni public HTTPS domeni ortida ishga tushiring. Render’da `WEB_APP_URL` ko‘rsatilmagan bo‘lsa, bot `RENDER_EXTERNAL_URL` qiymatidan `/app` manzilini avtomatik hosil qiladi. Boshqa hostingda yoki alohida domen ishlatilsa, `.env` faylida `WEB_APP_URL` ni to‘liq Mini App manziliga sozlang, masalan `https://bot.example.com/app`. `PORT` hosting taqdim etgan portga, `MONGODB_URI` esa ishlaydigan MongoDB ulanishiga mos bo‘lishi kerak. `WEB_APP_URL` HTTP bo‘lsa bot ishga tushmaydi.

Yangi kod deploy bo‘lgach botga `/start` yuboring: asosiy menyuda foydalanuvchi tugmalari ko‘rinadi. Mini App’da yuborilgan postlar statistikasi, kanal va guruhlarni ulash/o‘chirish, profil, Premium to‘lovi va yordam bo‘limlari mavjud. Chat tanlash Telegram’ning `requestChat` funksiyasi bor versiyasini talab qiladi; username orqali ulash usuli faqat public kanal uchun mavjud. Mini App orqali post yaratish, yuborish yoki rejalashtirish mumkin emas; post yuborish uchun botning **Post yaratish** tugmasidan foydalaning. Admin boshqaruv buyruqlari botdagi `/admin` bo‘limida qoladi. Siz kanal yoki guruh administratori, bot esa administrator bo‘lishi kerak; kanalda botga post yuborish huquqini bering. API Telegram `initData` talab qilgani uchun Mini App’ni oddiy brauzerda emas, Telegram ichidan oching.

## Asosiy buyruqlar

- `/start` — botni boshlash
- `/help` — botdan foydalanish bo‘yicha yordam
- `/post` — post yaratish va kanalni tanlash
- `/channels` — kanal va guruhlarni ko‘rish va boshqarish
- `/stats` — post statistikasi
- `/profile` — profil ma’lumotlari
- `/premium` — premium tarif va to‘lov

Bot va Mini App faqat o‘zbek tilida ishlaydi; til tanlash funksiyasi mavjud emas.

Bot xabarlari va klaviatura tugmalarida Telegram premium custom emoji’lar ishlatiladi. Oddiy matn va izohlarga emoji HTML formatida qo‘shiladi; Telegram custom emoji’ni qabul qilmasa, bot oddiy emoji bilan qayta yuboradi. Tugmalarga Telegram Bot API’dagi `icon_custom_emoji_id` va ko‘k (`primary`), yashil (`success`), qizil (`danger`) rang uslublari qo‘llanadi. Premium custom emoji ishlashi uchun bot Fragment’dan qo‘shimcha username olgan bo‘lishi yoki bot egasi Premium obunaga ega bo‘lib, bot shaxsiy, guruh yoki superguruh chatiga yuborishi kerak.

Asosiy menyudagi **Post yaratish** tugmasi post yuboriladigan kanal yoki guruhni tanlaydi. **Kanallarim** kanal va guruhlarni ulash, boshqarish yoki o‘chirish uchun ishlatiladi. Admin menyusi va `/admin` buyrug‘i faqat bot adminiga ko‘rinadi.

Ma’lumotlar `data.json` faylida saqlanadi. Tokenni HTML, Git yoki frontend kodiga yozmang. Siz yuborgan token chatga oshkor bo‘lganligi sababli BotFather’da `/revoke` orqali uni yangilang.

Bot bir nechta server nusxasida ishga tushsa ham, MongoDB lease orqali Telegram update’larini faqat bitta nusxa qayta ishlaydi.

Bot API 10.3 inline tugmalar uchun `primary` (ko‘k), `success` (yashil) va `danger` (qizil) stillarini qo‘llab-quvvatlaydi. Rangli tugmalar Telegram’ning yangi versiyalarida ko‘rinadi; eski klientlarda standart ko‘rinish bo‘lishi mumkin.

Har bir yuborilgan postga avtomatik ravishda random rangli `Developer` tugmasi ham qo‘shiladi va u `https://t.me/admn28` manziliga olib boradi.

`@habibullayev_28` username’li admin uchun pastki menyuda `Admin panel` ko‘rinadi. Panelda foydalanuvchilar va kanallar statistikasi, majburiy obuna kanalini sozlash hamda majburiy obunani o‘chirish mavjud. Majburiy obuna kanalida bot administrator bo‘lishi kerak.

Admin paneldagi `Barchaga post yuborish` orqali rasmni ixtiyoriy qoldirib, izoh va URL tugmalar bilan barcha ro‘yxatdagi kanallarga hamda majburiy obuna kanaliga obuna bo‘lgan foydalanuvchilarga broadcast yuborish mumkin.
