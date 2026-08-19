/**
 * Distinguish WhatsApp logout from Chrome/Puppeteer resource crashes.
 * Never treat RAM timeouts as a reason to wipe LocalAuth.
 */

function errorText(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  return err.message || String(err);
}

function classifySessionError(err) {
  const msg = errorText(err);
  const upper = msg.toUpperCase();

  if (upper === 'LOGOUT' || /\bLOGOUT\b/.test(upper) || /logged out/i.test(msg)) {
    return 'logout';
  }

  const crash =
    /Target closed/i.test(msg) ||
    /Session closed/i.test(msg) ||
    /detached Frame/i.test(msg) ||
    /browser disconnected/i.test(msg) ||
    /Browser closed/i.test(msg) ||
    /Connection closed/i.test(msg) ||
    /WebSocket is not open/i.test(msg) ||
    /Navigating frame was detached/i.test(msg);

  if (crash) return 'crash';

  const timeout =
    /timed out/i.test(msg) ||
    /timeout/i.test(msg) ||
    /Runtime\.callFunctionOn timed out/i.test(msg);

  if (timeout) return 'timeout';

  return 'unknown';
}

function isBrowserAlive(client) {
  if (!client) return false;
  try {
    const page = client.pupPage;
    const browser = client.pupBrowser;
    if (page && typeof page.isClosed === 'function' && page.isClosed()) return false;
    if (browser && typeof browser.isConnected === 'function' && !browser.isConnected()) {
      return false;
    }
    if (!page && !browser) return false;
    return true;
  } catch {
    return false;
  }
}

function sessionLooksAuthenticated(sessionPath) {
  const fs = require('fs');
  const path = require('path');
  if (!sessionPath || !fs.existsSync(sessionPath)) return false;
  const markers = [
    path.join(sessionPath, 'Default', 'IndexedDB', 'https_web.whatsapp.com_0.indexeddb.leveldb'),
    path.join(sessionPath, 'Default', 'IndexedDB'),
    path.join(sessionPath, 'Default', 'Local Storage'),
  ];
  return markers.some((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}

module.exports = {
  classifySessionError,
  isBrowserAlive,
  sessionLooksAuthenticated,
  errorText,
};
