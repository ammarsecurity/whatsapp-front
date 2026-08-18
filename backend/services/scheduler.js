const Campaign = require('../models/Campaign');
const campaignRunner = require('./campaignRunner');
const AccountLicense = require('../models/AccountLicense');

let timer = null;
let lastExpireDay = '';

async function tick() {
  try {
    const day = new Date().toISOString().slice(0, 10);
    if (day !== lastExpireDay) {
      lastExpireDay = day;
      const n = await AccountLicense.expireDue();
      if (n > 0) console.log(`Expired ${n} account license(s)`);
    }
  } catch (err) {
    console.error('License expire tick error:', err.message);
  }

  try {
    const due = await Campaign.findDueScheduled();
    for (const c of due) {
      console.log(`Running scheduled campaign #${c.id} for user ${c.user_id}`);
      try {
        await campaignRunner.runCampaign(c.user_id, {
          accountId: c.account_id,
          groupId: c.group_id,
          name: c.name,
          message: c.message_text,
          templateId: c.template_id,
          delayMs: c.delay_ms,
          campaignId: c.id,
        });
      } catch (err) {
        console.error(`Scheduled campaign #${c.id} failed:`, err.message);
        await Campaign.complete(c.id, {
          successCount: 0,
          failureCount: c.total_recipients,
          status: 'failed',
        });
      }
    }
  } catch (err) {
    console.error('Scheduler tick error:', err.message);
  }
}

function start(intervalMs = 30000) {
  if (timer) return;
  timer = setInterval(tick, intervalMs);
  tick();
  console.log(`Campaign scheduler started (every ${intervalMs / 1000}s)`);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { start, stop, tick };
