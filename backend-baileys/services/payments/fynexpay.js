const PaymentGatewaySettings = require('../../models/PaymentGatewaySettings');
const PaymentTransaction = require('../../models/PaymentTransaction');
const BillingOrder = require('../../models/BillingOrder');
const { hmacSha256Hex, timingSafeEqual } = require('./secretProtector');
const { sendJson, frontendUrl, isOnFrontendDomain } = require('./http');

const MINIMUM_IQD = 250;
const GATEWAY = 'FynexPay';

function suggestedWebhookUrl() {
  // FynexPay requires callback URLs on the approved frontend domain (not the API subdomain).
  return `${frontendUrl()}/api/payments/fynexpay/webhook`;
}

function resolveCallbackUrl(settings) {
  const suggested = suggestedWebhookUrl();
  const saved = settings?.webhookUrl;
  if (saved && isOnFrontendDomain(saved)) return saved;
  return suggested;
}

function suggestedRedirectUrl() {
  return `${frontendUrl()}/billing?fynexpayReturn=1`;
}

async function getSettings() {
  return PaymentGatewaySettings.getOrCreate('FynexPay');
}

function secrets(settings) {
  return PaymentGatewaySettings.secrets(settings);
}

function isEnabled(settings) {
  const s = secrets(settings);
  return !!(settings?.isEnabled && s.apiKey && s.merchantToken && s.webhookSecret);
}

function normalizeBearer(raw) {
  let token = String(raw || '').trim();
  if (token.toLowerCase().startsWith('bearer ')) token = token.slice(7).trim();
  return token;
}

function isPaid(status) {
  return String(status || '').toLowerCase() === 'paid';
}

function verifyWebhook(rawBody, signatureHeader, webhookSecret) {
  if (!webhookSecret || !signatureHeader) return false;
  let provided = String(signatureHeader).trim();
  if (provided.toLowerCase().startsWith('sha256=')) provided = provided.slice(7).trim();
  const expected = hmacSha256Hex(webhookSecret, rawBody);
  return timingSafeEqual(expected, provided.toLowerCase());
}

async function send(settings, method, path, body, idempotencyKey) {
  const s = secrets(settings);
  if (!s.apiKey) throw new Error('FynexPay platform API key is not configured.');
  if (!s.merchantToken) throw new Error('FynexPay merchant Bearer token is not configured.');
  return sendJson({
    baseUrl: settings.baseUrl || 'https://api.fynexpay.net',
    path,
    method,
    headers: {
      Authorization: `Bearer ${normalizeBearer(s.merchantToken)}`,
      'X-Api-Key': s.apiKey.trim(),
      Origin: frontendUrl(),
      ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
    },
    body,
  });
}

async function createPayment(order) {
  const settings = await getSettings();
  if (!isEnabled(settings)) throw new Error('FynexPay payments are not enabled or configured.');
  const amount = Math.max(MINIMUM_IQD, parseInt(order.amountIqd, 10) || 0);
  const referenceId = order.referenceId;
  const successUrl = `${frontendUrl()}/billing?fynexpayReturn=1&orderId=${order.id}&referenceId=${encodeURIComponent(referenceId)}`;
  const failureUrl = `${frontendUrl()}/billing?fynexpayReturn=1&failed=1&orderId=${order.id}`;
  const payload = {
    amount,
    serviceType: 'whatsapp',
    orderId: referenceId,
    callbackUrl: resolveCallbackUrl(settings),
    successUrl,
    failureUrl,
  };
  const res = await send(settings, 'POST', '/v1/payments', payload, referenceId);
  const data = res.json?.data || res.json || {};
  const url = data.checkoutUrl || data.CheckoutUrl;
  if (!res.ok || !url) {
    throw new Error(res.json?.message || 'FynexPay did not return a checkout URL.');
  }
  await PaymentTransaction.upsert({
    billingOrderId: order.id,
    gateway: GATEWAY,
    referenceId,
    externalId: data.id || data.Id || null,
    amountIqd: amount,
    status: data.status || 'Pending',
    rawPayload: res.json,
  });
  return { paymentUrl: url, referenceId, status: data.status || 'Pending' };
}

async function getStatus(paymentId) {
  const settings = await getSettings();
  const res = await send(settings, 'GET', `/v1/payments/${encodeURIComponent(paymentId)}`);
  const data = res.json?.data || res.json || {};
  return { paid: isPaid(data.status), status: data.status || '', data, ok: res.ok };
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
    throw Object.assign(new Error('Invalid webhook signature.'), { status: 401 });
  }
  let payload;
  try {
    payload = JSON.parse(rawBody || '{}');
  } catch {
    throw Object.assign(new Error('Invalid webhook payload.'), { status: 400 });
  }
  const paymentId = payload.id || payload.Id;
  let live = payload;
  if (paymentId) {
    const remote = await getStatus(paymentId);
    if (remote.data) live = remote.data;
  }
  const referenceId = String(live.orderId || live.OrderId || payload.orderId || '').trim();
  if (!referenceId) return { ok: true, ignored: true };
  const order = await BillingOrder.findByReference(referenceId);
  if (!order) return { ok: true, ignored: true };
  const status = live.status || payload.status;
  await PaymentTransaction.upsert({
    billingOrderId: order.id,
    gateway: GATEWAY,
    referenceId,
    externalId: live.id || paymentId || null,
    amountIqd: order.amountIqd,
    status,
    rawPayload: live,
  });
  if (isPaid(status)) {
    await require('./billingService').fulfillPaidOrder(order);
  } else if (['failed', 'cancelled', 'canceled', 'expired'].includes(String(status).toLowerCase())) {
    await BillingOrder.markStatus(order.id, 'Failed');
  }
  return { ok: true, paid: isPaid(status) };
}

async function testConnection(apiKey, merchantToken, baseUrl) {
  const url = (baseUrl || 'https://api.fynexpay.net').replace(/\/$/, '');
  const res = await sendJson({
    baseUrl: url,
    path: `/v1/payments/${cryptoRandom()}`,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${normalizeBearer(merchantToken)}`,
      'X-Api-Key': String(apiKey || '').trim(),
      Origin: frontendUrl(),
    },
  });
  return res.status !== 401 && res.status !== 403;
}

function cryptoRandom() {
  return '00000000-0000-4000-8000-000000000000';
}

module.exports = {
  MINIMUM_IQD,
  GATEWAY,
  getSettings,
  isEnabled,
  createPayment,
  getStatus,
  handleWebhook,
  suggestedWebhookUrl,
  suggestedRedirectUrl,
  resolveCallbackUrl,
  testConnection,
};
