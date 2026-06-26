const express = require('express');

const router = express.Router();

const Campaign = require('../models/Campaign');

const CampaignRecipient = require('../models/CampaignRecipient');

const campaignRunner = require('../services/campaignRunner');

const { AccountNotReadyError } = require('../utils/accountLifecycle');

const { respondNotReady } = require('../middleware/accountReady');



function mapCampaign(c) {

  return {

    id: c.id,

    name: c.name,

    accountId: c.account_id,

    groupId: c.group_id,

    groupName: c.group_name,

    messageText: c.message_text,

    delayMs: c.delay_ms,

    templateId: c.template_id,

    scheduledAt: c.scheduled_at,

    status: c.status,

    totalRecipients: c.total_recipients,

    successCount: c.success_count,

    failureCount: c.failure_count,

    createdAt: c.created_at,

    completedAt: c.completed_at,

  };

}



router.get('/', async (req, res) => {

  try {

    const { status, search, limit = 20, offset = 0 } = req.query;

    const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const off = Math.max(0, parseInt(offset, 10) || 0);

    const opts = { status, search, limit: lim, offset: off };



    const [campaigns, total] = await Promise.all([

      Campaign.findAllByUserId(req.userId, opts),

      Campaign.countByUserId(req.userId, { status, search }),

    ]);



    res.json({

      success: true,

      campaigns: campaigns.map(mapCampaign),

      total,

      limit: lim,

      offset: off,

    });

  } catch (err) {

    console.error('List campaigns:', err);

    res.status(500).json({ success: false, error: err.message });

  }

});



router.get('/:campaignId/recipients', async (req, res) => {

  try {

    const id = parseInt(req.params.campaignId, 10);

    const { status, limit = 50, offset = 0 } = req.query;

    const lim = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));

    const off = Math.max(0, parseInt(offset, 10) || 0);



    const [rows, total] = await Promise.all([

      CampaignRecipient.findByCampaign(id, req.userId, { status, limit: lim, offset: off }),

      CampaignRecipient.countByCampaign(id, req.userId, { status }),

    ]);



    if (rows === null) {

      return res.status(404).json({ success: false, error: 'Campaign not found' });

    }



    res.json({

      success: true,

      recipients: rows.map((r) => ({

        id: r.id,

        phoneNumber: r.phone_number,

        status: r.status,

        errorMessage: r.error_message,

        createdAt: r.created_at,

      })),

      total,

      limit: lim,

      offset: off,

    });

  } catch (err) {

    res.status(500).json({ success: false, error: err.message });

  }

});



router.get('/:campaignId', async (req, res) => {

  try {

    const id = parseInt(req.params.campaignId, 10);

    const c = await Campaign.findById(id, req.userId);

    if (!c) {

      return res.status(404).json({ success: false, error: 'Campaign not found' });

    }

    res.json({ success: true, campaign: mapCampaign(c) });

  } catch (err) {

    res.status(500).json({ success: false, error: err.message });

  }

});



router.post('/schedule', async (req, res) => {

  try {

    const result = await campaignRunner.scheduleCampaign(req.userId, req.body);

    res.status(201).json({ success: true, ...result });

  } catch (err) {

    const code = err.status || 500;

    if (code === 500) console.error('Schedule campaign:', err);

    res.status(code).json({ success: false, error: err.message });

  }

});



router.post('/:campaignId/cancel', async (req, res) => {

  try {

    const id = parseInt(req.params.campaignId, 10);

    const ok = await Campaign.cancel(id, req.userId);

    if (!ok) {

      return res.status(404).json({

        success: false,

        error: 'Scheduled campaign not found or already started',

      });

    }

    res.json({ success: true });

  } catch (err) {

    res.status(500).json({ success: false, error: err.message });

  }

});



router.post('/send', async (req, res) => {

  try {

    const { scheduledAt } = req.body;

    if (scheduledAt) {

      const result = await campaignRunner.scheduleCampaign(req.userId, req.body);

      return res.status(201).json({ success: true, scheduled: true, ...result });

    }



    const result = await campaignRunner.runCampaign(req.userId, req.body);

    res.json({ success: true, ...result });

  } catch (err) {

    if (err instanceof AccountNotReadyError) {

      return respondNotReady(res, err);

    }

    const code = err.status || 500;

    if (code === 500) console.error('Campaign send:', err);

    res.status(code).json({ success: false, error: err.message || 'Campaign failed' });

  }

});



module.exports = router;

