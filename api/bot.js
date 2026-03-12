const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { OpenAI } = require('openai');

const token = process.env.BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const creatorChatId = Number(process.env.BOT_CREATOR_CHAT_ID || 0);
const adminIds = (process.env.BOT_ADMIN_IDS || `${creatorChatId || ''}`)
  .split(',')
  .map((id) => Number(String(id).trim()))
  .filter(Boolean);
const webAppUrl = process.env.WEBAPP_URL || '';
const paymentCardText = process.env.PAYMENT_CARD_TEXT || 'Karta rekvizitlarini shu yerga yozing';
const paymentContact = process.env.PAYMENT_CONTACT || '@username';
const webhookSecret = process.env.BOT_WEBHOOK_SECRET || '';

if (!token) {
  throw new Error('BOT_TOKEN is required');
}
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const TELEGRAM_API_BASE = `https://api.telegram.org/bot${token}`;
const TELEGRAM_FILE_BASE = `https://api.telegram.org/file/bot${token}`;
const TELEGRAM_TIMEOUT_MS = Number(process.env.TELEGRAM_TIMEOUT_MS || 30000);

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function normalizeError(error) {
  if (!error) return { message: 'Unknown error' };
  if (typeof error === 'string') return { message: error };
  return {
    message: error.message || 'Unknown error',
    code: error.code,
    status: error.status,
    details: error.details,
    hint: error.hint,
    response: error.response?.data || null,
    stack: error.stack || null
  };
}

