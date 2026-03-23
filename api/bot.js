'use strict';
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// ─── ENV CHECKS ──────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const OAI_KEY = process.env.OPENAI_API_KEY;

if (!BOT_TOKEN) throw new Error('BOT_TOKEN yo\'q');
if (!SUPA_URL) throw new Error('SUPABASE_URL yo\'q');
if (!SUPA_KEY) throw new Error('SUPABASE_KEY (SERVICE_ROLE yoki anon) yo\'q');

// ─── CLIENTS ─────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: false });
const db = createClient(SUPA_URL, SUPA_KEY);

// OpenAI — faqat ovozli xabar uchun (ixtiyoriy)
let openai = null;
if (OAI_KEY && !OAI_KEY.startsWith('your-')) {
  try {
    const { OpenAI } = require('openai');
    openai = new OpenAI({ apiKey: OAI_KEY });
  } catch (e) {
    console.warn('[BOT:openai] OpenAI moduli topilmadi:', e.message);
  }
}

// ─── CONSTANTS ───────────────────────────────────────────
const KB = {
  keyboard: [
    ['📊 Bugungi Hisobot', '📅 Oylik Hisobot'],
    ['↩️ Oxirgisini O\'chirish', '❓ Qo\'llanma'],
  ],
  resize_keyboard: true,
};

const GUIDE = `<b>📖 Qo'llanma</b>

Menga oddiy matn yozing — men siz nima demoqchi ekaningizni kontekstga qarab tushunishga harakat qilaman 🤖

<b>💸 Chiqim misollari:</b>
  • <i>50 ming tushlik</i>
  • <i>Taksiga 20 ming berdim</i>
  • <i>Akamga 100 ming o'tkazdim</i>

<b>💰 Kirim misollari:</b>
  • <i>200 ming dadam berdilar</i>
  • <i>Mijozdan 500 ming oldim</i>
  • <i>Oylik tushdi 4 mln</i>

<b>🤝 Qarz yozish:</b>
  • <i>Suxrobga qarz 100 ming</i>
  • <i>Suxrobga 100 ming qarz berdim</i>
  • <i>Suxrobdan qarz oldim 250 ming</i>

<b>🔁 Qarz qaytishini yozish:</b>
  • <i>Suxrob 100 ming qaytardi</i>
  • <i>100 ming Suxrobdan qaytdi</i>
  • <i>Suxrobga 80 ming qaytardim</i>

<b>🎯 Reja / plan tuzish:</b>
  • <i>5 mln farzandlarim uchun plan</i>
  • <i>1 mln ovqat uchun reja</i>
  • <i>Transport 800 ming limit</i>

<b>🧾 Chek qo'shish:</b>
Chek rasmini izoh bilan birga yuboring. Masalan: <i>78 ming market</i>

<b>ℹ️ Eslatma:</b>
Qarz berilganda balans darhol o'zgarmaydi. Qarz qaytganda yoki qaytarganingizda qarz yozuvi yangilanadi va mos ravishda hisobga olinadi.`;

const DEFAULT_RATE = 12200;
const ADMIN_IDS = new Set((process.env.ADMIN_IDS || '').split(',').map(v => v.trim()).filter(Boolean));

// ─── LOGGING ─────────────────────────────────────────────
const log = (scope, data) => console.log(`[BOT:${scope}]`, JSON.stringify(data));
const warn = (scope, data) => console.warn(`[BOT:${scope}]`, JSON.stringify(data));
const logErr = (scope, e, extra = {}) => console.error(`[BOT:${scope}]`, { msg: e?.message || String(e), ...extra });

// ─── UTILS ───────────────────────────────────────────────
const iso = (ms = Date.now()) => new Date(ms).toISOString();

// HTML entity escape
const esc = v => String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

// Markdown-ish to HTML (simple bold/italic)
const md2html = (t) => String(t ?? '')
  .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
  .replace(/__(.*?)__/g, '<i>$1</i>')
  .replace(/\*(.*?)\*/g, '<b>$1</b>')
  .replace(/_(.*?)_/g, '<i>$1</i>');

// Raqamni lokal formatda ko'rsatish
const numFmt = n => Number(n || 0).toLocaleString('ru-RU');
const isAdmin = userId => ADMIN_IDS.has(String(userId));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let txSourceColumnSupported = null;
let txSourceRefColumnSupported = null;
let debtSettlementColumnSupported = null;
let categoryLimitNameColumnSupported = null;

function fmtDateTime(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('uz-UZ');
  } catch {
    return String(v);
  }
}

function shortId(v, len = 8) {
  return String(v || '').slice(0, len);
}

function tgErr(e) {
  return e?.response?.body?.description || e?.message || "Noma'lum xatolik";
}

function isMissingColumnError(error, column) {
  const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const target = String(column || '').toLowerCase();
  return !!target && msg.includes(target) && (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('unknown column') || msg.includes('could not find the column'));
}

function categoryLimitNameColumn() {
  return categoryLimitNameColumnSupported === 'name' ? 'name' : 'category_name';
}

function normalizeCategoryLimitRow(row) {
  if (!row) return row;
  return { ...row, category_name: row.category_name || row.name || '' };
}


function isMissingTableError(error, table) {
  const msg = String(error?.message || error?.details || '');
  return msg.includes(`relation "${table}" does not exist`) || msg.includes(`Could not find the table '${table}'`) || msg.includes(`relation '${table}' does not exist`);
}

function monthKeyOf(value = Date.now()) {
  const d = new Date(value);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthStartIso(value = Date.now()) {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function startOfTodayIso(value = Date.now()) {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)).toISOString();
}

async function sendCategoryLimitAlert(userId, chatId, category, latestAmount, txType = 'expense') {
  if (txType !== 'expense') return;
  if (!userId || !chatId || !category) return;

  try {
    const now = Date.now();
    const currentMonth = monthKeyOf(now);
    let nameCol = categoryLimitNameColumn();
    let limitRes = await db
      .from('category_limits')
      .select(`id, ${nameCol}, amount, alert_before, notify_bot, is_active, last_alert_sent_at, month_key`)
      .eq('user_id', userId)
      .eq('month_key', currentMonth)
      .eq('is_active', true)
      .ilike(nameCol, category)
      .limit(1)
      .maybeSingle();

    if (limitRes.error && isMissingColumnError(limitRes.error, 'category_name')) {
      categoryLimitNameColumnSupported = 'name';
      nameCol = categoryLimitNameColumn();
      limitRes = await db
        .from('category_limits')
        .select(`id, ${nameCol}, amount, alert_before, notify_bot, is_active, last_alert_sent_at, month_key`)
        .eq('user_id', userId)
        .eq('month_key', currentMonth)
        .eq('is_active', true)
        .ilike(nameCol, category)
        .limit(1)
        .maybeSingle();
    }

    if (limitRes.error && isMissingColumnError(limitRes.error, 'month_key')) {
      limitRes = await db
        .from('category_limits')
        .select(`id, ${nameCol}, amount, alert_before, notify_bot, is_active, last_alert_sent_at`)
        .eq('user_id', userId)
        .eq('is_active', true)
        .ilike(nameCol, category)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    }

    if (limitRes.error) {
      if (isMissingTableError(limitRes.error, 'category_limits')) return;
      logErr('limit-fetch', limitRes.error, { userId, category, nameCol });
      return;
    }

    const limit = normalizeCategoryLimitRow(limitRes.data);
    if (!limit || !limit.notify_bot || !limit.is_active) return;

    const spentRes = await db
      .from('transactions')
      .select('amount, date')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .eq('category', category)
      .gte('date', monthStartIso(now));

    if (spentRes.error) {
      logErr('limit-spent', spentRes.error, { userId, category });
      return;
    }

    const spent = (spentRes.data || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const limitAmount = Number(limit.amount || 0);
    const alertBefore = Math.max(0, Number(limit.alert_before || 0));
    const remaining = limitAmount - spent;
    const exceeded = spent > limitAmount;
    const inWarningZone = !exceeded && alertBefore > 0 && remaining <= alertBefore;

    if (!exceeded && !inWarningZone) return;

    const lastAlertTs = limit.last_alert_sent_at ? new Date(limit.last_alert_sent_at).getTime() : 0;
    const cooldownMs = 6 * 60 * 60 * 1000;
    if (lastAlertTs && now - lastAlertTs < cooldownMs) return;

    const latestTxt = Number(latestAmount || 0) > 0 ? `
🧾 Oxirgi yozuv: <b>${numFmt(latestAmount)} so'm</b>` : '';
    const text = exceeded
      ? `🚨 <b>Limit oshdi</b>

📂 Kategoriya: <b>${esc(category)}</b>
🎯 Limit: <b>${numFmt(limitAmount)} so'm</b>
📤 Sarflangan: <b>${numFmt(spent)} so'm</b>
📉 Oshgan summa: <b>${numFmt(Math.abs(remaining))} so'm</b>${latestTxt}`
      : `⚠️ <b>Limitga yaqinlashdingiz</b>

📂 Kategoriya: <b>${esc(category)}</b>
🎯 Limit: <b>${numFmt(limitAmount)} so'm</b>
📤 Sarflangan: <b>${numFmt(spent)} so'm</b>
💡 Qolgan: <b>${numFmt(Math.max(0, remaining))} so'm</b>${latestTxt}`;

    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' }).catch(() => null);

    const updRes = await db
      .from('category_limits')
      .update({ last_alert_sent_at: new Date(now).toISOString() })
      .eq('id', limit.id);

    if (updRes.error && !isMissingColumnError(updRes.error, 'last_alert_sent_at')) {
      logErr('limit-update', updRes.error, { userId, category, limitId: limit.id });
    }
  } catch (error) {
    logErr('limit-alert', error, { userId, category });
  }
}

async function insertTransactions(rows, source = 'bot') {
  const payload = (rows || []).map(row => ({ ...row }));

  if (txSourceColumnSupported !== false || txSourceRefColumnSupported !== false) {
    const enriched = payload.map(row => {
      const next = { ...row };
      if (txSourceColumnSupported !== false) next.source = source;
      if (txSourceRefColumnSupported !== false && row.source_ref) next.source_ref = row.source_ref;
      return next;
    });

    const res = await db.from('transactions').insert(enriched).select();
    if (!res.error) {
      if (txSourceColumnSupported !== false) txSourceColumnSupported = true;
      if (payload.some(row => row.source_ref)) txSourceRefColumnSupported = true;
      return res;
    }

    if (isMissingColumnError(res.error, 'source_ref')) {
      txSourceRefColumnSupported = false;
      return insertTransactions(rows, source);
    }

    if (isMissingColumnError(res.error, 'source')) {
      txSourceColumnSupported = false;
      return insertTransactions(rows, source);
    }

    return res;
  }

  const plain = payload.map(({ source_ref, ...rest }) => ({ ...rest }));
  return db.from('transactions').insert(plain).select();
}

function adminPanelMarkup() {
  return {
    inline_keyboard: [
      [{ text: '📊 Statistika', callback_data: 'admin_stats' }, { text: '👥 Yangi userlar', callback_data: 'admin_users' }],
      [{ text: '📣 Broadcastlar', callback_data: 'admin_broadcasts' }, { text: '⚠️ Xatolar', callback_data: 'admin_failed' }],
      [{ text: "🧭 Qo'llanma", callback_data: 'admin_help' }, { text: '🔄 Yangilash', callback_data: 'admin_panel' }]
    ]
  };
}

async function safeEditOrSend(chatId, messageId, text, extra = {}) {
  if (messageId) {
    try {
      return await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...extra });
    } catch { }
  }
  return bot.sendMessage(chatId, text, extra).catch(() => null);
}

