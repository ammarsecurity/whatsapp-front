const fs = require('fs');
const os = require('os');
const path = require('path');
const { withTimeout } = require('./withTimeout');

const CHECK_TIMEOUT_MS = 3_000;
const DEFAULT_SEND_TIMEOUT_MS = 45_000;

function cleanDigits(phone) {
  let cleaned = String(phone || '').trim();
  if (cleaned.includes('@')) cleaned = cleaned.split('@')[0];
  cleaned = cleaned.replace(/[^\d]/g, '');
  if (!cleaned) throw new Error('Invalid phone number format');
  return cleaned;
}

function toCusJid(phone) {
  return `${cleanDigits(phone)}@s.whatsapp.net`;
}

async function sendTextSafe(client, phone, text, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;
  const jid = toCusJid(phone);
  const sent = await withTimeout(client.sendMessage(jid, String(text)), timeoutMs, 'WhatsApp text send');
  return sent;
}

async function checkRegistered(client, phone) {
  return { exists: true, jid: toCusJid(phone) };
}

module.exports = {
  cleanDigits,
  toCusJid,
  checkRegistered,
  sendTextSafe,
  CHECK_TIMEOUT_MS,
  DEFAULT_SEND_TIMEOUT_MS,
};