function truncate(text = '', max = 3500) {
  const str = String(text || '');
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

async function callTelegram(method, payload = {}) {
  const url = `${TELEGRAM_API_BASE}/${method}`;
  try {
    const { data } = await axios.post(url, payload, {
      timeout: TELEGRAM_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' }
    });
    if (!data?.ok) {
      const err = new Error(data?.description || `Telegram API xatoligi: ${method}`);
      err.response = { data };
      throw err;
    }
    return data.result;
  } catch (error) {
    error.telegram_method = method;
    throw error;
  }
}

const bot = {
  sendMessage(chatId, text, options = {}) {
    return callTelegram('sendMessage', { chat_id: chatId, text, ...options });
  },
  sendPhoto(chatId, photo, options = {}) {
    return callTelegram('sendPhoto', { chat_id: chatId, photo, ...options });
  },
  answerCallbackQuery(callbackQueryId, options = {}) {
    return callTelegram('answerCallbackQuery', { callback_query_id: callbackQueryId, ...options });
  },
  editMessageText(text, options = {}) {
    return callTelegram('editMessageText', { text, ...options });
  },
  editMessageReplyMarkup(replyMarkup, options = {}) {
    return callTelegram('editMessageReplyMarkup', {
      reply_markup: replyMarkup,
      ...options
    });
  },
  deleteMessage(chatId, messageId) {
    return callTelegram('deleteMessage', { chat_id: chatId, message_id: messageId });
  },
  async getFileLink(fileId) {
    const result = await callTelegram('getFile', { file_id: fileId });
    if (!result?.file_path) throw new Error("Telegram fayl yo'li topilmadi");
    return `${TELEGRAM_FILE_BASE}/${result.file_path}`;
  }
};

async function notifyAdminError(scope, error, extra = {}) {
  const payload = { scope, error: normalizeError(error), extra };
  console.error(`[BOT:${scope}]`, payload);
  if (!creatorChatId) return;
  try {
    await bot.sendMessage(creatorChatId, [
      '⚠️ <b>Bot xatoligi</b>',
      `🧩 <b>Bo'lim:</b> ${escapeHtml(scope)}`,
      `📝 <b>Xabar:</b> ${escapeHtml(payload.error.message || 'Unknown error')}`,
      payload.error.code ? `🔢 <b>Code:</b> ${escapeHtml(String(payload.error.code))}` : null,
      payload.error.status ? `📡 <b>Status:</b> ${escapeHtml(String(payload.error.status))}` : null,
      extra && Object.keys(extra).length ? `📦 <b>Extra:</b> <code>${escapeHtml(truncate(JSON.stringify(extra)))}</code>` : null
    ].filter(Boolean).join('\n'), { parse_mode: 'HTML' });
  } catch (notifyError) {
    console.error('notifyAdminError failed:', notifyError.message);
  }
}

function getUpdateChatId(update) {
  return update?.message?.chat?.id || update?.callback_query?.message?.chat?.id || null;
}

async function safeUserError(chatId, title, error) {
  if (!chatId) return;
  const info = normalizeError(error);
  try {
    await bot.sendMessage(chatId, `⚠️ ${title}

${truncate(info.message || "Noma'lum xatolik", 700)}`);
  } catch (sendErr) {
    console.error('safeUserError failed:', sendErr.message);
  }
}

const GUIDE_TEXT = [
  '<b>📖 BOTDAN FOYDALANISH QO\'LLANMASI</b>',
  '',
  'Botga yozing yoki premium bo\'lsangiz ovozli xabar yuboring. 🎙',
  '',
  '<b>Chiqim:</b>',
  '➖ <i>50 ming tushlik</i>',
  '➖ <i>-50$ bozorlik</i>',
  '',
  '<b>Kirim:</b>',
  '➕ <i>2 mln oylik</i>',
  '➕ <i>100 dollar bonus</i>',
  '',
  '<b>Premium:</b>',
  '💎 Ovozli kiritish',
  '📈 Chuqur analitika',
  '🧠 AI izohlar va premium hisobotlar'
].join('\n');

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isAdmin(userId) {
  return adminIds.includes(Number(userId));
}

function getMainKeyboard(isPremium = false) {
  const keyboard = [
    ['📊 Bugungi Hisobot', '📅 Oylik Hisobot'],
    ['↩️ Oxirgisini O\'chirish', '📖 Qo\'llanma'],
    [isPremium ? '📈 Premium Analitika' : '💎 Premium']
  ];

  if (webAppUrl) {
    keyboard.push([{ text: '📱 Kassa App', web_app: { url: webAppUrl } }]);
  }

  return {
    keyboard,
    resize_keyboard: true,
    is_persistent: true
  };
}

function getPremiumStatus(user) {
  if (!user) return { active: false, until: null };
  if (user.premium_status !== 'premium') return { active: false, until: user.premium_until || null };
  if (!user.premium_until) return { active: true, until: null };
  const until = new Date(user.premium_until);
  return { active: until.getTime() > Date.now(), until: user.premium_until };
}

function formatPremiumUntil(until) {
  if (!until) return 'Cheklanmagan';
  const date = new Date(until);
  if (Number.isNaN(date.getTime())) return "Noma'lum sana";
  return date.toLocaleDateString('uz-UZ');
}

function normalizeDuration(days) {
  const d = Number(days || 0);
  if (d % 30 === 0 && d >= 30) return `${d / 30} oy`;
  if (d % 7 === 0 && d >= 7) return `${d / 7} hafta`;
  return `${d} kun`;
}

function parseAmount(rawNumber, suffix) {
  let amount = parseFloat(String(rawNumber).replace(',', '.'));
  if (Number.isNaN(amount)) return null;
  const normalizedSuffix = (suffix || '').toLowerCase();
  if (['k', 'ming'].includes(normalizedSuffix)) amount *= 1000;
  if (['m', 'mln', 'million'].includes(normalizedSuffix)) amount *= 1000000;
  return Math.round(amount);
}

function parseText(text) {
  if (!text || typeof text !== 'string') return null;
  const original = text.trim();
  const lower = original.toLowerCase();
  const isUSD = /\$|\busd\b|dollar/.test(lower);
  const numberMatch = lower.match(/([+-]?\d+[.,]?\d*)\s*(k|ming|mln|m|million)?\b/);
  if (!numberMatch) return null;

  const amount = parseAmount(numberMatch[1], numberMatch[2]);
  if (!amount) return null;

  const incomeKeywords = ['+', 'kirim', 'tushdi', 'keldi', 'avans', 'oylik', 'bonus', 'qaytdi', 'foyda', 'topdim', 'oldim'];
  const expenseKeywords = ['-', 'chiqim', 'ketdi', 'toladim', 'to\'ladim', 'to\'landi', 'xarajat', 'berdim', 'sotib', 'sarfladim', 'taksi', 'bozorlik'];

  let type = 'expense';
  if (incomeKeywords.some((word) => lower.includes(word))) type = 'income';
  if (/^\s*-/.test(lower)) type = 'expense';

  let category = original
    .replace(numberMatch[0], ' ')
    .replace(/so'?m|sum|uzs|usd|dollar|\$/gi, ' ')
    .replace(/[+\-*/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (category.length < 2) {
    category = type === 'income' ? 'Kirim' : 'Umumiy xarajat';
  }

  category = category.charAt(0).toUpperCase() + category.slice(1);
  return { amount, type, category, isUSD, rawText: original };
}

async function getUser(userId) {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .single();
  return data || null;
}

async function upsertUserFromTelegram(msg) {
  if (!msg?.from) return null;
  const payload = {
    user_id: msg.from.id,
    chat_id: msg.chat?.id || msg.from.id,
    username: msg.from.username || null,
    full_name: [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ').trim() || msg.from.username || `User ${msg.from.id}`,
    language_code: msg.from.language_code || 'uz',
    last_seen_at: new Date().toISOString()
  };

  await supabase.from('users').upsert(payload, { onConflict: 'user_id' });
  return getUser(msg.from.id);
}

async function ensureDefaultCategories(userId) {
  const { data: categories } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  if (categories && categories.length > 0) return;

  const defaultIncome = [
    { name: 'Oylik', icon: 'banknote', type: 'income' },
    { name: 'Bonus', icon: 'gift', type: 'income' },
    { name: 'Sotuv', icon: 'shopping-bag', type: 'income' }
  ];

  const defaultExpense = [
    { name: 'Oziq-ovqat', icon: 'shopping-cart', type: 'expense' },
    { name: 'Transport', icon: 'bus', type: 'expense' },
    { name: 'Kafe', icon: 'coffee', type: 'expense' }
  ];

  const all = [...defaultIncome, ...defaultExpense].map((item) => ({ ...item, user_id: userId }));
  await supabase.from('categories').insert(all);
}

async function sendMainMenu(chatId, user, extraText) {
  const premium = getPremiumStatus(user).active;
  const text = extraText || `Assalomu alaykum, <b>${escapeHtml(user?.full_name || 'Foydalanuvchi')}</b> 👋`;
  await bot.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    reply_markup: getMainKeyboard(premium)
  });
}

async function saveTransaction({ userId, chatId, parsedData, receiptUrl = null, userExchangeRate = 12850, replyMsgId = null }) {
  let finalAmount = parsedData.amount;
  let finalCategory = parsedData.category;
  let humanAmount = `${parsedData.amount.toLocaleString('uz-UZ')}`;

  if (parsedData.isUSD) {
    finalAmount = Math.round(parsedData.amount * Number(userExchangeRate || 12850));
    finalCategory = `${parsedData.category} ($${parsedData.amount})`;
    humanAmount = `${finalAmount.toLocaleString('uz-UZ')} so'm <i>($${parsedData.amount})</i>`;
  } else {
    humanAmount = `${finalAmount.toLocaleString('uz-UZ')} so'm`;
  }

  const payload = {
    user_id: userId,
    amount: finalAmount,
    category: finalCategory,
    type: parsedData.type,
    date: Date.now(),
    receipt_url: receiptUrl
  };

  const { error } = await supabase.from('transactions').insert(payload);
  if (error) {
    console.error('Transaction insert error:', error);
    await bot.sendMessage(chatId, '⚠️ Bazaga yozishda xatolik bo\'ldi. Keyinroq yana urinib ko\'ring.');
    return;
  }

  const emoji = parsedData.type === 'income' ? '🟢' : '🔴';
  const typeText = parsedData.type === 'income' ? 'Kirim' : 'Chiqim';
  const opts = { parse_mode: 'HTML' };
  if (replyMsgId) opts.reply_to_message_id = replyMsgId;

  await bot.sendMessage(
    chatId,
    [
      '✅ <b>Muvaffaqiyatli saqlandi</b>',
      '',
      `${emoji} <b>Turi:</b> ${typeText}`,
      `💰 <b>Summa:</b> ${humanAmount}`,
      `📂 <b>Kategoriya:</b> ${escapeHtml(finalCategory)}`,
      `🧾 <b>Chek:</b> ${receiptUrl ? 'Biriktirilgan' : 'Yo\'q'}`
    ].join('\n'),
    opts
  );
}

async function uploadTelegramFileToStorage(fileId, bucket = 'receipts', prefix = 'uploads') {
  const fileLink = await bot.getFileLink(fileId);
  const response = await axios({
    url: fileLink,
    method: 'GET',
    responseType: 'arraybuffer'
  });

  const fileExt = path.extname(fileLink).split('?')[0] || '.bin';
  const fileName = `${prefix}/${Date.now()}_${Math.random().toString(36).slice(2)}${fileExt}`;
  const { error } = await supabase.storage.from(bucket).upload(fileName, response.data, {
    contentType: response.headers['content-type'] || 'application/octet-stream',
    upsert: false
  });

  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return data.publicUrl;
}

async function fetchPlans() {
  const { data } = await supabase
    .from('premium_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return data || [];
}

function buildPlanKeyboard(plans) {
  return {
    inline_keyboard: [
      ...plans.map((plan) => [{
        text: `💳 ${plan.name} • ${plan.price_note || normalizeDuration(plan.duration_days)}`,
        callback_data: `premium_buy:${plan.id}`
      }]),
      [{ text: 'ℹ️ Status', callback_data: 'premium_status' }]
    ]
  };
}

async function showPremiumPlans(chatId, user) {
  const plans = await fetchPlans();
  const premiumStatus = getPremiumStatus(user);
  const lines = [
    '<b>💎 Premium obuna</b>',
    '',
    premiumStatus.active
      ? `Sizda premium faol. Amal qilish muddati: <b>${formatPremiumUntil(premiumStatus.until)}</b>`
      : 'Premium yoqilsa qo\'shimcha funksiyalar ochiladi:',
    '• Ovozli xabarni matnga aylantirish',
    '• Premium analitika',
    '• Kengroq AI yordamchi',
    '',
    '<b>To\'lov tartibi:</b>',
    `1) Rejani tanlang`,
    `2) Quyidagi rekvizitga to\'lov qiling`,
    `3) Chekni shu botga yuboring`,
    `4) Creator tasdiqlashi bilan premium yoqiladi`,
    '',
    `<b>Rekvizit:</b> <code>${escapeHtml(paymentCardText)}</code>`,
    `<b>Aloqa:</b> ${escapeHtml(paymentContact)}`
  ];

  await bot.sendMessage(chatId, lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: buildPlanKeyboard(plans)
  });
}

async function getOpenPremiumRequest(userId) {
  const { data } = await supabase
    .from('premium_payment_requests')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['awaiting_receipt', 'pending'])
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function createOrReusePremiumRequest(userId, planId) {
  const { data: plan, error: planError } = await supabase
    .from('premium_plans')
    .select('id, is_active')
    .eq('id', planId)
    .maybeSingle();

  if (planError) throw planError;
  if (!plan || !plan.is_active) throw new Error("Premium reja topilmadi yoki o'chirilgan");

  const openRequest = await getOpenPremiumRequest(userId);
  if (openRequest && Number(openRequest.plan_id) === Number(planId) && openRequest.status === 'awaiting_receipt') {
    return openRequest;
  }

  if (openRequest && openRequest.status === 'awaiting_receipt') {
    await supabase
      .from('premium_payment_requests')
      .update({ status: 'cancelled', decided_at: new Date().toISOString() })
      .eq('id', openRequest.id);
  }

  const { data, error } = await supabase
    .from('premium_payment_requests')
    .insert({
      user_id: userId,
      plan_id: planId,
      status: 'awaiting_receipt'
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function sendPremiumReceiptForReview(requestId) {
  const { data: request } = await supabase
    .from('premium_payment_requests')
    .select(`
      *,
      users:user_id (user_id, full_name, username, premium_until),
      premium_plans:plan_id (id, name, duration_days, price_note, features)
    `)
    .eq('id', requestId)
    .single();

  if (!request) return;
  if (!creatorChatId) {
    await notifyAdminError('premium.creator_chat_missing', new Error('BOT_CREATOR_CHAT_ID yoqilmagan'), { requestId });
    throw new Error('BOT_CREATOR_CHAT_ID sozlanmagan');
  }

  const caption = [
    '💳 <b>Yangi premium to\'lov so\'rovi</b>',
    '',
    `👤 <b>User:</b> ${escapeHtml(request.users?.full_name || `ID ${request.user_id}`)}`,
    request.users?.username ? `🔗 <b>Username:</b> @${escapeHtml(request.users.username)}` : null,
    `🆔 <b>User ID:</b> <code>${request.user_id}</code>`,
    `📦 <b>Reja:</b> ${escapeHtml(request.premium_plans?.name || 'Premium')}`,
    request.premium_plans?.price_note ? `💵 <b>Narx:</b> ${escapeHtml(request.premium_plans.price_note)}` : null,
    `⏱ <b>Muddat:</b> ${normalizeDuration(request.premium_plans?.duration_days || 30)}`,
    request.user_note ? `📝 <b>Izoh:</b> ${escapeHtml(request.user_note)}` : null
  ].filter(Boolean).join('\n');

  const replyMarkup = {
    inline_keyboard: [[
      { text: '✅ Tasdiqlash', callback_data: `premium_approve:${request.id}` },
      { text: '❌ Rad etish', callback_data: `premium_reject:${request.id}` }
    ]]
  };

  let adminMessage;
  if (request.receipt_url) {
    adminMessage = await bot.sendPhoto(creatorChatId, request.receipt_url, {
      caption,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    });
  } else {
    adminMessage = await bot.sendMessage(creatorChatId, caption, {
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    });
  }

  await supabase
    .from('premium_payment_requests')
    .update({ admin_message_id: adminMessage.message_id, creator_chat_id: creatorChatId })
    .eq('id', request.id);
}

async function handlePremiumReceipt(msg, user) {
  const openRequest = await getOpenPremiumRequest(user.user_id);
  if (!openRequest) return false;

  const text = msg.caption || msg.text || '';
  const likelyPremium = /premium|obuna|to\'lov|tulov|check|chek/i.test(text) || !parseText(text);
  if (!likelyPremium) return false;

  let receiptUrl = null;
  if (msg.photo?.length) {
    const photoId = msg.photo[msg.photo.length - 1].file_id;
    receiptUrl = await uploadTelegramFileToStorage(photoId, 'premium-receipts', `premium/${user.user_id}`);
  } else if (msg.document?.file_id) {
    receiptUrl = await uploadTelegramFileToStorage(msg.document.file_id, 'premium-receipts', `premium/${user.user_id}`);
  } else {
    return false;
  }

  await supabase
    .from('premium_payment_requests')
    .update({
      status: 'pending',
      receipt_url: receiptUrl,
      receipt_file_id: msg.photo?.length ? msg.photo[msg.photo.length - 1].file_id : msg.document?.file_id || null,
      user_note: text || null,
      requested_at: new Date().toISOString()
    })
    .eq('id', openRequest.id);

  await sendPremiumReceiptForReview(openRequest.id);

  await bot.sendMessage(
    msg.chat.id,
    '✅ Chekingiz creator\'ga yuborildi. Tasdiqlangach premium avtomatik yoqiladi.',
    { reply_markup: getMainKeyboard(getPremiumStatus(user).active) }
  );
  return true;
}

async function grantPremium(requestId, adminUserId) {
  const { data: request, error } = await supabase
    .from('premium_payment_requests')
    .select(`
      *,
      users:user_id (*),
      premium_plans:plan_id (*)
    `)
    .eq('id', requestId)
    .single();

  if (error || !request) throw error || new Error('Request not found');
  if (['approved', 'rejected'].includes(request.status)) return request;

  const currentUser = request.users || {};
  const now = Date.now();
  const currentUntil = currentUser.premium_until ? new Date(currentUser.premium_until).getTime() : 0;
  const base = currentUntil > now ? currentUntil : now;
  const nextUntil = new Date(base + Number(request.premium_plans?.duration_days || 30) * 86400000).toISOString();

  await supabase.from('users').update({
    premium_status: 'premium',
    premium_until: nextUntil,
    premium_source: 'manual_receipt_approval',
    premium_activated_at: new Date().toISOString(),
    premium_approved_by: adminUserId,
    updated_at: new Date().toISOString()
  }).eq('user_id', request.user_id);

  await supabase.from('premium_payment_requests').update({
    status: 'approved',
    decided_at: new Date().toISOString(),
    decided_by: adminUserId,
    premium_until_after_approval: nextUntil
  }).eq('id', requestId);

  await supabase.from('premium_subscriptions').insert({
    user_id: request.user_id,
    request_id: request.id,
    plan_id: request.plan_id,
    starts_at: new Date(base).toISOString(),
    ends_at: nextUntil,
    approved_by: adminUserId,
    status: 'active'
  });

  return { ...request, approved_until: nextUntil };
}

async function rejectPremium(requestId, adminUserId) {
  const { data: request } = await supabase
    .from('premium_payment_requests')
    .select('*')
    .eq('id', requestId)
    .single();
  if (!request || ['approved', 'rejected'].includes(request.status)) return request;

  await supabase.from('premium_payment_requests').update({
    status: 'rejected',
    decided_at: new Date().toISOString(),
    decided_by: adminUserId
  }).eq('id', requestId);

  return request;
}

async function buildReport(userId, mode) {
  const now = new Date();
  let startTime;
  let title;
  if (mode === 'today') {
    startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    title = 'BUGUNGI HISOBOT';
  } else {
    startTime = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    title = `${now.toLocaleString('uz-UZ', { month: 'long' }).toUpperCase()} OYI HISOBOTI`;
  }

  const { data: trans } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startTime);

  if (!trans || trans.length === 0) {
    return `📊 <b>${title}</b>\n\nMa'lumot topilmadi.`;
  }

  const inc = trans.filter((t) => t.type === 'income').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const exp = trans.filter((t) => t.type === 'expense').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const balance = inc - exp;

  return [
    `📊 <b>${title}</b>`,
    '',
    `📥 Kirim: <b>+${inc.toLocaleString('uz-UZ')}</b> so'm`,
    `📤 Chiqim: <b>-${exp.toLocaleString('uz-UZ')}</b> so'm`,
    '➖➖➖➖➖➖➖➖',
    `${balance >= 0 ? '🤑' : '💸'} Sof qoldiq: <b>${balance.toLocaleString('uz-UZ')} so'm</b>`
  ].join('\n');
}

async function buildPremiumAnalytics(userId) {
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const startMs = start.getTime();
  const { data: trans } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startMs)
    .order('date', { ascending: false });

  if (!trans || trans.length === 0) {
    return '📈 Oxirgi 30 kun uchun analitika topilmadi.';
  }

  const expenses = trans.filter((t) => t.type === 'expense');
  const incomes = trans.filter((t) => t.type === 'income');
  const totalExpense = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalIncome = incomes.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const avgDailyExpense = Math.round(totalExpense / 30);
  const grouped = expenses.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + Number(item.amount || 0);
    return acc;
  }, {});
  const top = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return [
    '<b>📈 Premium analitika (30 kun)</b>',
    '',
    `📥 Jami kirim: <b>${totalIncome.toLocaleString('uz-UZ')}</b> so'm`,
    `📤 Jami chiqim: <b>${totalExpense.toLocaleString('uz-UZ')}</b> so'm`,
    `📆 O'rtacha kunlik chiqim: <b>${avgDailyExpense.toLocaleString('uz-UZ')}</b> so'm`,
    '',
    '<b>Top kategoriyalar:</b>',
    ...top.map(([category, amount], index) => `${index + 1}. ${escapeHtml(category)} — <b>${amount.toLocaleString('uz-UZ')}</b> so'm`)
  ].join('\n');
}

async function deleteLastTransaction(userId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { error: deleteError } = await supabase.from('transactions').delete().eq('id', data.id).eq('user_id', userId);
  if (deleteError) throw deleteError;
  return data;
}

async function handleVoiceMessage(msg, user) {
  const premium = getPremiumStatus(user);
  if (!premium.active) {
    await bot.sendMessage(msg.chat.id, '🎙 Ovozli kiritish premium foydalanuvchilar uchun. Premium olish uchun “💎 Premium” tugmasini bosing.');
    return;
  }
  if (!openai) {
    await bot.sendMessage(msg.chat.id, '⚠️ Ovozli xizmat uchun OPENAI_API_KEY hali ulanmagan.');
    return;
  }

  const processingMsg = await bot.sendMessage(msg.chat.id, '🧐 Ovoz tahlil qilinyapti...');
  try {
    const fileLink = await bot.getFileLink(msg.voice.file_id);
    const voicePath = path.join('/tmp', `voice_${msg.voice.file_id}.ogg`);
    const writer = fs.createWriteStream(voicePath);

    const response = await axios({ url: fileLink, method: 'GET', responseType: 'stream' });
    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(voicePath),
      model: 'whisper-1',
      language: 'uz'
    });
    try { fs.unlinkSync(voicePath); } catch (e) {}

    const transcribedText = transcription?.text?.trim();
    if (!transcribedText) {
      await bot.editMessageText('Kechirasiz, ovozdan aniq matn topilmadi.', {
        chat_id: msg.chat.id,
        message_id: processingMsg.message_id
      });
      return;
    }

    const parsed = parseText(transcribedText);
    if (!parsed) {
      await bot.editMessageText(`🤷‍♂️ Tushunganim: "${transcribedText}"\n\nLekin summa yoki maqsadni topa olmadim.`, {
        chat_id: msg.chat.id,
        message_id: processingMsg.message_id
      });
      return;
    }

    await bot.deleteMessage(msg.chat.id, processingMsg.message_id).catch(() => {});
    await saveTransaction({
      userId: user.user_id,
      chatId: msg.chat.id,
      parsedData: parsed,
      userExchangeRate: user.exchange_rate || 12850,
      replyMsgId: msg.message_id
    });
  } catch (error) {
    console.error('Voice error:', error);
    await bot.editMessageText('Kechirasiz, ovozli kiritishda xatolik yuz berdi.', {
      chat_id: msg.chat.id,
      message_id: processingMsg.message_id
    });
  }
}

