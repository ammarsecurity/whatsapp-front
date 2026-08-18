const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsapp');
const outbox = require('../services/outbox');
const { ultraAuth } = require('../middleware/ultraAuth');
const { AccountNotReadyError } = require('../utils/accountLifecycle');

function field(req, ...names) {
  for (const name of names) {
    const v = req.body?.[name] ?? req.query?.[name];
    if (v != null && String(v).trim() !== '') return v;
  }
  return '';
}

function okSent(id) {
  return { sent: 'true', message: 'ok', id: id || null };
}

function queued() {
  return {
    sent: 'queue',
    message: 'instance not authorized, message queued',
  };
}

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

router.post('/:instance_id/messages/chat', ultraAuth, async (req, res) => {
  try {
    const to = String(field(req, 'to')).trim();
    const body = String(field(req, 'body')).trim();
    if (!to) return fail(res, 400, 'to is required');
    if (!body) return fail(res, 400, 'body is required');
    if (body.length > 4096) return fail(res, 400, 'body max length is 4096');

    if (!whatsappService.isSessionReady(req.accountId, req.userId)) {
      await outbox.enqueueChat(req.userId, req.accountId, to, body);
      return res.json(queued());
    }

    const results = await whatsappService.sendMessages(
      req.accountId,
      req.userId,
      [to],
      body,
    );
    const first = results[0];
    if (!first?.success) {
      return fail(res, 500, first?.error || 'send failed');
    }
    return res.json(okSent(first.messageId));
  } catch (err) {
    if (err instanceof AccountNotReadyError) {
      try {
        await outbox.enqueueChat(
          req.userId,
          req.accountId,
          String(field(req, 'to')).trim(),
          String(field(req, 'body')).trim(),
        );
        return res.json(queued());
      } catch (queueErr) {
        return fail(res, 503, queueErr.message);
      }
    }
    return fail(res, 500, err.message || 'send failed');
  }
});

router.post('/:instance_id/messages/image', ultraAuth, async (req, res) => {
  try {
    const to = String(field(req, 'to')).trim();
    const image = String(field(req, 'image')).trim();
    const caption = String(field(req, 'caption') || '');
    if (!to) return fail(res, 400, 'to is required');
    if (!image) return fail(res, 400, 'image is required');

    if (!whatsappService.isSessionReady(req.accountId, req.userId)) {
      await outbox.enqueueMedia(req.userId, req.accountId, to, 'image', image, caption, '');
      return res.json(queued());
    }

    const result = await whatsappService.sendMediaFromSource(
      req.accountId,
      req.userId,
      to,
      image,
      'image',
      caption,
      'image.jpg',
    );
    if (!result?.success) return fail(res, 500, result?.error || 'send failed');
    return res.json(okSent(result.messageId));
  } catch (err) {
    if (err instanceof AccountNotReadyError) {
      await outbox.enqueueMedia(
        req.userId,
        req.accountId,
        String(field(req, 'to')).trim(),
        'image',
        String(field(req, 'image')).trim(),
        String(field(req, 'caption') || ''),
        '',
      );
      return res.json(queued());
    }
    return fail(res, 500, err.message || 'send failed');
  }
});

router.post('/:instance_id/messages/document', ultraAuth, async (req, res) => {
  try {
    const to = String(field(req, 'to')).trim();
    const document = String(field(req, 'document')).trim();
    const filename = String(field(req, 'filename') || 'file.bin').trim();
    const caption = String(field(req, 'caption') || '');
    if (!to) return fail(res, 400, 'to is required');
    if (!document) return fail(res, 400, 'document is required');

    if (!whatsappService.isSessionReady(req.accountId, req.userId)) {
      await outbox.enqueueMedia(
        req.userId,
        req.accountId,
        to,
        'document',
        document,
        caption,
        filename,
      );
      return res.json(queued());
    }

    const result = await whatsappService.sendMediaFromSource(
      req.accountId,
      req.userId,
      to,
      document,
      'document',
      caption,
      filename,
    );
    if (!result?.success) return fail(res, 500, result?.error || 'send failed');
    return res.json(okSent(result.messageId));
  } catch (err) {
    if (err instanceof AccountNotReadyError) {
      await outbox.enqueueMedia(
        req.userId,
        req.accountId,
        String(field(req, 'to')).trim(),
        'document',
        String(field(req, 'document')).trim(),
        String(field(req, 'caption') || ''),
        String(field(req, 'filename') || 'file.bin'),
      );
      return res.json(queued());
    }
    return fail(res, 500, err.message || 'send failed');
  }
});

router.get('/:instance_id/contacts/check', ultraAuth, async (req, res) => {
  try {
    const chatId = String(field(req, 'chatId', 'chatid', 'to')).trim();
    if (!chatId) return fail(res, 400, 'chatId is required');
    const { exists } = await whatsappService.checkPhoneNumber(
      req.accountId,
      req.userId,
      chatId,
    );
    return res.json({ status: exists ? 'valid' : 'invalid' });
  } catch (err) {
    if (err instanceof AccountNotReadyError) {
      return fail(res, 503, 'instance not authorized');
    }
    return fail(res, 500, err.message || 'check failed');
  }
});

router.get('/:instance_id/instance/status', ultraAuth, async (req, res) => {
  try {
    const live = await whatsappService.getAccountStatus(req.accountId, req.userId);
    const mapped = whatsappService.ultraStatus(req.accountId, req.userId);
    return res.json({
      ...mapped,
      status: mapped.status,
      accountStatus: { status: mapped.status },
      ready: !!live?.ready,
    });
  } catch (err) {
    return fail(res, 500, err.message || 'status failed');
  }
});

router.get('/:instance_id/instance/qr', ultraAuth, async (req, res) => {
  try {
    const payload = await whatsappService.getQrForAccount(req.accountId, req.userId);
    if (payload.connected || payload.ready) {
      return res.json({
        status: 'authenticated',
        qrCode: null,
        message: 'instance already authenticated',
      });
    }
    return res.json({
      status: 'qr',
      qr: payload.qr || payload.qrCode || null,
      qrCode: payload.qr || payload.qrCode || null,
      error: payload.error || null,
    });
  } catch (err) {
    return fail(res, 500, err.message || 'qr failed');
  }
});

module.exports = router;
