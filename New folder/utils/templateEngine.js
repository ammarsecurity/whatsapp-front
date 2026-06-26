/**
 * Replace placeholders in template body.
 * Supports {{VAR}} and {VAR} (double braces processed first).
 */
function applyTemplate(body, vars = {}) {
  if (!body) return '';
  let text = String(body);

  const valueFor = (key) => {
    if (vars[key] != null) return String(vars[key]);
    return null;
  };

  text = text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = valueFor(key);
    return v != null ? v : `{{${key}}}`;
  });

  text = text.replace(/\{(\w+)\}/g, (_, key) => {
    const v = valueFor(key);
    return v != null ? v : `{${key}}`;
  });

  return text;
}

module.exports = { applyTemplate };
