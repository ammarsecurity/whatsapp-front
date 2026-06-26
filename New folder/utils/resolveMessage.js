const MessageTemplate = require('../models/MessageTemplate');
const { applyTemplate } = require('./templateEngine');

/**
 * Resolve final message text from raw message and/or template.
 * @param {number} userId
 * @param {{ message?: string, templateId?: number|string, templateName?: string, templateVars?: object }} opts
 */
async function resolveMessage(userId, { message, templateId, templateName, templateVars }) {
  let text = message ? String(message).trim() : '';

  if (templateId != null && templateId !== '') {
    const tpl = await MessageTemplate.findById(parseInt(templateId, 10), userId);
    if (!tpl) {
      const err = new Error('Template not found');
      err.status = 404;
      throw err;
    }
    text = applyTemplate(tpl.body, templateVars || {});
  } else if (templateName && String(templateName).trim()) {
    const tpl = await MessageTemplate.findByName(userId, String(templateName).trim());
    if (!tpl) {
      const err = new Error(`Template not found: ${templateName}`);
      err.status = 404;
      throw err;
    }
    text = applyTemplate(tpl.body, templateVars || {});
  }

  if (!text) {
    const err = new Error('message, templateId, or templateName is required');
    err.status = 400;
    throw err;
  }

  return text;
}

module.exports = { resolveMessage };
