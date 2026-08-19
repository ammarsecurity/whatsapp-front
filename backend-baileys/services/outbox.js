const MessageOutbox = require('../models/MessageOutbox');
const { AccountNotReadyError } = require('../utils/accountLifecycle');

let flushing = new Set();
let workerStarted = false;

async function enqueueChat(userId, accountId, phone, body) {
  return MessageOutbox.enqueue({
    userId,
    accountId,
    phone,
    kind: 'chat',
    body,
  });
}

async function enqueueMedia(userId, accountId, phone, kind, mediaUrl, caption, filename) {
  return MessageOutbox.enqueue({
    userId,
    accountId,
    phone,
    kind,
    mediaUrl,
    caption,
    filename,
  });
}

async function flushAccount(accountId, userId) {
  const key = `${userId}_${accountId}`;
  if (flushing.has(key)) return { flushed: 0, skipped: true };
  flushing.add(key);

  const whatsappService = require('./whatsapp');
  let flushed = 0;

  try {
    const rows = await MessageOutbox.claimQueued(userId, accountId, 25);
    for (const row of rows) {
      try {
        if (row.kind === 'chat') {
          const results = await whatsappService.sendMessages(
            accountId,
            userId,
            [row.phone],
            row.body || '',
          );
          const first = results[0];
          if (first?.success) {
            await MessageOutbox.markSent(row.id, first.messageId);
            flushed += 1;
          } else {
            await MessageOutbox.markFailed(row.id, first?.error || 'send failed');
          }
        } else {
          const result = await whatsappService.sendMediaFromSource(
            accountId,
            userId,
            row.phone,
            row.media_url,
            row.kind === 'image' ? 'image' : 'document',
            row.caption || '',
            row.filename,
          );
          if (result?.success) {
            await MessageOutbox.markSent(row.id, result.messageId);
            flushed += 1;
          } else {
            await MessageOutbox.markFailed(row.id, result?.error || 'send failed');
          }
        }
      } catch (err) {
        if (err instanceof AccountNotReadyError) {
          await MessageOutbox.requeue(row.id);
          break;
        }
        await MessageOutbox.markFailed(row.id, err.message);
      }
    }
  } catch (err) {
    console.warn(`[outbox] flush failed for ${accountId}:`, err.message);
  } finally {
    flushing.delete(key);
  }

  if (flushed) {
    console.log(`[outbox] flushed ${flushed} queued message(s) for ${accountId}`);
  }
  return { flushed };
}

/**
 * Slow pump: only send when the instance is already READY.
 * Does not hammer Chrome, and does not mark messages failed just because
 * the session is parked / reconnecting.
 */
async function tickQueued() {
  const whatsappService = require('./whatsapp');
  let pending = [];
  try {
    pending = await MessageOutbox.listQueuedAccounts();
  } catch (err) {
    console.warn('[outbox] list queued failed:', err.message);
    return;
  }

  for (const row of pending) {
    if (whatsappService.isSessionReady(row.account_id, row.user_id)) {
      await flushAccount(row.account_id, row.user_id);
    }
  }

  const parkedWithMail = pending.find(
    (row) =>
      !whatsappService.isSessionReady(row.account_id, row.user_id) &&
      whatsappService.hasParkedSession(row.account_id, row.user_id),
  );
  if (parkedWithMail) {
    whatsappService
      .ensureAccountReady(parkedWithMail.account_id, parkedWithMail.user_id)
      .then(() => flushAccount(parkedWithMail.account_id, parkedWithMail.user_id))
      .catch(() => {});
  }
}

function startWorker() {
  if (workerStarted) return;
  workerStarted = true;
  const intervalMs = Math.max(
    15000,
    parseInt(process.env.WA_OUTBOX_TICK_MS || '45000', 10) || 45000,
  );
  setInterval(() => {
    tickQueued().catch((err) => {
      console.warn('[outbox] tick failed:', err.message);
    });
  }, intervalMs);
}

module.exports = {
  enqueueChat,
  enqueueMedia,
  flushAccount,
  startWorker,
  tickQueued,
};
