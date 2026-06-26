const OPT_OUT_KEYWORDS = ['stop', 'unsubscribe', 'cancel', 'opt out', 'optout', 'إيقاف', 'ايقاف', 'توقف'];

const InboxMessage = require('../models/InboxMessage');
const AutoReply = require('../models/AutoReply');
const OptOut = require('../models/OptOut');
const webhookDispatcher = require('./webhookDispatcher');
const wsHub = require('./wsHub');

function isOptOutMessage(text) {
  const lower = String(text || '').trim().toLowerCase();
  return OPT_OUT_KEYWORDS.some((kw) => lower === kw || lower.includes(kw));
}

async function handleIncoming(accountId, userId, msg, client) {
  try {
    if (msg.fromMe) return;

    const contact = await msg.getContact();
    const phoneRaw = contact?.number || msg.from?.replace(/@.*/, '') || '';
    const body = msg.body || '';
    const contactName = contact?.pushname || contact?.name || null;

    const inboxId = await InboxMessage.create({
      userId,
      accountId,
      phoneNumber: phoneRaw,
      contactName,
      body,
      direction: 'in',
      waMessageId: msg.id?._serialized,
    });

    const payload = {
      id: inboxId,
      accountId,
      phoneNumber: phoneRaw,
      contactName,
      body,
      createdAt: new Date().toISOString(),
    };

    wsHub.broadcast(userId, 'message.received', payload);
    webhookDispatcher.dispatch(userId, 'message.received', payload);

    if (isOptOutMessage(body)) {
      await OptOut.add(userId, phoneRaw, { reason: 'User requested stop', source: 'keyword' });
      try {
        await client.sendMessage(
          msg.from,
          'You have been unsubscribed. You will no longer receive promotional messages.',
        );
        await InboxMessage.create({
          userId,
          accountId,
          phoneNumber: phoneRaw,
          body: 'You have been unsubscribed. You will no longer receive promotional messages.',
          direction: 'out',
        });
      } catch {
        /* ignore send failure */
      }
      return;
    }

    const rules = await AutoReply.getActiveRules(userId, accountId);
    for (const rule of rules) {
      if (AutoReply.matchRule(rule, body)) {
        try {
          await client.sendMessage(msg.from, rule.reply_text);
          await InboxMessage.create({
            userId,
            accountId,
            phoneNumber: phoneRaw,
            body: rule.reply_text,
            direction: 'out',
          });
          wsHub.broadcast(userId, 'message.sent', {
            accountId,
            phoneNumber: phoneRaw,
            body: rule.reply_text,
            autoReply: true,
          });
        } catch (err) {
          console.error(`[${accountId}] Auto-reply failed:`, err.message);
        }
        break;
      }
    }
  } catch (err) {
    console.error(`[${accountId}] Incoming handler error:`, err.message);
  }
}

module.exports = { handleIncoming, isOptOutMessage };