async function getExactCount(query) {
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function getAdminSnapshot() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [totalUsers, activeToday, txToday, txMonth, failedTargets, drafts, lastBroadcastRes] = await Promise.all([
    getExactCount(db.from('users').select('*', { count: 'exact', head: true })),
    getExactCount(db.from('users').select('*', { count: 'exact', head: true }).gte('last_start_date', todayStart)),
    getExactCount(db.from('transactions').select('*', { count: 'exact', head: true }).gte('date', todayStart)),
    getExactCount(db.from('transactions').select('*', { count: 'exact', head: true }).gte('date', monthStart)),
    getExactCount(db.from('broadcast_failures').select('*', { count: 'exact', head: true })),
    getExactCount(db.from('broadcasts').select('*', { count: 'exact', head: true }).eq('status', 'draft')),
    db.from('broadcasts').select('id, created_at, status, total_users, sent_count, failed_count').order('created_at', { ascending: false }).limit(1).maybeSingle()
  ]);

  return {
    totalUsers,
    activeToday,
    txToday,
    txMonth,
    failedTargets,
    drafts,
    lastBroadcast: lastBroadcastRes.data || null
  };
}

function buildAdminPanelText(snapshot) {
  const last = snapshot.lastBroadcast;
  const lastLine = last
    ? `🕘 Oxirgi broadcast: <b>${shortId(last.id)}</b> · ${esc(last.status || 'unknown')}
   Yetkazildi: <b>${last.sent_count || 0}</b> / ${last.total_users || 0} · Xato: <b>${last.failed_count || 0}</b>
   Sana: ${esc(fmtDateTime(last.created_at))}`
    : `🕘 Oxirgi broadcast: <b>hali yo'q</b>`;

  return `🛠 <b>ADMIN PANEL</b>

👥 Userlar: <b>${snapshot.totalUsers}</b>
🔥 Bugun faol: <b>${snapshot.activeToday}</b>
💸 Bugungi tranzaksiyalar: <b>${snapshot.txToday}</b>
📅 Oylik tranzaksiyalar: <b>${snapshot.txMonth}</b>
📝 Draft broadcastlar: <b>${snapshot.drafts}</b>
⚠️ Yetkazilmagan targetlar: <b>${snapshot.failedTargets}</b>

${lastLine}`;
}

function buildRecentUsersText(rows, totalUsers) {
  const body = rows?.length
    ? rows.map((u, i) => `${i + 1}. <b>${esc(u.full_name || `User ${u.user_id}`)}</b>\n   ID: <code>${u.user_id}</code>${u.phone_number ? `\n   Tel: ${esc(u.phone_number)}` : ''}${u.created_at ? `\n   Qo\'shilgan: ${esc(fmtDateTime(u.created_at))}` : ''}`).join('\n\n')
    : 'Hozircha userlar topilmadi.';

  return `👥 <b>SO\'NGGI USERLAR</b>\nJami userlar: <b>${totalUsers}</b>\n\n${body}`;
}

function buildBroadcastsText(rows) {
  if (!rows?.length) return `📣 <b>BROADCASTLAR</b>\n\nHozircha yozuvlar yo\'q.`;

  return `📣 <b>SO\'NGGI BROADCASTLAR</b>\n\n` + rows.map((b, i) => (
    `${i + 1}. <b>${shortId(b.id)}</b> · ${esc(b.status || 'unknown')}\n` +
    `   Yetkazildi: <b>${b.sent_count || 0}</b> / ${b.total_users || 0}\n` +
    `   Xato: <b>${b.failed_count || 0}</b>\n` +
    `   Sana: ${esc(fmtDateTime(b.created_at))}`
  )).join('\n\n');
}

function buildFailedBroadcastsText(rows) {
  if (!rows?.length) return `⚠️ <b>XATO BO\'LGAN BROADCASTLAR</b>\n\nHozircha muammo yo\'q.`;

  return `⚠️ <b>XATO BO\'LGAN BROADCASTLAR</b>\n\n` + rows.map((b, i) => (
    `${i + 1}. <b>${shortId(b.id)}</b>\n` +
    `   Xato: <b>${b.failed_count || 0}</b> ta\n` +
    `   Holat: ${esc(b.status || 'unknown')}\n` +
    `   Sana: ${esc(fmtDateTime(b.created_at))}`
  )).join('\n\n');
}

function buildFailedTargetsText(bc, rows) {
  const header = `⚠️ <b>YETKAZILMAGAN USERLAR</b>\nBroadcast: <b>${shortId(bc.id)}</b>\nHolat: <b>${esc(bc.status || 'unknown')}</b>\n\n`;
  if (!rows?.length) return header + 'Ayni paytda xato qolmagan ✅';

  return header + rows.map((row, i) => (
    `${i + 1}. <code>${row.user_id}</code>\n` +
    `   Sabab: ${esc(row.error_message || "Noma\'lum")}\n` +
    `   Retry: <b>${row.retry_count || 0}</b>\n` +
    `   Vaqt: ${esc(fmtDateTime(row.updated_at || row.last_retry_at || row.created_at))}`
  )).join('\n\n');
}

function buildBroadcastGuideText() {
  return `🧭 <b>ADMIN BUYRUQLARI</b>

<b>/admin</b> — admin panelni ochadi
<b>/message Matn</b> — broadcast draft yaratadi

<b>Tugmali broadcast:</b>
<code>/message Assalomu alaykum
--
Kanal | https://t.me/username</code>

Rasm/video/document bilan ham <b>/message</b> yuborsangiz, preview chiqadi.
Xato bo'lsa, natija oynasida yetkazilmagan userlar uchun alohida <b>qayta yuborish</b> tugmasi chiqadi.`;
}

async function sendAdminPanel(chatId, messageId = null) {
  const snapshot = await getAdminSnapshot();
  return safeEditOrSend(chatId, messageId, buildAdminPanelText(snapshot), {
    parse_mode: 'HTML',
    reply_markup: adminPanelMarkup()
  });
}

async function sendBroadcastPayload(uid, bc) {
  const opts = {
    caption: bc.content,
    entities: bc.entities,
    caption_entities: bc.entities,
    reply_markup: bc.reply_markup
  };

  if (bc.msg_type === 'photo') return bot.sendPhoto(uid, bc.media_id, opts);
  if (bc.msg_type === 'video') return bot.sendVideo(uid, bc.media_id, opts);
  if (bc.msg_type === 'animation') return bot.sendAnimation(uid, bc.media_id, opts);
  if (bc.msg_type === 'document') return bot.sendDocument(uid, bc.media_id, opts);
  return bot.sendMessage(uid, bc.content || '', { entities: bc.entities, reply_markup: bc.reply_markup });
}

async function storeBroadcastFailures(broadcastId, rows) {
  if (!rows.length) return;
  const { error } = await db.from('broadcast_failures').upsert(rows, { onConflict: 'broadcast_id,user_id' });
  if (error) throw error;
}

async function sendBroadcastBatch(bc, { targetUserIds = null, retryOnly = false } = {}) {
  let userIds = targetUserIds;
  if (!userIds) {
    const { data: allUsers, error: fErr } = await db.from('users').select('user_id');
    if (fErr) throw fErr;
    userIds = (allUsers || []).map(u => u.user_id);
  }

  userIds = [...new Set((userIds || []).map(Number).filter(Boolean))];
  const total = userIds.length;
  let success = 0;
  let failed = 0;
  const deliveredIds = [];
  const failedRows = [];
  const failureSamples = [];

  if (!retryOnly) {
    await db.from('broadcast_failures').delete().eq('broadcast_id', bc.id);
  }

  const batchSize = 25;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(async (uid) => {
      try {
        await sendBroadcastPayload(uid, bc);
        success++;
        deliveredIds.push(uid);
      } catch (e) {
        failed++;
        const reason = tgErr(e);
        failedRows.push({
          broadcast_id: bc.id,
          user_id: uid,
          error_message: reason.slice(0, 400),
          retry_count: retryOnly ? 1 : 0,
          last_retry_at: retryOnly ? iso() : null
        });
        if (failureSamples.length < 8) failureSamples.push({ uid, reason });
      }
    }));

    if (i + batchSize < userIds.length) await sleep(900);
  }

  if (deliveredIds.length) {
    await db.from('broadcast_failures').delete().eq('broadcast_id', bc.id).in('user_id', deliveredIds);
  }

  if (failedRows.length) {
    await storeBroadcastFailures(bc.id, failedRows);
  }

  const { count: remainingFailed, error: rcErr } = await db.from('broadcast_failures').select('*', { count: 'exact', head: true }).eq('broadcast_id', bc.id);
  if (rcErr) throw rcErr;

  const totalUsers = retryOnly ? (bc.total_users || total) : total;
  const sentCount = Math.max(0, totalUsers - (remainingFailed || 0));
  const status = (remainingFailed || 0) > 0 ? 'partial_fail' : 'sent';

  const { error: updErr } = await db.from('broadcasts').update({
    status,
    total_users: totalUsers,
    sent_count: sentCount,
    failed_count: remainingFailed || 0,
    completed_at: iso()
  }).eq('id', bc.id);
  if (updErr) throw updErr;

  return {
    total,
    success,
    failed,
    remainingFailed: remainingFailed || 0,
    status,
    failureSamples
  };
}