async function handleCallbackQuery(query) {
  const userId = query.from.id;
  const data = query.data || '';

  if (data === 'premium_status') {
    const user = await getUser(userId);
    const premium = getPremiumStatus(user);
    await bot.answerCallbackQuery(query.id, {
      text: premium.active
        ? `Premium faol. Amal qilish muddati: ${formatPremiumUntil(premium.until)}`
        : 'Premium hali faol emas.',
      show_alert: true
    });
    return;
  }

  if (data.startsWith('premium_buy:')) {
    const planId = Number(data.split(':')[1]);
    await createOrReusePremiumRequest(userId, planId);
    await bot.answerCallbackQuery(query.id, { text: 'Reja tanlandi. Endi chekni yuboring.' });
    await bot.sendMessage(query.message.chat.id, [
      '✅ Reja tanlandi.',
      '',
      `<b>To'lov rekviziti:</b> <code>${escapeHtml(paymentCardText)}</code>`,
      'Chekni rasm yoki fayl ko\'rinishida shu chatga yuboring.',
      'Captionga <b>premium</b> deb yozsangiz yanada qulay bo\'ladi.'
    ].join('\n'), { parse_mode: 'HTML' });
    return;
  }

  if (!isAdmin(userId)) {
    await bot.answerCallbackQuery(query.id, { text: 'Bu amal faqat creator uchun.', show_alert: true });
    return;
  }

  if (data.startsWith('premium_approve:')) {
    const requestId = Number(data.split(':')[1]);
    const request = await grantPremium(requestId, userId);
    await bot.answerCallbackQuery(query.id, { text: 'Premium yoqildi ✅' });
    await bot.sendMessage(request.user_id, `🎉 Premium yoqildi. Amal qilish muddati: <b>${formatPremiumUntil(request.approved_until)}</b>`, {
      parse_mode: 'HTML',
      reply_markup: getMainKeyboard(true)
    });
    if (query.message) {
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id
      }).catch(() => {});
    }
    return;
  }

  if (data.startsWith('premium_reject:')) {
    const requestId = Number(data.split(':')[1]);
    const request = await rejectPremium(requestId, userId);
    await bot.answerCallbackQuery(query.id, { text: 'So\'rov rad etildi' });
    if (request?.user_id) {
      await bot.sendMessage(request.user_id, '❌ Premium to\'lovingiz hozircha tasdiqlanmadi. Creator bilan bog\'laning yoki qayta chek yuboring.');
    }
    if (query.message) {
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id
      }).catch(() => {});
    }
  }
}

