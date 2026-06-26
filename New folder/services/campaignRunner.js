const Campaign = require('../models/Campaign');
const CampaignRecipient = require('../models/CampaignRecipient');
const ContactGroup = require('../models/ContactGroup');
const OptOut = require('../models/OptOut');
const UserQuota = require('../models/UserQuota');
const whatsappService = require('./whatsapp');
const { resolveMessage } = require('../utils/resolveMessage');
const webhookDispatcher = require('./webhookDispatcher');
const wsHub = require('./wsHub');

async function resolveRecipients(userId, { groupId, phoneNumbers }) {
  let recipients = [];
  let groupIdNum = null;
  let groupName = null;

  if (groupId != null) {
    groupIdNum = parseInt(groupId, 10);
    const group = await ContactGroup.findById(groupIdNum, userId);
    if (!group) {
      const err = new Error('Contact group not found');
      err.status = 404;
      throw err;
    }
    groupName = group.name;
    const rows = await ContactGroup.getNumbers(groupIdNum, userId, { limit: 10000, offset: 0 });
    recipients = rows.map((r) => r.phone_number);
  } else if (Array.isArray(phoneNumbers) && phoneNumbers.length > 0) {
    recipients = phoneNumbers.map((p) => ContactGroup.normalizePhone(p)).filter(Boolean);
  } else {
    const err = new Error('Provide groupId or phoneNumbers array');
    err.status = 400;
    throw err;
  }

  return { recipients: [...new Set(recipients)], groupIdNum, groupName };
}

/**
 * Run campaign immediately (sync send loop)
 */
async function runCampaign(userId, params) {
  let {
    accountId,
    groupId,
    phoneNumbers,
    name,
    message,
    templateId,
    templateVars,
    delayMs,
    campaignId: existingId,
  } = params;

  if (existingId) {
    const c = await Campaign.findById(existingId, userId);
    if (!c) {
      const err = new Error('Campaign not found');
      err.status = 404;
      throw err;
    }
    accountId = c.account_id;
    groupId = c.group_id;
    name = c.name;
    message = c.message_text;
    templateId = null;
    delayMs = c.delay_ms;
  }

  const trimmedId = String(accountId || '').trim();
  if (!trimmedId) {
    const err = new Error('accountId is required');
    err.status = 400;
    throw err;
  }

  const messageText = await resolveMessage(userId, {
    message,
    templateId,
    templateName: params.templateName,
    templateVars,
  });
  const { recipients: unique, groupIdNum, groupName } = await resolveRecipients(userId, {
    groupId,
    phoneNumbers,
  });

  if (unique.length === 0) {
    const err = new Error('No valid phone numbers');
    err.status = 400;
    throw err;
  }
  if (unique.length > 500) {
    const err = new Error('Maximum 500 recipients per campaign');
    err.status = 400;
    throw err;
  }

  const optOutSet = await OptOut.getOptedOutSet(userId, unique);
  const toSend = unique.filter((p) => !optOutSet.has(p));
  const skippedOptOut = unique.filter((p) => optOutSet.has(p));

  const quota = await UserQuota.checkMessageQuota(userId, toSend.length);
  if (!quota.ok) {
    const err = new Error(quota.error);
    err.status = 429;
    throw err;
  }

  const delay = Math.min(30000, Math.max(1000, parseInt(delayMs, 10) || 3000));
  const campaignName =
    String(name || '').trim() ||
    (groupName ? `Campaign — ${groupName}` : `Campaign ${new Date().toLocaleDateString()}`);

  await whatsappService.ensureAccountReady(trimmedId, userId);

  let campaignId = existingId;
  if (!campaignId) {
    campaignId = await Campaign.create({
      userId,
      accountId: trimmedId,
      groupId: groupIdNum,
      name: campaignName,
      messageText,
      delayMs: delay,
      totalRecipients: unique.length,
      templateId: templateId ? parseInt(templateId, 10) : null,
      status: 'running',
    });
  } else {
    await Campaign.updateStatus(campaignId, 'running');
  }
  wsHub.broadcast(userId, 'campaign.started', {
    campaignId,
    name: campaignName,
    total: unique.length,
  });

  const recipientLogs = skippedOptOut.map((phone) => ({
    phone,
    status: 'skipped_opt_out',
    error: 'Opted out',
  }));

  let results = [];
  try {
    if (toSend.length > 0) {
      results = await whatsappService.sendMessages(
        trimmedId,
        userId,
        toSend,
        messageText,
        { delayBetweenMs: delay },
      );
      await UserQuota.incrementMessages(userId, results.filter((r) => r.success).length);
    }

    for (const r of results) {
      recipientLogs.push({
        phone: r.phone,
        status: r.success ? 'sent' : 'failed',
        error: r.error || null,
      });
    }

    await CampaignRecipient.bulkInsert(campaignId, recipientLogs);

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;
    const finalStatus = failureCount === unique.length && successCount === 0 ? 'failed' : 'completed';

    await Campaign.complete(campaignId, {
      successCount,
      failureCount: failureCount + skippedOptOut.length,
      status: finalStatus,
    });

    const payload = {
      campaignId,
      name: campaignName,
      accountId: trimmedId,
      groupId: groupIdNum,
      total: unique.length,
      successCount,
      failureCount: failureCount + skippedOptOut.length,
      skippedOptOut: skippedOptOut.length,
      delayMs: delay,
    };

    wsHub.broadcast(userId, 'campaign.completed', payload);
    webhookDispatcher.dispatch(userId, finalStatus === 'failed' ? 'campaign.failed' : 'campaign.completed', payload);

    return { ...payload, results, skippedOptOut: skippedOptOut.length };
  } catch (sendErr) {
    await Campaign.complete(campaignId, {
      successCount: 0,
      failureCount: unique.length,
      status: 'failed',
    });
    webhookDispatcher.dispatch(userId, 'campaign.failed', {
      campaignId,
      error: sendErr.message,
    });
    throw sendErr;
  }
}

