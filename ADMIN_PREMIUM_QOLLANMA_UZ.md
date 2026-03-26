# Admin uchun Premium berish qo'llanmasi

## Maqsad

Ushbu qo'llanma admin yangi Premium sotib olmoqchi bo'lgan foydalanuvchiga bot orqali qanday qilib Premium berishini tushuntiradi.

Amaldagi buyruqlar:

- `/subinfo <user_id>`
- `/premium <user_id> [kun]`
- `/freeplan <user_id>`

## Premium berishning standart tartibi

### 1. Foydalanuvchi `user_id` sini aniqlang

`user_id` ni quyidagi yo'llardan oling:

- `/admin` panelidagi `👥 Yangi userlar` bo'limidan
- oldingi loglardan
- foydalanuvchi bilan yozishmadagi ma'lumotlardan

### 2. Avval foydalanuvchining joriy obunasini tekshiring

Quyidagi buyruqni yuboring:

```text
/subinfo 123456789
```

Natijada bot quyidagilarni ko'rsatadi:

- user ID
- tarif
- holat
- narx
- boshlangan sana
- tugash sana

### 3. Premium bering

30 kunlik Premium berish:

```text
/premium 123456789 30
```

60 kunlik Premium berish:

```text
/premium 123456789 60
```

Agar kun ko'rsatilmasa, default qiymat `30` kun bo'ladi:

```text
/premium 123456789
```

### 4. Yana bir bor tekshiring

Premium muvaffaqiyatli berilgandan keyin qayta tekshiring:

```text
/subinfo 123456789
```

Tekshiruvda quyidagilarni tasdiqlang:

- tarif: `Premium`
- holat: `Obuna bo'lgan`
- narx: `21 999 so'm / oy`
- tugash sanasi to'g'ri qo'yilgan

## Premium olib tashlash yoki free tarifga qaytarish

Agar xatolik bo'lsa yoki user free tarifga qaytarilishi kerak bo'lsa:

```text
/freeplan 123456789
```

Keyin qayta tekshiring:

```text
/subinfo 123456789
```

## Tavsiya etilgan admin workflow

Har bir yangi Premium sotib olgan user uchun quyidagi ketma-ketlik tavsiya qilinadi:

1. To'lov tasdiqlandi
2. `user_id` aniqlandi
3. `/subinfo <user_id>` bilan hozirgi holat tekshirildi
4. `/premium <user_id> 30` berildi
5. `/subinfo <user_id>` bilan yakuniy holat tasdiqlandi

## Amaliy misol

Faraz qilaylik user ID `7894854944`.

1. Holatini tekshirish:

```text
/subinfo 7894854944
```

2. Premium berish:

```text
/premium 7894854944 30
```

3. Natijani tasdiqlash:

```text
/subinfo 7894854944
```

## Muhim eslatmalar

- Bu buyruqlar faqat adminlar uchun ishlaydi.
- Premium narxi loyihada `21 999 so'm / oy` sifatida belgilangan.
- Hozirgi `/premium` buyrug'i foydalanuvchiga Premium muddatini **hozirgi vaqtdan boshlab** beradi.
- Demak, bu buyruq yangi Premium berish uchun juda qulay.
- Agar kelajakda mavjud Premium muddatini ustiga qo'shib uzaytirish kerak bo'lsa, alohida `renew/extend` logikasi qo'shilgani ma'qul.

## Xatolik bo'lsa nima qilish kerak

### `Format` xatosi chiqsa

Buyruqni quyidagi formatda yuboring:

```text
/premium <user_id> [kun]
```

### Premium berishda xatolik chiqsa

Quyidagilarni tekshiring:

- `user_id` to'g'ri kiritilganmi
- `users` jadvalida subscription ustunlari mavjudmi
- bot kerakli DB huquqlari bilan ishlayaptimi

### Holat noto'g'ri ko'rinsa

Qayta tekshiring:

```text
/subinfo <user_id>
```

Zarurat bo'lsa:

```text
/freeplan <user_id>
```

va undan keyin Premium ni qayta bering.

## Qisqa cheat sheet

```text
/subinfo 123456789
/premium 123456789 30
/freeplan 123456789
```
