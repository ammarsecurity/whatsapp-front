const PaymentGatewaySettings = require('../../models/PaymentGatewaySettings');
const PaymentTransaction = require('../../models/PaymentTransaction');
const BillingOrder = require('../../models/BillingOrder');
const { hmacSha256Hex, timingSafeEqual } = require('./secretProtector');
const { sendJson, frontendUrl, apiPublicUrl } = require('./http');

const MINIMUM_IQD = 1000;

function suggestedWebhookUrl() {
  return `${apiPublicUrl()}/api/payments/webhook`;
}

function suggestedRedirectUrl() {
  return `${frontendUrl()}/billing?waylReturn=1`;
}

async function getSettings() {
  return PaymentGatewaySettings.getOrCreate('Wayl');
}

function secrets(settings) {
  return PaymentGatewaySettings.secrets(settings);
}

function isEnabled(settings) {
  const s = secrets(settings);
  return !!(settings?.isEnabled && s.apiKey && s.webhookSecret);
}

function verifyWebhook(rawBody, signatureHeader, webhookSecret) {
  if (!webhookSecret) return false;
  const header = String(signatureHeader || '').trim();
  if (header) {
    const provided = header.toLowerCase().startsWith('sha256=')
      ? header.slice(7).trim()
      : header;
    const expected = hmacSha256Hex(webhookSecret, rawBody);
    if (timingSafeEqual(expected, provided.toLowerCase())) return true;
    if (timingSafeEqual(webhookSecret, header)) return true;
  }
  try {
    const parsed = JSON.parse(rawBody || '{}');
    if (parsed.webhookSecret && timingSafeEqual(parsed.webhookSecret, webhookSecret)) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

async function send(settings, method, path, body) {
  const { apiKey } = secrets(settings);
  if (!apiKey) throw new Error('Wayl API key is not configured.');
  return sendJson({
    baseUrl: settings.baseUrl || 'https://api.thewayl.com',
    path,
    method,
    headers: { 'X-WAYL-AUTHENTICATION': apiKey },
    body,
  });
}

async function createPayment(order) {
  const settings = await getSettings();
  if (!isEnabled(settings)) throw new Error('Wayl payments are not enabled or configured.');
  const amount = Math.max(MINIMUM_IQD, parseInt(order.amountIqd, 10) || 0);
  const referenceId = order.referenceId;
  const { webhookSecret } = secrets(settings);
  const webhookUrl = settings.webhookUrl || suggestedWebhookUrl();
  const redirectUrl = `${frontendUrl()}/billing?waylReturn=1&orderId=${order.id}&referenceId=${encodeURIComponent(referenceId)}`;
  const payload = {
    env: settings.environment === 'live' ? 'live' : 'test',
    referenceId,
    total: amount,
    currency: 'IQD',
    customParameter: String(order.id),
    lineItem: [{ label: order.planName || 'WhatsApp account', amount, type: 'increase' }],
    webhookUrl,
    webhookSecret,
    redirectionUrl: redirectUrl,
  };
  const res = await send(settings, 'POST', '/api/v1/links', payload);
  const data = res.json?.data || res.json;
  const url = data?.url || data?.Url;
  if (!res.ok || !url) {
    throw new Error(res.json?.message || 'Wayl did not return a payment URL.');
  }
  await PaymentTransaction.upsert({
    billingOrderId: order.id,
    gateway: 'Wayl',
    referenceId,
    externalId: data?.id || data?.Id || null,
    amountIqd: amount,
    status: data?.status || 'Created',
    rawPayload: res.json,
  });
  return { paymentUrl: url, referenceId, status: data?.status || 'Created' };
}

async function getStatus(referenceId) {
  const settings = await getSettings();
  const res = await send(settings, 'GET', `/api/v1/links/${encodeURIComponent(referenceId)}`);
  const data = res.json?.data || res.json || {};
  const status = data.status || data.Status || '';
  const paid = String(status).toLowerCase() === 'complete';
  return { paid, status, data, ok: res.ok };
}

async function handleWebhook(rawBody, signatureHeader) {
  const settings = await getSettings();
  const testSecret = PaymentGatewaySettings.secrets(settings, 'test').webhookSecret;
  const liveSecret = PaymentGatewaySettings.secrets(settings, 'live').webhookSecret;
  if (!testSecret && !liveSecret) {
    throw Object.assign(new Error('Webhook secret is not configured.'), { status: 400 });
  }
  const verified =
    (testSecret && verifyWebhook(rawBody, signatureHeader, testSecret))
    || (liveSecret && verifyWebhook(rawBody, signatureHeader, liveSecret));
  if (!verified) {
    throw Object.assign(new Error('Invalid webhook secret.'), { status: 401 });
  }
  let payload;
  try {
    payload = JSON.parse(rawBody || '{}');
  } catch {
    throw Object.assign(new Error('Invalid webhook payload.'), { status: 400 });
  }
  const referenceId = String(payload.referenceId || payload.ReferenceId || '').trim();
  if (!referenceId) return { ok: true, ignored: true };
  const live = await getStatus(referenceId);
  const order = await BillingOrder.findByReference(referenceId);
  if (!order) return { ok: true, ignored: true };
  await PaymentTransaction.upsert({
    billingOrderId: order.id,
    gateway: 'Wayl',
    referenceId,
    externalId: live.data?.id || null,
    amountIqd: order.amountIqd,
    status: live.status || payload.status,
    rawPayload: live.data || payload,
  });
  if (live.paid) {
    await require('./billingService').fulfillPaidOrder(order);
  } else if (['failed', 'cancelled', 'canceled', 'expired'].includes(String(live.status).toLowerCase())) {
    await BillingOrder.markStatus(order.id, 'Failed');
  }
  return { ok: true, paid: live.paid };
}

async function testConnection(apiKey, baseUrl) {
  const url = (baseUrl || 'https://api.thewayl.com').replace(/\/$/, '');
  const res = await sendJson({
    baseUrl: url,
    path: '/api/v1/links/health-check-placeholder',
    method: 'GET',
    headers: { 'X-WAYL-AUTHENTICATION': apiKey },
  });
  return res.status !== 401 && res.status !== 403;
}

module.exports = {
  MINIMUM_IQD,
  getSettings,
  isEnabled,
  createPayment,
  getStatus,
  handleWebhook,
  suggestedWebhookUrl,
  suggestedRedirectUrl,
  testConnection,
};
