# Telegram kanal post bot

## Ishga tushirish

1. Node.js 18 yoki undan yangisini o‘rnating.
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

Botga kanal username yuborishdan oldin uni kanalga administrator qilib qo‘shing va barcha administrator huquqlarini yoqing. Kanal username si public bo‘lishi kerak, masalan `@my_channel`.

## Mini App

Mini App’ni serverga deploy qilish uchun botni public HTTPS domeni ortida ishga tushiring va `.env` faylida `WEB_APP_URL` ni Mini App manziliga sozlang, masalan `https://bot.example.com/app`. `PORT` hosting taqdim etgan portga, `MONGODB_URI` esa ishlaydigan MongoDB ulanishiga mos bo‘lishi kerak. `WEB_APP_URL` HTTP bo‘lsa bot ishga tushmaydi.

Botni qayta ishga tushirgach `/start` yuboring: asosiy menyuda **Postlar Mini App** tugmasi ko‘rinadi. Mini App kanalga post yuborish va rejalashtirish, rasm hamda URL tugma qo‘shish, kanallarni boshqarish va post sozlamalarini saqlash imkonini beradi. Kanalga post yuborish uchun bot u yerda administrator bo‘lishi kerak. Mini App’ni brauzerda emas, Telegram ichidan oching.

## Asosiy buyruqlar

- `/start` — botni boshlash
- `/help` — botdan foydalanish bo‘yicha yordam
- `/post` — post yaratish va kanalni tanlash
- `/channels` — kanallarni ko‘rish va boshqarish
- `/stats` — post statistikasi
- `/profile` — profil ma’lumotlari
- `/premium` — premium tarif va to‘lov

Bot va Mini App faqat o‘zbek tilida ishlaydi; til tanlash funksiyasi mavjud emas.

Asosiy menyudagi **Post yaratish** tugmasi post yuboriladigan kanalni tanlaydi. **Kanallarim** kanal qo‘shish, kanallarni boshqarish yoki o‘chirish uchun ishlatiladi. Admin menyusi va `/admin` buyrug‘i faqat bot adminiga ko‘rinadi.

Ma’lumotlar `data.json` faylida saqlanadi. Tokenni HTML, Git yoki frontend kodiga yozmang. Siz yuborgan token chatga oshkor bo‘lganligi sababli BotFather’da `/revoke` orqali uni yangilang.

Bot bir nechta server nusxasida ishga tushsa ham, MongoDB lease orqali Telegram update’larini faqat bitta nusxa qayta ishlaydi.

Bot API 10.3 inline tugmalar uchun `primary` (ko‘k), `success` (yashil) va `danger` (qizil) stillarini qo‘llab-quvvatlaydi. Rangli tugmalar Telegram’ning yangi versiyalarida ko‘rinadi; eski klientlarda standart ko‘rinish bo‘lishi mumkin.

Har bir yuborilgan postga avtomatik ravishda random rangli `Developer` tugmasi ham qo‘shiladi va u `https://t.me/admn28` manziliga olib boradi.

`@habibullayev_28` username’li admin uchun pastki menyuda `Admin panel` ko‘rinadi. Panelda foydalanuvchilar va kanallar statistikasi, majburiy obuna kanalini sozlash hamda majburiy obunani o‘chirish mavjud. Majburiy obuna kanalida bot administrator bo‘lishi kerak.

Admin paneldagi `Barchaga post yuborish` orqali rasmni ixtiyoriy qoldirib, izoh va URL tugmalar bilan barcha ro‘yxatdagi kanallarga hamda majburiy obuna kanaliga obuna bo‘lgan foydalanuvchilarga broadcast yuborish mumkin.
