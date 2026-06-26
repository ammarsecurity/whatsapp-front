const fs = require('fs');
const os = require('os');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const { withTimeout } = require('./withTimeout');

const CHECK_TIMEOUT_MS = 3_000;
const DEFAULT_SEND_TIMEOUT_MS = 45_000;
const PLAIN_TEXT_TIMEOUT_MS = 15_000;

function cleanDigits(phone) {
  let cleaned = String(phone || '').trim();
  if (cleaned.includes('@')) {
    cleaned = cleaned.split('@')[0];
  }
  cleaned = cleaned.replace(/[^\d]/g, '');
  if (!cleaned) {
    throw new Error('Invalid phone number format');
  }
  return cleaned;
}

function toCusJid(phone) {
  return `${cleanDigits(phone)}@c.us`;
}

/** Fallback only — sends as document attachment if plain text fails. */
async function sendTextAsDocument(client, phone, text) {
  const jid = toCusJid(phone);
  const tmpDir = path.join(os.tmpdir(), 'wa-text-send');
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, `msg-${Date.now()}.txt`);
  fs.writeFileSync(tmpPath, String(text), 'utf8');
  try {
    const media = MessageMedia.fromFilePath(tmpPath);
    media.filename = 'message.txt';
    return await client.sendMessage(jid, media);
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
  }
}

async function sendTextSafe(client, phone, text, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;
  const logPrefix = options.logPrefix || '';
  const log = logPrefix ? (msg) => console.log(`${logPrefix} ${msg}`) : () => {};
  const t0 = Date.now();
  const jid = toCusJid(phone);
  const body = String(text);

  log(`send start jid=${jid} (plain text first)`);

  try {
    const sent = await withTimeout(
      client.sendMessage(jid, body),
      Math.min(PLAIN_TEXT_TIMEOUT_MS, timeoutMs),
      'WhatsApp plain text send',
    );
    log(`send done (${Date.now() - t0}ms) via=plain-text`);
    return sent;
  } catch (err) {
    log(`plain text failed: ${err.message}, trying document fallback`);
  }

  const sent = await withTimeout(
    sendTextAsDocument(client, phone, body),
    timeoutMs,
    'WhatsApp document fallback send',
  );
  log(`send done (${Date.now() - t0}ms) via=document-fallback`);
  return sent;
}

async function checkRegistered(client, phone, options = {}) {
  const timeoutMs = options.timeoutMs ?? CHECK_TIMEOUT_MS;
  const jid = toCusJid(phone);
  const t0 = Date.now();
  const log = options.logPrefix
    ? (msg) => console.log(`${options.logPrefix} ${msg}`)
    : () => {};

  log(`check start jid=${jid}`);

  try {
    const chat = await withTimeout(
      client.getChatById(jid),
      timeoutMs,
      'WhatsApp getChat',
    );
    if (chat?.id?._serialized) {
      log(`check done (${Date.now() - t0}ms) exists=true via=getChat`);
      return { exists: true, jid: chat.id._serialized };
    }
  } catch (err) {
    log(`check getChat: ${err.message}`);
  }

  log(`check done (${Date.now() - t0}ms) exists=false`);
  return { exists: false, jid };
}

module.exports = {
  cleanDigits,
  toCusJid,
  checkRegistered,
  sendTextSafe,
  CHECK_TIMEOUT_MS,
  DEFAULT_SEND_TIMEOUT_MS,
};
