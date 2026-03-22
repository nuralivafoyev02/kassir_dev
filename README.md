# Kassa Premium — Vite + Vue migratsiya

Bu loyiha original HTML/CSS/JS mini app'ni vizual o'zgartirmasdan Vite + Vue qobig'iga ko'chiradi.

## Muhim tamoyil
- UI, CSS, DOM id/class va inline eventlar saqlab qolingan.
- Legacy logika `public/app.js` ichida qoldirilgan.
- Vue faqat original DOM'ni render qiladi va legacy skriptlarni yuklaydi.
- `/api/*` endpointlar Vercel serverless va local `node server.js` uchun saqlangan.

## Ishga tushirish
```bash
npm install
npm run dev
```

yoki local bridge server bilan:

```bash
npm install
node server.js
```

## Build
```bash
npm run build
npm run preview
```

## Vercel
`vercel.json` Vite static build + `api/*.js` serverless route'larini tayyorlaydi.

## Fayl tuzilmasi
- `src/App.vue` — original HTML markup
- `public/style.css` — original CSS
- `public/app.js` — original JS logika
- `public/lang/*` — i18n fayllari
- `api/*` — serverless endpointlar
- `server.js` — local dev uchun Vite middleware + API bridge