function buildBroadcastResultText(bc, result, retryOnly = false) {
  const title = retryOnly ? '🔁 <b>QAYTA YUBORISH YAKUNLANDI</b>' : '📣 <b>BROADCAST YAKUNLANDI</b>';
  const sampleText = result.failureSamples?.length
    ? '\n\n<b>Namuna xatolar:</b>\n' + result.failureSamples.map(item => `• <code>${item.uid}</code> — ${esc(item.reason)}`).join('\n')
    : '';

  return `${title}\n\nBroadcast ID: <b>${shortId(bc.id)}</b>\nJoriy urinish targetlari: <b>${result.total}</b>\nUshbu urinishda yetkazildi: <b>${result.success}</b>\nUshbu urinishda xato: <b>${result.failed}</b>\nHozir qolgan xatolar: <b>${result.remainingFailed}</b>\nHolat: <b>${esc(result.status)}</b>${sampleText}`;
}

function buildBroadcastResultMarkup(bc, result) {
  const rows = [];
  if (result.remainingFailed > 0) {
    rows.push([
      { text: "🔁 Xato bo'lganlarga qayta yuborish", callback_data: `bc_retry:${bc.id}` },
      { text: "👀 Xatolar ro'yxati", callback_data: `bc_failed:${bc.id}` }
    ]);
  }
  rows.push([{ text: '🛠 Admin panel', callback_data: 'admin_panel' }]);
  return { inline_keyboard: rows };
}

async function fetchUserCategories(userId) {
  let res = await db.from('categories').select('id, name, type, keywords').eq('user_id', userId);
  if (res.error && isMissingColumnError(res.error, 'keywords')) {
    res = await db.from('categories').select('id, name, type').eq('user_id', userId);
  }
  if (res.error) throw res.error;
  return res.data || [];
}

const CATEGORY_ALIASES = {
  expense: {
    Transport: ['taksi', 'taxi', 'yandex', 'metro', 'bus', 'benzin', 'zapravka', "yo'l", 'transport'],
    Ovqat: ['ovqat', 'osh', 'tushlik', 'kechki ovqat', 'non', 'market', 'korzinka', 'taom', 'kafe', 'fastfood', 'choyxona'],
    Kvartira: ['ijara', 'kvartira', 'uy', 'kommunal', 'svet', 'gaz', 'suv', 'internet', 'wifi', 'arenda'],
    Kredit: ['kredit', 'bank', 'tolov', "to'lov", 'uzum'],
    Qarz: ['qarz', 'nasiya', 'loan', 'qarzdorlik'],
    "Sog'liq": ['dori', 'apteka', 'klinika', 'shifoxona', 'stomatolog', "sog'liq"],
    Aloqa: ['telefon', 'nomer', 'aloqa', 'sim', 'megabayt', 'internet paket'],
    "Ko'ngilochar": ['kino', 'oyin', "o'yin", 'game', 'subscription', 'netflix', 'spotify'],
    Kiyim: ['kiyim', 'shim', 'oyoq kiyim', 'krossovka', 'futbolka', 'kurtka']
  },
  income: {
    Oylik: ['oylik', 'salary', 'maosh'],
    Avans: ['avans'],
    Bonus: ['bonus', 'cashback', 'mukofot'],
    "Sovg'a": ["sovg'a", 'gift'],
    Sotuv: ['sotuv', 'savdo', 'mijoz', 'zakaz'],
    Astatka: ['astatka', 'qaytim', 'qoldiq']
  }
};

function normalizeTextForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\sЀ-ӿ؀-ۿ']/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function genericCategoryName(value) {
  const v = normalizeTextForMatch(value);
  return !v || ['xarajat', 'expense', 'chiqim', 'kirim', 'income', 'daromad'].includes(v);
}

function scoreCategoryFromAliases(type, haystack) {
  const aliasPool = CATEGORY_ALIASES[type] || {};
  let best = null;
  let bestScore = 0;

  for (const [name, aliases] of Object.entries(aliasPool)) {
    let score = 0;
    for (const alias of aliases) {
      const token = normalizeTextForMatch(alias);
      if (!token) continue;
      if (haystack === token) score += 12;
      else if (haystack.includes(token)) score += Math.max(3, token.length);
    }
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }

  return { best, bestScore };
}

function resolveCategoryForUser(parsed, categories, rawText = '') {
  if (!parsed) return null;

  const type = parsed.type === 'income' ? 'income' : 'expense';
  const pool = (categories || []).filter(cat => cat.type === type);
  const haystack = `${normalizeTextForMatch(rawText)} ${normalizeTextForMatch(parsed.category)}`.trim();

  const direct = pool.find(cat => normalizeTextForMatch(cat.name) === normalizeTextForMatch(parsed.category));
  if (direct) return direct.name;

  let best = null;
  let bestScore = 0;
  for (const cat of pool) {
    const words = [cat.name]
      .concat(Array.isArray(cat.keywords) ? cat.keywords : [])
      .map(normalizeTextForMatch)
      .filter(Boolean);

    let score = 0;
    for (const word of words) {
      if (haystack === word) score += 14;
      else if (haystack.includes(word)) score += Math.max(3, word.length);
    }

    if (score > bestScore) {
      bestScore = score;
      best = cat.name;
    }
  }

  if (best && bestScore >= 4) return best;

  const aliasHit = scoreCategoryFromAliases(type, haystack);
  if (aliasHit.best) {
    const matchedUserCategory = pool.find(cat => normalizeTextForMatch(cat.name) === normalizeTextForMatch(aliasHit.best));
    if (matchedUserCategory) return matchedUserCategory.name;
    return aliasHit.best;
  }

  if (genericCategoryName(parsed.category)) return type === 'income' ? 'Kirim' : 'Xarajat';
  return parsed.category;
}

// GPT orkali matndan (ovozli xabardan) ma'lumotlarni olish
async function gptParse(text) {
  if (!openai || !text) return null;

  try {
    const prompt = `Ushbu o'zbek tilidagi moliyaviy xabardan summa (amount), tur (type: income yoki expense) va kategoriyani (category) JSON formatida aniqlab ber.
Xabar: "${text}"

Qoidalar:
1. "yuz ming", "bir yarim mln" kabi so'zlarni raqamga aylantir.
2. "berdim", "to'ladim", "sarfladim", "sotib oldim" odatda chiqim (expense).
3. "dadam berdilar", "mijoz yubordi", "oylik tushdi", "bonus keldi" odatda kirim (income).
4. Faqat "oldim" so'ziga qarab income demang: "kitob oldim" bu expense, "mijozdan oldim" bu income.
5. Agar valyuta dollar ($) bo'lsa, isUSD: true qilib belgilang.
6. Faqat JSON qaytaring: {"amount": number, "type": "income"|"expense", "category": "string", "isUSD": boolean}
Agar tushunarsiz bo'lsa, null qaytaring.`;

    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const data = JSON.parse(res.choices[0].message.content);
    if (!data || !data.amount) return null;

    return {
      amount: Math.round(data.amount),
      type: data.type || 'expense',
      category: data.category || (data.type === 'income' ? 'Kirim' : 'Xarajat'),
      isUSD: !!data.isUSD
    };
  } catch (e) {
    logErr('gpt-parse', e);
    return null;
  }
}

function titleCaseWords(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim();
}

