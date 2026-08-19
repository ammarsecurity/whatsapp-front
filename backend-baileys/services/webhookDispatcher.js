const crypto = require('crypto');
const Webhook = require('../models/Webhook');

async function dispatch(userId, event, payload) {
  let hooks;
  try {
    hooks = await Webhook.findEnabledForEvent(userId, event);
  } catch (err) {
    console.error('Webhook lookup failed:', err.message);
    return;
  }

  for (const hook of hooks) {
    fireWebhook(hook, event, payload).catch((err) => {
      console.error(`Webhook ${hook.id} failed:`, err.message);
    });
  }
}

async function fireWebhook(hook, event, payload) {
  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'WhatsApp-Console-Webhook/1.0',
    'X-Webhook-Event': event,
  };

  if (hook.secret) {
    const sig = crypto.createHmac('sha256', hook.secret).update(body).digest('hex');
    headers['X-Webhook-Signature'] = sig;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`Webhook ${hook.id} HTTP ${res.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { dispatch };
