const MessageOutbox = require('../models/MessageOutbox');
const { AccountNotReadyError } = require('../utils/accountLifecycle');

let flushing = new Set();

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

module.exports = {
  enqueueChat,
  enqueueMedia,
  flushAccount,
};
