const axios = require('axios');

const token = process.env.BOT_TOKEN;
const adminSecret = process.env.ADMIN_SECRET || process.env.BOT_WEBHOOK_ADMIN_SECRET || '';
const webhookSecret = process.env.BOT_WEBHOOK_SECRET || '';
const explicitWebhookUrl = process.env.WEBHOOK_URL || '';

function buildWebhookUrl(req) {
  if (explicitWebhookUrl) return explicitWebhookUrl;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}/api/bot`;
}

async function callTelegram(method, payload = {}) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const { data } = await axios.post(url, payload, { timeout: Number(process.env.TELEGRAM_TIMEOUT_MS || 30000) });
  return data;
}

module.exports = async (req, res) => {
  try {
    if (!token) return res.status(500).json({ ok: false, error: 'BOT_TOKEN is required' });

    const providedSecret = req.query.secret || req.headers['x-admin-secret'];
    if (!adminSecret || providedSecret !== adminSecret) {
      return res.status(401).json({ ok: false, error: 'Invalid admin secret' });
    }

    const action = String(req.query.action || 'status').toLowerCase();

    if (action === 'status') {
      const data = await callTelegram('getWebhookInfo');
      return res.status(200).json(data);
    }

    if (action === 'delete') {
      const data = await callTelegram('deleteWebhook', { drop_pending_updates: false });
      return res.status(200).json(data);
    }

    if (action === 'set') {
      const webhookUrl = buildWebhookUrl(req);
      if (!/^https:\/\//i.test(webhookUrl)) {
        return res.status(400).json({ ok: false, error: 'Webhook URL https bilan boshlanishi kerak', webhookUrl });
      }
      const payload = {
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false
      };
      if (webhookSecret) payload.secret_token = webhookSecret;
      const data = await callTelegram('setWebhook', payload);
      return res.status(200).json({ ...data, webhookUrl });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (error) {
    console.error('Webhook error:', error?.response?.data || error.message);
    return res.status(500).json({ ok: false, error: error?.response?.data || error.message });
  }
};
