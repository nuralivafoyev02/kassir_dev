# RELEASE 1.0.5

## Nimalar yaxshilandi

### 1. Bot parser va AI fallback
- `❓ Qo'llanma` matni kengaytirildi: kirim, chiqim, kimga bo'lgan chiqim, qarz berish/olish, qarz qaytishi va reja misollari qo'shildi.
- OpenAI quota yoki rate limit (`429`) bo'lsa, bot endi xatoga yiqilib qolmaydi.
- AI parser vaqtincha o'chirilib, lokal regex/parser fallback ishlaydi.

### 2. Reja / limit bo'limi
- Mini App reja statistikasi endi kategoriya nomini **normalizatsiya** qilib hisoblaydi.
- Bot orqali kiritilgan reja ko'rinmay qolishining oldini olish uchun `plan` tab ochilganda serverdan qayta sinxronlash qo'shildi.
- Realtime update dedupe qilindi: bir xil reja insert/update eventlari UI'ni takrorlab yubormaydi.
- Reja saqlangandan keyin serverdan qayta o'qilib, Mini App holati yangilanadi.

### 3. Qarzlar bo'limi
- Debt realtime update'lar dedupe qilindi.
- Debt tab ochilganda serverdan qayta refresh qilinadi.
- Mavjud UI saqlangan holda qarzlar ro'yxati va detail oqimi barqarorroq qilindi.

### 4. Bot ↔ Mini App uyg'unligi
- Mini App ichidan kiritilgan yangi kirim/chiqim endi botga ham xabar sifatida yuboriladi.
- Bot tarafdan yozilgan debt/plan ma'lumotlari Mini App'da realtime + refresh fallback orqali ko'rinadigan qilindi.

### 5. Har kunlik 09:00 reminder
- `cron-reminders` endpoint kengaytirildi.
- Endi har kuni Toshkent vaqti bilan **09:00** da foydalanuvchiga quyidagi mazmundagi eslatma yuboriladi:
  - `Assalamu aleykum bugungi xarajatlarni kiritib borishni unutmang. 24/7 xizmatingizda man!`
- Qarz reminders ham saqlab qolindi.
- Daily reminder uchun `users.daily_reminder_enabled` va `users.last_daily_reminder_at` support qo'shildi.

### 6. Hisobot eksporti: PDF + Excel
- Export oqimi endi bitta PDF bilan cheklanmaydi.
- Mini App hisobot yaratganda:
  - PDF tayyorlanadi
  - Excel ko'rinishidagi `.xls` fayl ham tayyorlanadi
- Telegram botga **ikkita alohida fayl** yuboriladi:
  1. PDF hisobot
  2. Excel hisobot
- Botga yuborish ishlamasa, telefon tomonga fallback download ishlaydi.
- Export modal matnlari ham yangilandi.

### 7. Server va API
- Dev server body parse limiti oshirildi, katta PDF payloadlarda uzilib qolmasligi uchun.

## Muhim eslatma
- Excel fayl `.xls` formatida Spreadsheet XML ko'rinishida yuboriladi; Excel va ko'p telefon office ilovalari buni ochadi.
