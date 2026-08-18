async function sendJson({ baseUrl, path, method = 'GET', headers = {}, body }) {
  const url = `${String(baseUrl).replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, text, json };
}

function frontendUrl() {
  return String(process.env.FRONTEND_URL || 'https://whatsapp.smartstick-iq.com').replace(/\/$/, '');
}

function apiPublicUrl() {
  return String(
    process.env.API_PUBLIC_URL || process.env.BACKEND_PUBLIC_URL || 'https://whatsapp-api.smartstick-iq.com',
  ).replace(/\/$/, '');
}

function frontendHost() {
  try {
    return new URL(frontendUrl()).hostname.toLowerCase();
  } catch {
    return 'whatsapp.smartstick-iq.com';
  }
}

function isOnFrontendDomain(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase() === frontendHost();
  } catch {
    return false;
  }
}

module.exports = { sendJson, frontendUrl, apiPublicUrl, frontendHost, isOnFrontendDomain };