function extractAmountMeta(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  const lower = text.toLowerCase();
  const isUSD = /\$|\busd\b|dollar/i.test(lower);

  let clean = lower
    .replace(/so'?m|sum|uzs|\$|€|\busd\b|dollar/gi, ' ')
    .replace(/[^\d\s.,a-zа-яёӣқғҳў\-']/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const m = clean.match(/(\d[\d\s,.]*)(\s*(?:k|ming|mln|mlrd|million|milliard|m|b)\b)?/i);
  if (!m) return null;

  let numStr = m[1].trim();
  numStr = numStr
    .replace(/[. ](?=\d{3}(?:\D|$))/g, '')
    .replace(/,/g, '.')
    .replace(/\s/g, '');

  const amount = parseFloat(numStr);
  if (!amount || Number.isNaN(amount) || !Number.isFinite(amount)) return null;

  const suffix = (m[2] || '').replace(/\s/g, '').toLowerCase();
  let finalAmount = amount;

  const isAlreadyBig = (suffix === 'k' || suffix === 'ming') && amount >= 1000;
  const isAlreadyMln = (suffix === 'mln' || suffix === 'm' || suffix === 'million') && amount >= 1000000;

  if (suffix === 'k' || suffix === 'ming') {
    if (!isAlreadyBig) finalAmount = amount * 1_000;
  } else if (suffix === 'mln' || suffix === 'million' || suffix === 'm') {
    if (!isAlreadyMln) finalAmount = amount * 1_000_000;
  } else if (suffix === 'mlrd' || suffix === 'milliard' || suffix === 'b') {
    finalAmount = amount * 1_000_000_000;
  }

  if (!Number.isFinite(finalAmount) || finalAmount <= 0) return null;

  return {
    amount: Math.round(finalAmount),
    isUSD,
    clean,
    rawMatch: m[0]
  };
}

function inferTransactionType(lower) {
  let incomeScore = 0;
  let expenseScore = 0;

  if (/^\+/.test(lower)) incomeScore += 5;
  if (/^-/.test(lower)) expenseScore += 5;

  if (/\b(?:oylik|maosh|avans|bonus|cashback|daromad|foyda|grant|stipendiya)\b/i.test(lower)) incomeScore += 7;
  if (/\b(?:dadam|onam|akam|ukam|opam|singlim|do'?stim|mijoz|klient|boshliq|ishxona|kompaniya|ustoz)\b.*\b(?:berdi|berdilar|yubordi|jo'?natdi|o'?tkazdi|tashladi|to'?ladi)\b/i.test(lower)) incomeScore += 8;
  if (/\b(?:menga|hisobimga|kartamga)\b.*\b(?:tushdi|keldi|o'?tdi|kelib tushdi)\b/i.test(lower)) incomeScore += 8;
  if (/\b(?:mijozdan|klientdan|dadamdan|onamdan|akamdan|ukamdan|opamdan|singlimdan|do'?stimdan|boshliqdan)\b.*\b(?:oldim|oldik|qabul qildim)\b/i.test(lower)) incomeScore += 7;
  if (/\b(?:qaytdi|qaytarib berdi|qaytarildi)\b/i.test(lower)) incomeScore += 4;
  if (/\b(?:sovg'a|sovga|hadya)\b/i.test(lower)) incomeScore += 4;

  if (/\b(?:berdim|to'?ladim|sarfladim|jo'?natdim|o'?tkazdim|uzatdim|chiqim|xarajat)\b/i.test(lower)) expenseScore += 8;
  if (/\b(?:sotib oldim|xarid qildim)\b/i.test(lower)) expenseScore += 8;
  if (/\boldim\b/i.test(lower) && !/\b(?:mijozdan|klientdan|dadamdan|onamdan|akamdan|ukamdan|opamdan|singlimdan|do'?stimdan|boshliqdan)\b/i.test(lower) && !/\b(?:oylik|maosh|avans|bonus|cashback|daromad|foyda|qaytim|astatka)\b/i.test(lower)) expenseScore += 4;
  if (/\b\S+ga\b.*\b(?:berdim|to'?ladim|o'?tkazdim)\b/i.test(lower)) expenseScore += 5;
  if (/\b(?:taksi|yandex|ovqat|tushlik|kechki ovqat|non|market|korzinka|bozor|ijara|kommunal|kredit|dori|apteka|internet|wifi|benzin|zapravka|subscription|obuna|kiyim|krossovka)\b/i.test(lower)) expenseScore += 5;

  return {
    incomeScore,
    expenseScore,
    type: incomeScore > expenseScore ? 'income' : 'expense'
  };
}

function inferSemanticCategory(lower, type, rawCategory) {
  if (type === 'income') {
    if (/\b(?:oylik|maosh)\b/i.test(lower)) return 'Oylik';
    if (/\bavans\b/i.test(lower)) return 'Avans';
    if (/\b(?:bonus|cashback|mukofot)\b/i.test(lower)) return 'Bonus';
    if (/\b(?:mijoz|klient|sotuv|zakaz|savdo)\b/i.test(lower)) return 'Sotuv';
    if (/\b(?:dadam|onam|akam|ukam|opam|singlim|do'?stim|sovg'a|sovga|hadya)\b/i.test(lower)) return "Sovg'a";
    if (/\b(?:qaytdi|qaytarib berdi|qaytarildi)\b/i.test(lower)) return 'Astatka';
  }

  const aliasHit = scoreCategoryFromAliases(type, normalizeTextForMatch(`${lower} ${rawCategory}`));
  if (aliasHit.best) return aliasHit.best;

  return rawCategory;
}

function cleanupCategoryText(value) {
  const cleaned = String(value || '')
    .replace(/\b(so'?m|sum|uzs|usd|dollar|kirim|chiqim|berdim|berdi|berdilar|oldim|oldik|tushdi|ketdi|keldi|oylik|bonus|avans|maosh|menga|hisobimga|kartamga|to'?ladim|sarfladim|sotib|xarid|qildim|plan|reja|limit|byudjet)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

function stripAmountFragment(text, amountMeta) {
  return String(text || '').replace(amountMeta?.rawMatch || '', ' ');
}

function cleanupIntentName(value) {
  return titleCaseWords(String(value || '')
    .replace(/\b(?:uchun|ga|ka|qa|dan|ni|pul|summa|bo'?yicha|oylik|oyiga|joriy|shu|oy|plan|reja|limit|byudjet|budjet)\b/gi, ' ')
    .replace(/[.,!?;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function cleanupPersonName(value) {
  return titleCaseWords(String(value || '')
    .replace(/\b(?:men|menga|meni|mendan|biz|bizga|bizni|u|unga|undan|undanam|pul|summa|uchun|bilan|qilgan|qilib|qaytarib|berib|oldim|berdim|oldi|berdi|qaytardi|qaytdi|qaytardim|qaytarildi|to'?ladim|uzdim|qarz|nasiya|qarzni|kerak|bo'?lgan|boyicha)\b/gi, ' ')
    .replace(/[.,!?;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function extractNameBySuffix(text, suffix) {
  const safe = String(text || '').trim();
  if (!safe) return '';
  const re = new RegExp(`([\\p{L}0-9'’\\s-]{2,}?)(?:${suffix})\\b`, 'iu');
  const match = safe.match(re);
  if (!match?.[1]) return '';
  return cleanupPersonName(match[1]);
}

function extractLooseName(text) {
  return cleanupPersonName(String(text || '')
    .replace(/\b(?:qaytdi|qaytardi|qaytardim|qaytarildi|qaytarib berdi|qaytarib berdim|to'?ladim|uzdim|berdim|oldim|qarz|nasiya)\b/gi, ' '));
}

function parsePlanIntent(raw) {
  const text = String(raw || '').trim();
  if (!text || !/\b(?:reja|plan|limit|byudjet|budjet)\b/i.test(text)) return null;

  const amountMeta = extractAmountMeta(text);
  if (!amountMeta) return null;

  const noPrimaryAmount = stripAmountFragment(text, amountMeta);
  const alertMeta = /\b(?:qolganda|ogohlantir|ogohlantirgin|ogohlantirish)\b/i.test(text) ? extractAmountMeta(noPrimaryAmount) : null;
  const cleaned = cleanupCategoryText(String(noPrimaryAmount)
    .replace(alertMeta?.rawMatch || '', ' ')
    .replace(/\b(?:reja|plan|limit|byudjet|budjet|oylik|oyiga|kerak|qilib qo'y|qilib qoy|qilib ber|tuzib ber|tuzib qo'y|tuzib qoy|tuz|tuzing|ogohlantir|ogohlantirgin|ogohlantirish|qolganda)\b/gi, ' '));

  let categoryName = '';
  const beforeUchun = cleaned.match(/(.+?)\s+uchun\b/i);
  if (beforeUchun?.[1]) categoryName = beforeUchun[1];
  if (!categoryName) {
    const afterIntent = cleaned.match(/\b(?:reja|plan|limit|byudjet|budjet)\b\s+(.+)$/i);
    if (afterIntent?.[1]) categoryName = afterIntent[1];
  }
  if (!categoryName) categoryName = cleaned;

  categoryName = cleanupIntentName(categoryName);
  if (!categoryName) return null;

  return {
    amount: amountMeta.amount,
    categoryName,
    alertBefore: Math.max(0, alertMeta?.amount || Math.round(amountMeta.amount * 0.1)),
    monthKey: monthKeyOf(),
  };
}

function parseDebtIntent(raw) {
  const text = String(raw || '').trim();
  const lower = text.toLowerCase();
  if (!text || !/\b(?:qarz|nasiya)\b/i.test(lower)) return null;

  const amountMeta = extractAmountMeta(text);
  if (!amountMeta) return null;

  const noAmount = stripAmountFragment(text, amountMeta);
  const hasGiveVerb = /\b(?:berdim|berib turdim|yozib berdim|beraman)\b/i.test(lower);
  const hasTakeVerb = /\b(?:oldim|olib turdim|olaman)\b/i.test(lower);
  const hasGa = /[\p{L}0-9'’`\-]+ga\b/iu.test(noAmount);
  const hasDan = /[\p{L}0-9'’`\-]+dan\b/iu.test(noAmount);

  let direction = null;
  if (hasGa || hasGiveVerb) direction = 'receivable';
  if (!direction && (hasDan || hasTakeVerb)) direction = 'payable';
  if (!direction) return null;

  let personName = direction === 'receivable'
    ? extractNameBySuffix(noAmount, 'ga')
    : extractNameBySuffix(noAmount, 'dan');

  if (!personName) personName = extractLooseName(noAmount);
  if (!personName) return null;

  return {
    amount: amountMeta.amount,
    personName,
    direction,
    note: text,
  };
}

function parseDebtSettlementIntent(raw) {
  const text = String(raw || '').trim();
  const lower = text.toLowerCase();
  if (!text) return null;

  const amountMeta = extractAmountMeta(text);
  const noAmount = stripAmountFragment(text, amountMeta);
  const hasReturnVerb = /\b(?:qaytdi|qaytardi|qaytardim|qaytarildi|qaytarib berdi|qaytarib berdim|uzdim|uzildi|to'?ladim)\b/i.test(lower);
  const hasDebtHint = /\b(?:qarz|nasiya)\b/i.test(lower);
  if (hasDebtHint && !hasReturnVerb) return null;
  const hasGa = /[\p{L}0-9'’`\-]+ga\b/iu.test(noAmount);
  const hasDan = /[\p{L}0-9'’`\-]+dan\b/iu.test(noAmount);

  let direction = null;
  if (/\b(?:qaytardi|qaytdi|qaytarildi|qaytarib berdi)\b/i.test(lower)) direction = 'receivable';
  if (!direction && /\b(?:qaytardim|qaytarib berdim|uzdim|to'?ladim)\b/i.test(lower)) direction = 'payable';
  if (!direction && hasDan) direction = 'receivable';
  if (!direction && hasGa) direction = 'payable';
  if (!direction) return null;

  let personName = direction === 'receivable'
    ? extractNameBySuffix(noAmount, 'dan')
    : extractNameBySuffix(noAmount, 'ga');

  if (!personName) personName = extractLooseName(noAmount);
  if (!personName) return null;

  const explicit = hasReturnVerb || hasDebtHint;
  if (!explicit && !amountMeta) return null;

  return {
    amount: amountMeta?.amount || null,
    personName,
    direction,
    explicit,
    note: text,
  };
}

async function ensureExpenseCategory(userId, categoryName) {
  const cats = await fetchUserCategories(userId);
  const normalized = normalizeTextForMatch(categoryName);
  const existing = (cats || []).find(cat => cat.type === 'expense' && normalizeTextForMatch(cat.name) === normalized);
  if (existing) return existing;

  const { data, error } = await db
    .from('categories')
    .insert([{ user_id: userId, name: categoryName, type: 'expense', icon: 'target' }])
    .select('id, name, type, keywords')
    .maybeSingle();

  if (error && !String(error.message || '').toLowerCase().includes('duplicate')) throw error;
  if (data) return data;

  const fresh = await fetchUserCategories(userId);
  return fresh.find(cat => cat.type === 'expense' && normalizeTextForMatch(cat.name) === normalized) || null;
}

async function savePlanIntent(userId, chatId, intent) {
  const category = await ensureExpenseCategory(userId, intent.categoryName);
  const categoryName = category?.name || intent.categoryName;

  let nameCol = categoryLimitNameColumn();
  let current = await db
    .from('category_limits')
    .select(`id, amount, month_key, ${nameCol}`)
    .eq('user_id', userId)
    .eq('month_key', intent.monthKey)
    .ilike(nameCol, categoryName)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (current.error && isMissingColumnError(current.error, 'category_name')) {
    categoryLimitNameColumnSupported = 'name';
    nameCol = categoryLimitNameColumn();
    current = await db
      .from('category_limits')
      .select(`id, amount, month_key, ${nameCol}`)
      .eq('user_id', userId)
      .eq('month_key', intent.monthKey)
      .ilike(nameCol, categoryName)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  if (current.error && isMissingColumnError(current.error, 'month_key')) {
    current = await db
      .from('category_limits')
      .select(`id, amount, ${nameCol}`)
      .eq('user_id', userId)
      .ilike(nameCol, categoryName)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  if (current.error && !isMissingTableError(current.error, 'category_limits')) throw current.error;
  current.data = normalizeCategoryLimitRow(current.data);

  const payload = {
    category_id: category?.id || null,
    [nameCol]: categoryName,
    amount: intent.amount,
    alert_before: intent.alertBefore,
    notify_bot: true,
    notify_app: true,
    is_active: true,
    month_key: intent.monthKey,
  };

  if (current.data?.id) {
    let updateRes = await db.from('category_limits').update(payload).eq('id', current.data.id).eq('user_id', userId);
    if (updateRes.error && isMissingColumnError(updateRes.error, 'category_name')) {
      categoryLimitNameColumnSupported = 'name';
      nameCol = categoryLimitNameColumn();
      const fallbackPayload = { ...payload, [nameCol]: categoryName };
      delete fallbackPayload.category_name;
      updateRes = await db.from('category_limits').update(fallbackPayload).eq('id', current.data.id).eq('user_id', userId);
    }
    if (updateRes.error && isMissingColumnError(updateRes.error, 'month_key')) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.month_key;
      updateRes = await db.from('category_limits').update(fallbackPayload).eq('id', current.data.id).eq('user_id', userId);
    }
    if (updateRes.error) throw updateRes.error;
    await bot.sendMessage(chatId,
      `🎯 <b>Reja yangilandi</b>\n\n📂 Kategoriya: <b>${esc(categoryName)}</b>\n💰 Limit: <b>${numFmt(intent.amount)} so'm</b>\n⚠️ Ogohlantirish: <b>${numFmt(intent.alertBefore)} so'm</b>\n📅 Oy: <b>${esc(intent.monthKey)}</b>\n\nMini App > Reja bo'limida ko'rinadi.`,
      { parse_mode: 'HTML' }
    ).catch(() => null);
    return true;
  }

  let insertRes = await db.from('category_limits').insert([{ user_id: userId, ...payload }]);
  if (insertRes.error && isMissingColumnError(insertRes.error, 'category_name')) {
    categoryLimitNameColumnSupported = 'name';
    nameCol = categoryLimitNameColumn();
    const fallbackPayload = { ...payload, [nameCol]: categoryName };
    delete fallbackPayload.category_name;
    insertRes = await db.from('category_limits').insert([{ user_id: userId, ...fallbackPayload }]);
  }
  if (insertRes.error && isMissingColumnError(insertRes.error, 'month_key')) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.month_key;
    insertRes = await db.from('category_limits').insert([{ user_id: userId, ...fallbackPayload }]);
  }
  if (insertRes.error) throw insertRes.error;

  await bot.sendMessage(chatId,
    `🎯 <b>Reja yaratildi</b>\n\n📂 Kategoriya: <b>${esc(categoryName)}</b>\n💰 Limit: <b>${numFmt(intent.amount)} so'm</b>\n⚠️ Ogohlantirish: <b>${numFmt(intent.alertBefore)} so'm</b>\n📅 Oy: <b>${esc(intent.monthKey)}</b>\n\nMini App > Reja bo'limida ko'rinadi.`,
    { parse_mode: 'HTML' }
  ).catch(() => null);
  return true;
}

function pickBestDebtMatch(rows, personName) {
  const target = normalizeTextForMatch(personName);
  let best = null;
  let bestScore = 0;

  for (const row of rows || []) {
    const candidate = normalizeTextForMatch(row.person_name);
    if (!candidate) continue;
    let score = 0;
    if (candidate === target) score = 100;
    else if (candidate.includes(target) || target.includes(candidate)) score = 70;
    else {
      const targetWords = new Set(target.split(' ').filter(Boolean));
      const candidateWords = candidate.split(' ').filter(Boolean);
      score = candidateWords.reduce((sum, word) => sum + (targetWords.has(word) ? 25 : 0), 0);
    }
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  return bestScore >= 25 ? best : null;
}

async function findOpenDebtByPerson(userId, personName, direction) {
  const { data, error } = await db
    .from('debts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'open')
    .eq('direction', direction)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return pickBestDebtMatch(data || [], personName);
}

async function updateDebtSettlementMeta(debtId, userId, values) {
  if (debtSettlementColumnSupported === false) {
    const { settlement_tx_id, ...plain } = values || {};
    return db.from('debts').update(plain).eq('id', debtId).eq('user_id', userId);
  }

  const res = await db.from('debts').update(values).eq('id', debtId).eq('user_id', userId);
  if (!res.error) {
    debtSettlementColumnSupported = true;
    return res;
  }

  if (isMissingColumnError(res.error, 'settlement_tx_id')) {
    debtSettlementColumnSupported = false;
    const { settlement_tx_id, ...plain } = values || {};
    return db.from('debts').update(plain).eq('id', debtId).eq('user_id', userId);
  }

  return res;
}

async function createDebtSettlementTx(userId, debt, amount) {
  const category = debt.direction === 'receivable'
    ? `Qarz qaytdi · ${debt.person_name}`
    : `Qarz qaytarildi · ${debt.person_name}`;
  const sourceRef = `debt:${debt.id}:${Date.now()}`;
  const row = {
    user_id: userId,
    amount,
    category,
    type: debt.direction === 'receivable' ? 'income' : 'expense',
    date: iso(),
    source_ref: sourceRef,
  };

  const { data, error } = await insertTransactions([row], 'debt_settlement');
  if (error) throw error;
  const saved = Array.isArray(data) ? data[0] : data;
  return saved || null;
}

async function saveDebtIntent(userId, chatId, intent) {
  const payload = {
    user_id: userId,
    person_name: intent.personName,
    amount: intent.amount,
    direction: intent.direction,
    due_at: null,
    remind_at: null,
    note: intent.note,
    status: 'open'
  };

  const { error } = await db.from('debts').insert([payload]);
  if (error) throw error;

  const directionText = intent.direction === 'receivable' ? 'Sizga qaytadi' : 'Siz qaytarasiz';
  await bot.sendMessage(chatId,
    `🤝 <b>Qarz saqlandi</b>

📂 <b>Turi:</b> Qarz
👤 <b>Kim bilan:</b> <b>${esc(intent.personName)}</b>
💰 <b>Summa:</b> <b>${numFmt(intent.amount)} so'm</b>
📌 <b>Yo'nalish:</b> <b>${esc(directionText)}</b>

<i>Eslatma: qarz berilganda balans darhol o'zgarmaydi. Qarz qaytganda yoki qaytarganingizda bot avtomatik hisobga oladi.</i>`,
    { parse_mode: 'HTML' }
  ).catch(() => null);
  return true;
}

async function saveDebtSettlementIntent(userId, chatId, intent) {
  const debt = await findOpenDebtByPerson(userId, intent.personName, intent.direction);
  if (!debt) {
    if (intent.explicit) {
      await bot.sendMessage(chatId,
        `⚠️ <b>Ochiq qarz topilmadi</b>

👤 <b>${esc(intent.personName)}</b> uchun ochiq qarz yozuvi topilmadi. Avval qarzni yozing yoki Mini App > Qarzlar bo'limidan tekshiring.`,
        { parse_mode: 'HTML' }
      ).catch(() => null);
      return { handled: true, found: false };
    }
    return { handled: false, found: false };
  }

  const currentAmount = Number(debt.amount || 0);
  const paidAmount = Math.max(0, Number(intent.amount || currentAmount));
  if (!paidAmount) return { handled: false, found: true };

  const usedAmount = Math.min(currentAmount, paidAmount);
  const remaining = Math.max(0, currentAmount - usedAmount);
  const tx = await createDebtSettlementTx(userId, debt, usedAmount);

  if (remaining > 0) {
    const { error } = await updateDebtSettlementMeta(debt.id, userId, {
      amount: remaining,
      updated_at: iso(),
    });
    if (error) throw error;

    await bot.sendMessage(chatId,
      `🔁 <b>Qarz qisman yopildi</b>

👤 <b>${esc(debt.person_name)}</b>
💸 <b>${numFmt(usedAmount)} so'm</b> ${debt.direction === 'receivable' ? 'qaytdi' : 'qaytarildi'}
💼 <b>Qoldiq qarz:</b> <b>${numFmt(remaining)} so'm</b>`,
      { parse_mode: 'HTML' }
    ).catch(() => null);

    return { handled: true, found: true, debtId: debt.id, txId: tx?.id || null, partial: true };
  }

  const { error } = await updateDebtSettlementMeta(debt.id, userId, {
    status: 'paid',
    paid_at: iso(),
    settlement_tx_id: tx?.id || null,
    updated_at: iso(),
  });
  if (error) throw error;

  await bot.sendMessage(chatId,
    `✅ <b>Qarz yopildi</b>

👤 <b>${esc(debt.person_name)}</b>
💰 <b>${numFmt(usedAmount)} so'm</b> ${debt.direction === 'receivable' ? "qaytdi va balansga qo'shildi" : "qaytarildi va balansdan chiqarildi"}.`,
    { parse_mode: 'HTML' }
  ).catch(() => null);

  return { handled: true, found: true, debtId: debt.id, txId: tx?.id || null, partial: false };
}


// ─── TEXT PARSER ──────────────────────────────────────────
// Matndan summa, tur va kategoriyani ajratib olish (Regex asosslangan fallback)
function parseText(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const lower = text.toLowerCase();
  const amountMeta = extractAmountMeta(text);
  if (!amountMeta) return null;

  const typeMeta = inferTransactionType(lower);
  const type = typeMeta.type;

  let catPart = amountMeta.clean.replace(amountMeta.rawMatch, ' ').replace(/^\s*[+\-]\s*/, '').trim();
  catPart = cleanupCategoryText(catPart);
  if (!catPart || catPart.length < 2) catPart = type === 'income' ? 'kirim' : 'xarajat';

  const inferredCategory = inferSemanticCategory(lower, type, titleCaseWords(catPart));
  const category = titleCaseWords(inferredCategory || catPart || (type === 'income' ? 'Kirim' : 'Xarajat'));

  return {
    amount: amountMeta.amount,
    type,
    category,
    isUSD: amountMeta.isUSD
  };
}

// ─── SAVE TRANSACTION ────────────────────────────────────
async function saveTx(userId, chatId, parsed, receiptUrl = null, exRate = DEFAULT_RATE, replyId = null, rawText = '') {
  const safeRate = Number(exRate) > 0 ? Number(exRate) : DEFAULT_RATE;

  let amount = parsed.amount;
  let category = parsed.category;

  try {
    const userCats = await fetchUserCategories(userId);
    category = resolveCategoryForUser(parsed, userCats, rawText) || category;
  } catch (error) {
    logErr('category-resolve', error, { userId });
  }
  let amtTxt = `${numFmt(amount)} so'm`;

  if (parsed.isUSD) {
    amount = Math.round(parsed.amount * safeRate);
    category = `${parsed.category} ($${parsed.amount})`;
    amtTxt = `${numFmt(amount)} so'm\n<i>($${numFmt(parsed.amount)} × ${numFmt(safeRate)})</i>`;
  }

  const row = {
    user_id: userId,
    amount,
    category,
    type: parsed.type,
    date: iso(),
    receipt_url: receiptUrl || null,
  };

  const { data, error } = await insertTransactions([row], 'bot');
  if (error) {
    logErr('save-tx', error, { userId, chatId, amount, category });
    await bot.sendMessage(chatId, '⚠️ Bazaga yozishda xatolik. Keyinroq urinib ko\'ring.').catch(() => { });
    return null;
  }

  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved) {
    await bot.sendMessage(chatId, '⚠️ Tranzaksiya saqlanganini tasdiqlab bo\'lmadi.').catch(() => { });
    return null;
  }

  const ico = parsed.type === 'income' ? '🟢' : '🔴';
  const typ = parsed.type === 'income' ? 'Kirim' : 'Chiqim';
  const chk = receiptUrl ? '📸 Bor' : 'Yo\'q';

  const opts = { parse_mode: 'HTML' };
  if (replyId) opts.reply_to_message_id = replyId;

  await bot.sendMessage(chatId,
    `✅ <b>Saqlandi!</b>\n\n` +
    `${ico} <b>Turi:</b> ${typ}\n` +
    `💰 <b>Summa:</b> ${amtTxt}\n` +
    `📂 <b>Kategoriya:</b> ${esc(category)}\n` +
    `🧾 <b>Chek:</b> ${chk}`,
    opts
  ).catch(() => { });

  await sendCategoryLimitAlert(userId, chatId, category, amount, parsed.type);
  log('tx-saved', { userId, id: saved.id, type: saved.type, amount: saved.amount, category });
  return saved;
}

// ─── REPORT BUILDER ──────────────────────────────────────
function buildReport(rows, title) {
  const inc = rows.filter(r => r.type === 'income').reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const exp = rows.filter(r => r.type === 'expense').reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const bal = inc - exp;

  // Top 5 chiqim kategoriyalar
  const catMap = {};
  rows.filter(r => r.type === 'expense').forEach(r => {
    catMap[r.category] = (catMap[r.category] || 0) + (Number(r.amount) || 0);
  });
  const top = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c, v]) => `  · ${esc(c)}: <b>${numFmt(v)}</b>`)
    .join('\n');

  return `📊 <b>${esc(title)}</b>\n\n` +
    `📥 Kirim:  <b>+${numFmt(inc)} so'm</b>\n` +
    `📤 Chiqim: <b>-${numFmt(exp)} so'm</b>\n` +
    `━━━━━━━━━━━━\n` +
    `${bal >= 0 ? '🤑' : '💸'} Qoldiq: <b>${numFmt(bal)} so'm</b>` +
    (top ? `\n\n<b>Top kategoriyalar:</b>\n${top}` : '');
}

// ─── MAIN HANDLER ────────────────────────────────────────
module.exports = async (req, res) => {
  // Webhook sog'liqi tekshiruvi
  if (req.method !== 'POST') {
    return res.status(200).send('Kassa Bot ishlayapti 🚀');
  }

  try {
    const update = req.body || {};

    // ── Callback Query Handlers ──
    if (update.callback_query) {
      const q = update.callback_query;
      const userId = q.from.id;
      const data = q.data || '';
      const chatId = q.message.chat.id;
      const msgId = q.message.message_id;

      if (data.startsWith('bc_')) {
        const [action, bcId] = data.split(':');

        if (action === 'bc_cancel') {
          await bot.deleteMessage(chatId, msgId).catch(() => { });
          await bot.answerCallbackQuery(q.id, { text: 'Draft bekor qilindi' }).catch(() => { });
          await db.from('broadcasts').update({ status: 'cancelled' }).eq('id', bcId).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        const { data: bc, error: bErr } = await db.from('broadcasts').select('*').eq('id', bcId).maybeSingle();
        if (bErr || !bc) {
          await bot.answerCallbackQuery(q.id, { text: 'Broadcast topilmadi', show_alert: true }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        if (action === 'bc_send') {
          await bot.answerCallbackQuery(q.id, { text: 'Yuborish boshlandi...' }).catch(() => { });
          const progress = await bot.sendMessage(chatId, '⏳ Broadcast userlarga yuborilmoqda...').catch(() => null);
          try {
            const result = await sendBroadcastBatch(bc, { retryOnly: false });
            await safeEditOrSend(chatId, progress?.message_id, buildBroadcastResultText(bc, result, false), {
              parse_mode: 'HTML',
              reply_markup: buildBroadcastResultMarkup(bc, result)
            });
          } catch (e) {
            await safeEditOrSend(chatId, progress?.message_id, `⚠️ Broadcast yuborishda xatolik: ${esc(tgErr(e))}`, { parse_mode: 'HTML' });
          }
          return res.status(200).json({ ok: true });
        }

        if (action === 'bc_retry') {
          const { data: failedRows, error: frErr } = await db.from('broadcast_failures').select('user_id').eq('broadcast_id', bcId);
          if (frErr) {
            await bot.answerCallbackQuery(q.id, { text: "Xatolarni o'qishda muammo", show_alert: true }).catch(() => { });
            return res.status(200).json({ ok: true });
          }

          const ids = (failedRows || []).map(r => r.user_id);
          if (!ids.length) {
            await bot.answerCallbackQuery(q.id, { text: 'Qayta yuborish uchun user qolmagan', show_alert: true }).catch(() => { });
            return res.status(200).json({ ok: true });
          }

          await bot.answerCallbackQuery(q.id, { text: 'Qayta yuborish boshlandi...' }).catch(() => { });
          const progress = await bot.sendMessage(chatId, `🔁 ${ids.length} ta userga qayta yuborilyapti...`).catch(() => null);
          try {
            const result = await sendBroadcastBatch(bc, { targetUserIds: ids, retryOnly: true });
            await safeEditOrSend(chatId, progress?.message_id, buildBroadcastResultText(bc, result, true), {
              parse_mode: 'HTML',
              reply_markup: buildBroadcastResultMarkup(bc, result)
            });
          } catch (e) {
            await safeEditOrSend(chatId, progress?.message_id, `⚠️ Qayta yuborishda xatolik: ${esc(tgErr(e))}`, { parse_mode: 'HTML' });
          }
          return res.status(200).json({ ok: true });
        }

        if (action === 'bc_failed') {
          const { data: rows, error: frErr } = await db.from('broadcast_failures')
            .select('user_id, error_message, retry_count, created_at, last_retry_at')
            .eq('broadcast_id', bcId)
            .order('last_retry_at', { ascending: false })
            .limit(25);
          if (frErr) {
            await bot.answerCallbackQuery(q.id, { text: "Xatolar ro'yxatini olishda xatolik", show_alert: true }).catch(() => { });
            return res.status(200).json({ ok: true });
          }

          await safeEditOrSend(chatId, msgId, buildFailedTargetsText(bc, rows || []), {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔁 Qayta yuborish', callback_data: `bc_retry:${bc.id}` }],
                [{ text: '🛠 Admin panel', callback_data: 'admin_panel' }]
              ]
            }
          });
          return res.status(200).json({ ok: true });
        }
      }

      if (data.startsWith('admin_')) {
        if (!isAdmin(userId)) {
          await bot.answerCallbackQuery(q.id, { text: 'Admin emas', show_alert: true }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        await bot.answerCallbackQuery(q.id).catch(() => { });

        if (data === 'admin_panel' || data === 'admin_stats') {
          await sendAdminPanel(chatId, msgId);
          return res.status(200).json({ ok: true });
        }

        if (data === 'admin_users') {
          const [{ data: rows, error: uErr }, totalUsers] = await Promise.all([
            db.from('users').select('user_id, full_name, phone_number, created_at').order('created_at', { ascending: false }).limit(10),
            getExactCount(db.from('users').select('*', { count: 'exact', head: true }))
          ]);
          if (uErr) {
            await safeEditOrSend(chatId, msgId, `⚠️ Userlarni olishda xatolik: ${esc(uErr.message)}`, { parse_mode: 'HTML' });
            return res.status(200).json({ ok: true });
          }
          await safeEditOrSend(chatId, msgId, buildRecentUsersText(rows || [], totalUsers), { parse_mode: 'HTML', reply_markup: adminPanelMarkup() });
          return res.status(200).json({ ok: true });
        }

        if (data === 'admin_broadcasts') {
          const { data: rows, error } = await db.from('broadcasts')
            .select('id, status, total_users, sent_count, failed_count, created_at')
            .order('created_at', { ascending: false })
            .limit(8);
          if (error) {
            await safeEditOrSend(chatId, msgId, `⚠️ Broadcastlarni olishda xatolik: ${esc(error.message)}`, { parse_mode: 'HTML' });
            return res.status(200).json({ ok: true });
          }
          await safeEditOrSend(chatId, msgId, buildBroadcastsText(rows || []), { parse_mode: 'HTML', reply_markup: adminPanelMarkup() });
          return res.status(200).json({ ok: true });
        }

        if (data === 'admin_failed') {
          const { data: rows, error } = await db.from('broadcasts')
            .select('id, status, failed_count, created_at')
            .gt('failed_count', 0)
            .order('created_at', { ascending: false })
            .limit(8);
          if (error) {
            await safeEditOrSend(chatId, msgId, `⚠️ Xatoli broadcastlarni olishda xatolik: ${esc(error.message)}`, { parse_mode: 'HTML' });
            return res.status(200).json({ ok: true });
          }
          const rowsKb = (rows || []).slice(0, 5).map(b => [{ text: `👀 ${shortId(b.id)} · ${b.failed_count} ta`, callback_data: `bc_failed:${b.id}` }]);
          await safeEditOrSend(chatId, msgId, buildFailedBroadcastsText(rows || []), {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [...rowsKb, [{ text: '🛠 Admin panel', callback_data: 'admin_panel' }]] }
          });
          return res.status(200).json({ ok: true });
        }

        if (data === 'admin_help') {
          await safeEditOrSend(chatId, msgId, buildBroadcastGuideText(), { parse_mode: 'HTML', reply_markup: adminPanelMarkup() });
          return res.status(200).json({ ok: true });
        }
      }

      return res.status(200).json({ ok: true });
    }

    // ── Inline Query Handlers ──
    if (update.inline_query) {
      const q = update.inline_query;
      const text = q.query.trim();
      if (!text) return res.status(200).json({ ok: true });

      const parsed = parseText(text);
      if (!parsed) return res.status(200).json({ ok: true });

      const title = parsed.type === 'income' ? '🟢 Kirim' : '🔴 Chiqim';
      const amount = numFmt(parsed.amount);
      const cat = esc(parsed.category);

      const result = {
        type: 'article',
        id: 'tx_' + Date.now(),
        title: `${title}: ${amount} so'm`,
        description: `📂 Kategoriya: ${cat}${parsed.isUSD ? ' ($)' : ''}\n✨ Saqlash uchun bosing`,
        input_message_content: {
          message_text: `✅ <b>Kassa:</b> ${title}\n💰 <b>Summa:</b> ${amount} so'm\n📂 <b>Kategoriya:</b> ${cat}`,
          parse_mode: 'HTML'
        }
      };

      await bot.answerInlineQuery(q.id, [result], { cache_time: 0 }).catch(() => { });
      return res.status(200).json({ ok: true });
    }

    if (update.chosen_inline_result) {
      const cir = update.chosen_inline_result;
      const userId = cir.from.id;
      const query = cir.query;
      const parsed = parseText(query);
      if (parsed) {
        let { data: user } = await db.from('users').select('exchange_rate').eq('user_id', userId).maybeSingle();
        await saveTx(userId, userId, parsed, null, user?.exchange_rate || DEFAULT_RATE);
      }
      return res.status(200).json({ ok: true });
    }

    const msg = update.message;

    // Callback query va boshqa turdagi update'lar — e'tiborsiz
    if (!msg) return res.status(200).json({ ok: true });

    const chatId = msg.chat?.id;
    const userId = msg.from?.id;

    if (!chatId || !userId) return res.status(200).json({ ok: true });

    const text = (msg.text || msg.caption || '').trim();

    log('msg', {
      userId,
      chatId,
      type: msg.voice ? 'voice' : msg.photo ? 'photo' : msg.contact ? 'contact' : 'text',
    });

    // ── Foydalanuvchi ma'lumotlarini olish ──
    let { data: user, error: uErr } = await db
      .from('users').select('*').eq('user_id', userId).maybeSingle();
    if (uErr) warn('user-fetch', { userId, msg: uErr.message });

    // ── Telefon raqami ro'yxatdan o'tkazish ──
    if (msg.contact) {
      // Faqat o'z kontaktini yuborishga ruxsat
      if (msg.contact.user_id !== userId) return res.status(200).json({ ok: true });

      const { error: regErr } = await db.from('users').upsert({
        user_id: userId,
        phone_number: msg.contact.phone_number,
        full_name: `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim() || `User ${userId}`,
        last_start_date: iso(),
        exchange_rate: DEFAULT_RATE,
      }, { onConflict: 'user_id' });

      if (regErr) {
        logErr('reg', regErr, { userId });
        return res.status(200).json({ ok: false });
      }

      await bot.sendMessage(chatId,
        `🎉 <b>Ro'yxatdan o'tdingiz!</b>\n\nEndi kirim-chiqimlarni yozishingiz mumkin.\n\n${GUIDE}`,
        { reply_markup: KB, parse_mode: 'HTML' }
      ).catch(() => { });

      return res.status(200).json({ ok: true });
    }

    // ── Admin panel / broadcast buyruqlari ──
    if (text === '/admin') {
      if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '⛔️ Bu buyruq faqat adminlar uchun.').catch(() => { });
        return res.status(200).json({ ok: true });
      }

      try {
        await sendAdminPanel(chatId);
      } catch (e) {
        await bot.sendMessage(chatId, `⚠️ Admin panelni ochishda xatolik: ${esc(tgErr(e))}`, { parse_mode: 'HTML' }).catch(() => { });
      }
      return res.status(200).json({ ok: true });
    }

    // ── Admin Broadcast (/message ...) ──
    if (text.startsWith('/message')) {
      if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '⛔️ Bu buyruq faqat adminlar uchun.').catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const rawText = msg.text || msg.caption || '';
      const entities = msg.entities || msg.caption_entities || [];
      const parts = rawText.split(/\s*\n--\n\s*/);
      let broadcastText = parts[0].replace(/^\/message\s*/, '').trim();
      const prefixLen = rawText.indexOf(broadcastText);

      let reply_markup = null;
      if (parts[1]) {
        const lines = parts[1].split('\n').filter(l => l.includes('|'));
        if (lines.length > 0) {
          reply_markup = {
            inline_keyboard: lines.map(line => {
              const [btnText, btnUrl] = line.split('|').map(s => s.trim());
              return [{ text: btnText, url: btnUrl }];
            })
          };
        }
      }

      let shiftedEntities = null;
      if (entities && entities.length > 0) {
        shiftedEntities = entities
          .map(e => ({ ...e, offset: e.offset - prefixLen }))
          .filter(e => e.offset >= 0 && e.offset + e.length <= broadcastText.length);
      }

      let msgType = 'text';
      let mediaId = null;
      if (msg.photo) { msgType = 'photo'; mediaId = msg.photo[msg.photo.length - 1].file_id; }
      else if (msg.video) { msgType = 'video'; mediaId = msg.video.file_id; }
      else if (msg.animation) { msgType = 'animation'; mediaId = msg.animation.file_id; }
      else if (msg.document) { msgType = 'document'; mediaId = msg.document.file_id; }

      if (!broadcastText && !mediaId) {
        await bot.sendMessage(chatId, `⚠️ Broadcast bo'sh.\n\nMisol:\n<code>/message Assalomu alaykum\n--\nKanal | https://t.me/username</code>`, { parse_mode: 'HTML' }).catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const { data: draft, error: drErr } = await db.from('broadcasts').insert({
        admin_id: userId,
        status: 'draft',
        msg_type: msgType,
        content: broadcastText,
        media_id: mediaId,
        reply_markup,
        entities: shiftedEntities
      }).select().single();

      if (drErr) {
        logErr('draft-save', drErr);
        await bot.sendMessage(chatId, '⚠️ Draft saqlashda xatolik.').catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const previewMarkup = {
        inline_keyboard: [
          ...(reply_markup?.inline_keyboard || []),
          [{ text: '✅ Tasdiqlash', callback_data: `bc_send:${draft.id}` }, { text: '❌ Bekor qilish', callback_data: `bc_cancel:${draft.id}` }]
        ]
      };

      await bot.sendMessage(chatId, `📣 <b>BROADCAST PREVIEW</b>\nID: <code>${draft.id}</code>\n\nQuyidagi ko'rinish userlarga yuboriladi:`, { parse_mode: 'HTML' });

      if (msgType === 'photo') await bot.sendPhoto(chatId, mediaId, { caption: broadcastText, caption_entities: shiftedEntities, reply_markup: previewMarkup });
      else if (msgType === 'video') await bot.sendVideo(chatId, mediaId, { caption: broadcastText, caption_entities: shiftedEntities, reply_markup: previewMarkup });
      else if (msgType === 'animation') await bot.sendAnimation(chatId, mediaId, { caption: broadcastText, caption_entities: shiftedEntities, reply_markup: previewMarkup });
      else if (msgType === 'document') await bot.sendDocument(chatId, mediaId, { caption: broadcastText, caption_entities: shiftedEntities, reply_markup: previewMarkup });
      else await bot.sendMessage(chatId, broadcastText, { entities: shiftedEntities, reply_markup: previewMarkup });

      return res.status(200).json({ ok: true });
    }

    // ── Yangi foydalanuvchi — telefon so'rash ──
    if (!user) {
      await bot.sendMessage(chatId, `👋 Assalomu alaykum!\nBotdan foydalanish uchun telefon raqamingizni tasdiqlang.`, {
        reply_markup: {
          keyboard: [[{ text: '📱 Telefon raqamni yuborish', request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }
      ).catch(() => { });
      return res.status(200).json({ ok: true });
    }

    // ── /start ──
    if (text === '/start') {
      const now = new Date();
      const todayStr = now.toDateString();
      const lastStr = user.last_start_date ? new Date(user.last_start_date).toDateString() : null;
      const isNew = lastStr !== todayStr;

      const firstName = (user.full_name || 'Boshliq').split(' ')[0];
      const greeting = `Xush kelibsiz, <b>${esc(firstName)}</b>☺️!\nBemalol kirim yoki chiqim qilishingiz mumkin💸`;

      await bot.sendMessage(chatId, greeting, { reply_markup: KB, parse_mode: 'HTML' }).catch(() => { });

      if (isNew) {
        await db.from('users').update({ last_start_date: iso() }).eq('user_id', userId);
      }
      return res.status(200).json({ ok: true });
    }

    // ── Qo'llanma ──
    if (text === '❓ Qo\'llanma') {
      await bot.sendMessage(chatId, GUIDE, { parse_mode: 'HTML', reply_markup: KB }).catch(() => { });
      return res.status(200).json({ ok: true });
    }

    // ── Hisobotlar ──
    if (text === '📊 Bugungi Hisobot' || text === '📅 Oylik Hisobot') {
      const wait = await bot.sendMessage(chatId, '⏳ Hisobot tayyorlanmoqda...').catch(() => null);
      const now = new Date();
      let since, title;

      if (text.includes('Bugungi')) {
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        title = 'BUGUNGI HISOBOT';
      } else {
        since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        title = `${now.toLocaleString('uz-UZ', { month: 'long' }).toUpperCase()} OYI`;
      }

      const { data: rows, error: re } = await db
        .from('transactions')
        .select('type, amount, category')
        .eq('user_id', userId)
        .gte('date', since);

      if (re) {
        logErr('report', re, { userId });
        if (wait) await bot.editMessageText('⚠️ Hisobot chiqarishda xatolik.',
          { chat_id: chatId, message_id: wait.message_id }).catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const txt = rows?.length
        ? buildReport(rows, title)
        : `📊 <b>${esc(title)}</b>\n\nBu davr uchun ma'lumot topilmadi.`;

      if (wait) {
        await bot.editMessageText(txt, { chat_id: chatId, message_id: wait.message_id, parse_mode: 'HTML' }).catch(() => { });
      } else {
        await bot.sendMessage(chatId, txt, { parse_mode: 'HTML' }).catch(() => { });
      }

      log('report', { userId, title, count: rows?.length });
      return res.status(200).json({ ok: true });
    }

    // ── Oxirgisini o'chirish ──
    if (text === '↩️ Oxirgisini O\'chirish') {
      const wait = await bot.sendMessage(chatId, '⏳ Qidirilmoqda...').catch(() => null);

      const { data: last } = await db
        .from('transactions')
        .select('id, category, amount, type')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!last) {
        if (wait) await bot.editMessageText('⚠️ O\'chirish uchun operatsiya topilmadi.',
          { chat_id: chatId, message_id: wait.message_id }).catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const { error: de } = await db
        .from('transactions')
        .delete()
        .eq('id', last.id)
        .eq('user_id', userId);

      if (de) {
        logErr('del-last', de, { userId });
        if (wait) await bot.editMessageText('⚠️ O\'chirishda xatolik.',
          { chat_id: chatId, message_id: wait.message_id }).catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const ico = last.type === 'income' ? '🟢' : '🔴';
      if (wait) {
        await bot.editMessageText(
          `🗑 <b>O'chirildi!</b>\n\n${ico} ${esc(last.category)}\n💰 ${numFmt(last.amount)} so'm`,
          { chat_id: chatId, message_id: wait.message_id, parse_mode: 'HTML' }
        ).catch(() => { });
      }

      log('del-last', { userId, id: last.id, category: last.category });
      return res.status(200).json({ ok: true });
    }

    // ── Aqlli intentlar: qarz qaytishi, qarz yaratish va reja ──
    if (text) {
      const debtSettlementIntent = parseDebtSettlementIntent(text);
      if (debtSettlementIntent) {
        try {
          const result = await saveDebtSettlementIntent(userId, chatId, debtSettlementIntent);
          if (result?.handled) return res.status(200).json({ ok: true });
        } catch (error) {
          logErr('debt-settlement-intent', error, { userId, text });
          await bot.sendMessage(chatId, `⚠️ Qarz qaytishini qayta ishlashda xatolik: ${esc(error.message || "noma'lum")}`, { parse_mode: 'HTML' }).catch(() => null);
          return res.status(200).json({ ok: true });
        }
      }

      const debtIntent = parseDebtIntent(text);
      if (debtIntent) {
        try {
          await saveDebtIntent(userId, chatId, debtIntent);
          return res.status(200).json({ ok: true });
        } catch (error) {
          logErr('debt-intent', error, { userId, text });
          await bot.sendMessage(chatId, `⚠️ Qarzni saqlashda xatolik: ${esc(error.message || "noma'lum")}`, { parse_mode: 'HTML' }).catch(() => null);
          return res.status(200).json({ ok: true });
        }
      }

      const planIntent = parsePlanIntent(text);
      if (planIntent) {
        try {
          await savePlanIntent(userId, chatId, planIntent);
          return res.status(200).json({ ok: true });
        } catch (error) {
          logErr('plan-intent', error, { userId, text });
          await bot.sendMessage(chatId, `⚠️ Rejani saqlashda xatolik: ${esc(error.message || "noma'lum")}`, { parse_mode: 'HTML' }).catch(() => null);
          return res.status(200).json({ ok: true });
        }
      }
    }

    // ── Ovozli xabar ──
    if (msg.voice) {
      const proc = await bot.sendMessage(chatId, '🎙 Ovozli xabar qabul qilindi...').catch(() => null);
      const tmpPath = path.join('/tmp', `voice_${userId}_${Date.now()}.ogg`);

      try {
        if (!openai) throw new Error('OpenAI configured emas');

        if (proc) await bot.editMessageText('⏳ Ovoz tahlil qilinmoqda (Whisper)...', { chat_id: chatId, message_id: proc.message_id }).catch(() => { });

        const fileLink = await bot.getFileLink(msg.voice.file_id);
        const resp = await axios({ url: fileLink, method: 'GET', responseType: 'stream', timeout: 30000 });
        const writer = fs.createWriteStream(tmpPath);
        resp.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        // Whisper transcription
        const tr = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tmpPath),
          model: 'whisper-1',
          language: 'uz',
        });

        const spoken = (tr.text || '').trim();
        if (!spoken) {
          if (proc) await bot.editMessageText('❌ Ovoz matnga aylanmadi. Qaytadan aniqroq gapirib ko\'ring.', { chat_id: chatId, message_id: proc.message_id }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        log('voice-text', { userId, spoken });

        if (proc) await bot.editMessageText(`📝 <b>Eshitdim:</b> "${esc(spoken)}"\n⏳ Tahlil qilinmoqda...`, { chat_id: chatId, message_id: proc.message_id, parse_mode: 'HTML' }).catch(() => { });

        // Intent parsing (GPT first, then regex)
        let parsed = await gptParse(spoken);
        if (!parsed) parsed = parseText(spoken);

        if (!parsed) {
          if (proc) await bot.editMessageText(`🤷 <b>Tushundim:</b> "${esc(spoken)}"\n\nLekin moliyaviy ma'lumot topa olmadim.\n<i>Masalan: "Taksiga 20 ming berdim" deb ayting.</i>`, { chat_id: chatId, message_id: proc.message_id, parse_mode: 'HTML' }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        if (proc) await bot.deleteMessage(chatId, proc.message_id).catch(() => { });

        await saveTx(userId, chatId, parsed, null, user.exchange_rate, msg.message_id, spoken);

      } catch (e) {
        logErr('voice', e, { userId });
        if (proc) await bot.editMessageText('😕 Ovozli xabarni qayta ishlashda xatolik yuz berdi. Matn orqali yozib yuboring.', { chat_id: chatId, message_id: proc.message_id }).catch(() => { });
      } finally {
        if (fs.existsSync(tmpPath)) fs.unlink(tmpPath, () => { });
      }
      return res.status(200).json({ ok: true });
    }

    // ── Matn (rasm bilan yoki yolg'iz) ──
    let parsed = parseText(text);

    // Agar regex matnni taniy olmasa va OpenAI bo'lsa, GPT dan so'rab ko'ramiz
    if (!parsed && text.length > 5 && openai) {
      parsed = await gptParse(text);
    }

    if (parsed) {
      let receiptUrl = null;

      if (msg.photo) {
        const procMsg = await bot.sendMessage(chatId, '📸 Chek rasmini yuklanmoqda...').catch(() => null);
        try {
          const photoId = msg.photo[msg.photo.length - 1].file_id;
          const fileLink = await bot.getFileLink(photoId);
          const resp = await axios({ url: fileLink, method: 'GET', responseType: 'arraybuffer', timeout: 30000 });
          const fileName = `${userId}/${Date.now()}.jpg`;

          const { error: upErr } = await db.storage
            .from('receipts')
            .upload(fileName, Buffer.from(resp.data), { contentType: 'image/jpeg' });

          if (upErr) throw upErr;

          const { data: ud } = db.storage.from('receipts').getPublicUrl(fileName);
          receiptUrl = ud.publicUrl;

          if (procMsg) await bot.deleteMessage(chatId, procMsg.message_id).catch(() => { });
          log('photo-uploaded', { userId, fileName });
        } catch (e) {
          logErr('photo', e, { userId });
          if (procMsg) {
            await bot.editMessageText(
              '⚠️ Rasmni saqlashda xatolik.\nTranzaksiya yoziladi, chekni ilovadan qo\'shishingiz mumkin.',
              { chat_id: chatId, message_id: procMsg.message_id }
            ).catch(() => { });
          }
        }
      }

      await saveTx(userId, chatId, parsed, receiptUrl, user.exchange_rate, msg.message_id, text);
      return res.status(200).json({ ok: true });
    }

    // ── Rasm matnsiz yuborilgan ──
    if (msg.photo && !parsed) {
      await bot.sendMessage(chatId,
        '⚠️ Rasm tagiga summa va izoh yozishni unutdingiz.\n\n<i>Masalan: 50 ming tushlik</i>',
        { parse_mode: 'HTML' }
      ).catch(() => { });
      return res.status(200).json({ ok: true });
    }

    // ── Tushunilmagan matn ──
    if (text && text !== '/start') {
      await bot.sendMessage(chatId,
        `Tushunmadim 🤔\n\n${GUIDE}`,
        { parse_mode: 'HTML', reply_markup: KB }
      ).catch(() => { });
    }

    return res.status(200).json({ ok: true });

  } catch (e) {
    logErr('handler', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
