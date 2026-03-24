'use strict';

const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const TASHKENT_TIME_ZONE = 'Asia/Tashkent';

if (!BOT_TOKEN) throw new Error("BOT_TOKEN yo'q");
if (!SUPA_URL) throw new Error("SUPABASE_URL yo'q");
if (!SUPA_KEY) throw new Error("SUPABASE_KEY yo'q");

const bot = new TelegramBot(BOT_TOKEN, { polling: false });
const db = createClient(SUPA_URL, SUPA_KEY);

function relationMissing(error, table) {
  const msg = String(error?.message || error?.details || '').toLowerCase();
  const target = String(table || '').toLowerCase();
  return !!target && msg.includes(target) && (
    msg.includes('could not find the table') ||
    msg.includes('relation "public.') ||
    msg.includes('relation "') ||
    msg.includes('does not exist')
  );
}

function missingColumn(error, column) {
  const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const target = String(column || '').toLowerCase();
  return !!target && msg.includes(target) && (
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('unknown column') ||
    msg.includes('could not find the column')
  );
}

function getTashkentParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TASHKENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value));

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year || 0),
    month: Number(map.month || 0),
    day: Number(map.day || 0),
    hour: Number(map.hour || 0),
    minute: Number(map.minute || 0),
    second: Number(map.second || 0),
  };
}

function uzDateKey(value = new Date()) {
  const p = getTashkentParts(value);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function uzDayStartUtcIso(value = new Date()) {
  const p = getTashkentParts(value);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, -5, 0, 0, 0)).toISOString();
}

function isDailyReminderWindow(value = new Date()) {
  const p = getTashkentParts(value);
  return p.hour === 9 && p.minute < 5;
}

function dueTarget(debt) {
  return debt.remind_at || debt.due_at || null;
}

function toUzDateTime(value) {
  if (!value) return 'belgilangan vaqt';
  try {
    return new Date(value).toLocaleString('uz-UZ', { timeZone: TASHKENT_TIME_ZONE });
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

async function fetchUsersForDailyReminder(dayStartIso) {
  let res = await db
    .from('users')
    .select('user_id, full_name, daily_reminder_enabled, last_daily_reminder_at')
    .or(`last_daily_reminder_at.is.null,last_daily_reminder_at.lt.${dayStartIso}`)
    .limit(1000);

  if (res.error && missingColumn(res.error, 'daily_reminder_enabled')) {
    res = await db
      .from('users')
      .select('user_id, full_name, last_daily_reminder_at')
      .or(`last_daily_reminder_at.is.null,last_daily_reminder_at.lt.${dayStartIso}`)
      .limit(1000);
  }

  if (res.error && missingColumn(res.error, 'last_daily_reminder_at')) {
    return { data: [], error: null, skipped: 'users.last_daily_reminder_at missing' };
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

async function processDailyReminders(now) {
  const result = {
    checked: 0,
    sent: 0,
    failed: [],
    todayKey: uzDateKey(now),
    scheduled_for: '09:00 Asia/Tashkent',
    window_open: isDailyReminderWindow(now),
  };

  if (!result.window_open) {
    result.note = 'outside daily reminder window';
    return result;
  }

  const nowIso = now.toISOString();
  const dayStartIso = uzDayStartUtcIso(now);
  const { data, error, skipped } = await fetchUsersForDailyReminder(dayStartIso);

  if (skipped) {
    result.note = skipped;
    return result;
  }

  if (error) {
    if (relationMissing(error, 'users')) {
      result.note = 'users table missing';
      return result;
    }
    throw error;
  }

  const rows = (data || []).filter((row) => row && row.user_id && row.daily_reminder_enabled !== false);
  result.checked = rows.length;

  for (const row of rows) {
    try {
      await bot.sendMessage(row.user_id, buildDailyReminderText(row.full_name), { parse_mode: 'HTML' });
      await markDailyReminderSent(row.user_id, nowIso);
      result.sent += 1;
    } catch (err) {
      result.failed.push({ user_id: row.user_id, error: err?.message || 'send failed' });
    }
  }

  return result;
}

async function processDebtReminders(now) {
  const nowIso = now.toISOString();
  const { data, error } = await db
    .from('debts')
    .select('id, user_id, person_name, amount, direction, due_at, remind_at, note, reminder_sent_at, status, created_at')
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .limit(300);

  if (error) {
    if (relationMissing(error, 'debts')) {
      return { checked: 0, due: 0, sent: 0, failed: [], note: 'debts table missing' };
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
    const [daily, debts] = await Promise.all([
      processDailyReminders(now),
      processDebtReminders(now),
    ]);

    return res.status(200).json({
      ok: true,
      at: now.toISOString(),
      daily,
      debts,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || String(error) });
  }
};
