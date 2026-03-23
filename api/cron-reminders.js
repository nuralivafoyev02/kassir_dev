'use strict';

const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const UZ_OFFSET_MS = 5 * 60 * 60 * 1000;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN yo'q");
if (!SUPA_URL) throw new Error("SUPABASE_URL yo'q");
if (!SUPA_KEY) throw new Error("SUPABASE_KEY yo'q");

const bot = new TelegramBot(BOT_TOKEN, { polling: false });
const db = createClient(SUPA_URL, SUPA_KEY);

function relationMissing(error, table) {
  const msg = String(error?.message || error?.details || '').toLowerCase();
  return msg.includes(`table '${table}'`) || msg.includes(`relation \"public.${table}\"`) || msg.includes('does not exist');
}

function missingColumn(error, column) {
  const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const target = String(column || '').toLowerCase();
  return !!target && msg.includes(target) && (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('unknown column') || msg.includes('could not find the column'));
}

function dueTarget(debt) {
  return debt.remind_at || debt.due_at || null;
}

function uzDateKey(value = Date.now()) {
  const d = new Date(new Date(value).getTime() + UZ_OFFSET_MS);
  return d.toISOString().slice(0, 10);
}

function toUzDateTime(value) {
  if (!value) return 'belgilangan vaqt';
  try {
    return new Date(value).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
  } catch {
    return new Date(value).toLocaleString('uz-UZ');
  }
}

function buildDailyReminderText(fullName = '') {
  const greetingName = String(fullName || '').trim();
  const safeName = greetingName ? `, <b>${greetingName}</b>` : '';
  return `🌤 <b>Assalamu aleykum${safeName}</b>

Bugungi xarajatlarni kiritib borishni unutmang.
💸 Kirim, chiqim, qarz va rejalaringizni yozsangiz — men ularni tartibli saqlab boraman.

🤝 <i>24/7 xizmatingizda man!</i>`;
}

async function fetchUsersForDailyReminder(todayKey) {
  let res = await db
    .from('users')
    .select('user_id, full_name, daily_reminder_enabled, last_daily_reminder_at')
    .or(`last_daily_reminder_at.is.null,last_daily_reminder_at.lt.${todayKey}T00:00:00.000Z`)
    .limit(1000);

  if (res.error && missingColumn(res.error, 'daily_reminder_enabled')) {
    res = await db
      .from('users')
      .select('user_id, full_name, last_daily_reminder_at')
      .or(`last_daily_reminder_at.is.null,last_daily_reminder_at.lt.${todayKey}T00:00:00.000Z`)
      .limit(1000);
  }

  if (res.error && missingColumn(res.error, 'last_daily_reminder_at')) {
    res = await db
      .from('users')
      .select('user_id, full_name')
      .limit(1000);
  }

  return res;
}

async function markDailyReminderSent(userId, nowIso) {
  let result = await db.from('users').update({ last_daily_reminder_at: nowIso }).eq('user_id', userId);
  if (result.error && missingColumn(result.error, 'last_daily_reminder_at')) {
    return { error: null };
  }
  return result;
}

async function processDailyReminders(nowIso) {
  const todayKey = uzDateKey(nowIso);
  const { data, error } = await fetchUsersForDailyReminder(todayKey);

  if (error) {
    if (relationMissing(error, 'users')) {
      return { checked: 0, sent: 0, failed: [], skipped: 'users table missing' };
    }
    throw error;
  }

  const rows = (data || []).filter((row) => row && row.user_id && row.daily_reminder_enabled !== false);
  let sent = 0;
  const failed = [];

  for (const row of rows) {
    try {
      await bot.sendMessage(row.user_id, buildDailyReminderText(row.full_name), { parse_mode: 'HTML' });
      await markDailyReminderSent(row.user_id, nowIso);
      sent += 1;
    } catch (err) {
      failed.push({ user_id: row.user_id, error: err?.message || 'send failed' });
    }
  }

  return { checked: rows.length, sent, failed, todayKey };
}

async function processDebtReminders(now) {
  const nowIso = now.toISOString();
  const { data, error } = await db
    .from('debts')
    .select('id, user_id, person_name, amount, direction, due_at, remind_at, note, reminder_sent_at, status')
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .limit(300);

  if (error) {
    if (relationMissing(error, 'debts')) {
      return { checked: 0, due: 0, sent: 0, failed: [], skipped: 'debts table missing' };
    }
    throw error;
  }

  const dueItems = (data || []).filter((debt) => {
    if (debt.status !== 'open') return false;
    if (debt.reminder_sent_at) return false;
    const target = dueTarget(debt);
    if (!target) return false;
    const ts = new Date(target).getTime();
    return Number.isFinite(ts) && ts <= now.getTime();
  });

  let sent = 0;
  const failed = [];

  for (const debt of dueItems) {
    const target = dueTarget(debt);
    const targetDate = target ? new Date(target) : null;
    const dayLabel = targetDate && uzDateKey(targetDate) === uzDateKey(now)
      ? 'Bugun'
      : 'Eslatma';
    const direction = debt.direction === 'payable' ? 'Siz qaytarishingiz kerak' : 'Sizga qaytishi kerak';
    const when = targetDate ? toUzDateTime(targetDate) : 'belgilangan vaqt';
    const text = `⏰ <b>Qarz eslatmasi</b>

${dayLabel} <b>${debt.person_name}</b> bilan bog'liq qarz vaqti yetdi.
💰 ${Number(debt.amount || 0).toLocaleString('ru-RU')} so'm
📌 ${direction}
🕒 ${when}${debt.note ? `
📝 ${debt.note}` : ''}`;

    try {
      await bot.sendMessage(debt.user_id, text, { parse_mode: 'HTML' });
      await db.from('debts').update({ reminder_sent_at: nowIso }).eq('id', debt.id).eq('user_id', debt.user_id);
      sent += 1;
    } catch (err) {
      failed.push({ id: debt.id, user_id: debt.user_id, error: err?.message || 'send failed' });
    }
  }

  return { checked: (data || []).length, due: dueItems.length, sent, failed };
}

module.exports = async (req, res) => {
  try {
    const auth = req.headers?.authorization || req.headers?.Authorization || '';
    if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const [daily, debts] = await Promise.all([
      processDailyReminders(nowIso),
      processDebtReminders(now),
    ]);

    return res.status(200).json({
      ok: true,
      at: nowIso,
      daily,
      debts,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || String(error) });
  }
};