/**
 * Schedule campaign for later
 */
async function scheduleCampaign(userId, params) {
  const { scheduledAt, accountId, groupId, phoneNumbers, name, message, templateId, delayMs } =
    params;

  if (!scheduledAt) {
    const err = new Error('scheduledAt is required for scheduling');
    err.status = 400;
    throw err;
  }
  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime()) || when <= new Date()) {
    const err = new Error('scheduledAt must be a future date/time');
    err.status = 400;
    throw err;
  }

  if (!params.groupId) {
    const err = new Error('Scheduled campaigns require a contact group (groupId)');
    err.status = 400;
    throw err;
  }

  const messageText = await resolveMessage(userId, {
    message,
    templateId,
    templateName: params.templateName,
    templateVars: params.templateVars,
  });
  const { recipients: unique, groupIdNum, groupName } = await resolveRecipients(userId, {
    groupId,
    phoneNumbers,
  });

  if (unique.length === 0) {
    const err = new Error('No valid phone numbers');
    err.status = 400;
    throw err;
  }

  const delay = Math.min(30000, Math.max(1000, parseInt(delayMs, 10) || 3000));
  const campaignName =
    String(name || '').trim() ||
    (groupName ? `Scheduled — ${groupName}` : `Scheduled ${new Date().toLocaleDateString()}`);

  const campaignId = await Campaign.createScheduled({
    userId,
    accountId: String(accountId).trim(),
    groupId: groupIdNum,
    name: campaignName,
    messageText,
    delayMs: delay,
    totalRecipients: unique.length,
    templateId: templateId ? parseInt(templateId, 10) : null,
    scheduledAt: when,
  });

  return {
    campaignId,
    name: campaignName,
    scheduledAt: when.toISOString(),
    totalRecipients: unique.length,
    status: 'scheduled',
  };
}

module.exports = {
  runCampaign,
  scheduleCampaign,
  resolveMessage: require('../utils/resolveMessage').resolveMessage,
  resolveRecipients,
};
