const crypto = require('crypto');

function getKey() {
  const raw = String(process.env.PAYMENT_ENCRYPTION_KEY || process.env.JWT_SECRET || 'change-me-payment-key');
  return crypto.createHash('sha256').update(raw).digest();
}

function protect(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function unprotect(stored) {
  if (!stored) return '';
  const value = String(stored).trim();
  if (!value) return '';
  try {
    const buf = Buffer.from(value, 'base64');
    if (buf.length < 29) return value;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return value;
  }
}

function hmacSha256Hex(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload || '', 'utf8').digest('hex');
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

module.exports = { protect, unprotect, hmacSha256Hex, timingSafeEqual };