async function handleMessage(msg) {
  const text = msg.text || msg.caption || '';
  let user = await upsertUserFromTelegram(msg);
  await ensureDefaultCategories(user.user_id);

  if (msg.contact && msg.contact.user_id === user.user_id) {
    await supabase.from('users').update({ phone_number: msg.contact.phone_number }).eq('user_id', user.user_id);
    user = await getUser(user.user_id);
    await sendMainMenu(msg.chat.id, user, '🎉 Telefon raqamingiz saqlandi. Endi operatsiyalarni yuborishingiz mumkin.');
    return;
  }

  if (text === '/start' || text.startsWith('/start ')) {
    const payload = text.split(' ').slice(1).join(' ').trim();
    if (payload === 'premium') {
      await sendMainMenu(msg.chat.id, user, `Assalomu alaykum, <b>${escapeHtml(user.full_name)}</b> 👋`);
      await showPremiumPlans(msg.chat.id, user);
      return;
    }

    await sendMainMenu(msg.chat.id, user);
    await bot.sendMessage(msg.chat.id, GUIDE_TEXT, {
      parse_mode: 'HTML',
      reply_markup: getMainKeyboard(getPremiumStatus(user).active)
    });
    return;
  }

  if (text === '/help' || text === '📖 Qo\'llanma' || text === 'Botdan foydalanish❓') {
    await bot.sendMessage(msg.chat.id, GUIDE_TEXT, {
      parse_mode: 'HTML',
      reply_markup: getMainKeyboard(getPremiumStatus(user).active)
    });
    return;
  }

  if (text === '/premium' || text === '💎 Premium') {
    await showPremiumPlans(msg.chat.id, user);
    return;
  }

  if (text === '/status') {
    const premium = getPremiumStatus(user);
    await bot.sendMessage(msg.chat.id, premium.active
      ? `💎 Premium faol. Amal qilish muddati: ${formatPremiumUntil(premium.until)}`
      : 'Siz hozir free tarifdasiz.');
    return;
  }

  if (text === '📊 Bugungi Hisobot' || text === '/today') {
    const report = await buildReport(user.user_id, 'today');
    await bot.sendMessage(msg.chat.id, report, { parse_mode: 'HTML' });
    return;
  }

  if (text === '📅 Oylik Hisobot' || text === '/month') {
    const report = await buildReport(user.user_id, 'month');
    await bot.sendMessage(msg.chat.id, report, { parse_mode: 'HTML' });
    return;
  }

  if (text === '📈 Premium Analitika' || text === '/analytics') {
    const premium = getPremiumStatus(user);
    if (!premium.active) {
      await bot.sendMessage(msg.chat.id, '📈 Bu funksiya premium foydalanuvchilar uchun. “💎 Premium” tugmasini bosing.');
      return;
    }
    const analytics = await buildPremiumAnalytics(user.user_id);
    await bot.sendMessage(msg.chat.id, analytics, { parse_mode: 'HTML' });
    return;
  }

  if (text === "↩️ Oxirgisini O'chirish" || text === '/undo') {
    const last = await deleteLastTransaction(user.user_id);
    if (!last) {
      await bot.sendMessage(msg.chat.id, '⚠️ O\'chirish uchun tranzaksiya topilmadi.');
      return;
    }
    await bot.sendMessage(msg.chat.id, `🗑 O\'chirildi:\n${escapeHtml(last.category)}\n${Number(last.amount || 0).toLocaleString('uz-UZ')} so'm`, { parse_mode: 'HTML' });
    return;
  }

  if (msg.voice) {
    await handleVoiceMessage(msg, user);
    return;
  }

  if (msg.photo || msg.document) {
    const premiumReceiptHandled = await handlePremiumReceipt(msg, user);
    if (premiumReceiptHandled) return;
  }

  const parsed = parseText(text);
  if (parsed) {
    let receiptUrl = null;
    if (msg.photo?.length) {
      try {
        receiptUrl = await uploadTelegramFileToStorage(msg.photo[msg.photo.length - 1].file_id, 'receipts', `receipts/${user.user_id}`);
      } catch (error) {
        console.error('Receipt upload error:', error);
      }
    }
    await saveTransaction({
      userId: user.user_id,
      chatId: msg.chat.id,
      parsedData: parsed,
      receiptUrl,
      userExchangeRate: user.exchange_rate || 12850,
      replyMsgId: msg.message_id
    });
    return;
  }

  if ((msg.photo || msg.document) && !parsed) {
    const openRequest = await getOpenPremiumRequest(user.user_id);
    if (openRequest) {
      await bot.sendMessage(msg.chat.id, 'Chek premium so\'roviga biriktirilmadi. Captionga <b>premium</b> deb yozib qayta yuboring.', { parse_mode: 'HTML' });
      return;
    }
  }

  await bot.sendMessage(msg.chat.id, 'Tushunmadim. Misol uchun: <b>50 ming taksi</b> yoki <b>2 mln oylik</b>.', {
    parse_mode: 'HTML',
    reply_markup: getMainKeyboard(getPremiumStatus(user).active)
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      return res.status(200).send('Bot ishlamoqda 🚀');
    }

    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }

    if (webhookSecret) {
      const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
      if (headerSecret !== webhookSecret) {
        return res.status(401).send('Unauthorized');
      }
    }

    const update = typeof req.body === 'string'
      ? JSON.parse(req.body || '{}')
      : (req.body || {});

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return res.status(200).send('OK');
    }

    if (update.message) {
      await handleMessage(update.message);
      return res.status(200).send('OK');
    }

    return res.status(200).send('Ignored');
  } catch (error) {
    await notifyAdminError('webhook.update', error, {
      updateType: req?.body?.callback_query ? 'callback_query' : req?.body?.message ? 'message' : 'unknown'
    });
    await safeUserError(getUpdateChatId(typeof req.body === 'object' ? req.body : null), 'Botda xatolik yuz berdi', error);
    return res.status(500).send('Internal Server Error');
  }
};
