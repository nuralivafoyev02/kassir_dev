
'use strict';

const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN yo'q");
if (!SUPA_URL) throw new Error("SUPABASE_URL yo'q");
if (!SUPA_KEY) throw new Error("SUPABASE_KEY yo'q");

const bot = new TelegramBot(BOT_TOKEN, { polling: false });
const db = createClient(SUPA_URL, SUPA_KEY);

module.exports = async (req, res) => {
  try {
    const auth = req.headers?.authorization || req.headers?.Authorization || '';
    if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await db
      .from('debts')
      .select('id, user_id, person_name, amount, direction, due_at, note, reminder_sent_at, status')
      .eq('status', 'open')
      .lte('remind_at', nowIso)
      .is('reminder_sent_at', null)
      .order('remind_at', { ascending: true })
      .limit(100);

    if (error) return res.status(500).json({ ok: false, error: error.message });

    let sent = 0;
    const failed = [];

    for (const debt of data || []) {
      const direction = debt.direction === 'payable' ? 'Siz berishingiz kerak' : 'Sizga qaytishi kerak';
      const when = debt.due_at ? new Date(debt.due_at).toLocaleString('uz-UZ') : 'belgilangan vaqt';
      const text = `⏰ <b>Qarz eslatmasi</b>

👤 ${debt.person_name}
💰 ${Number(debt.amount || 0).toLocaleString('ru-RU')} so'm
📌 ${direction}
🕒 ${when}${debt.note ? `
📝 ${debt.note}` : ''}`;
      try {
        await bot.sendMessage(debt.user_id, text, { parse_mode: 'HTML' });
        await db.from('debts').update({ reminder_sent_at: nowIso }).eq('id', debt.id);
        sent += 1;
      } catch (err) {
        failed.push({ id: debt.id, error: err.message || 'send failed' });
      }
    }

    return res.status(200).json({ ok: true, checked: (data || []).length, sent, failed });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || String(error) });
  }
};
