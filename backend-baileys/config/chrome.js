/** Stub — Baileys backend does not use Chrome/Puppeteer. Keeps old /status/system shape. */

async function getChromeDiagnostics() {
  return {
    platform: process.platform,
    executablePath: null,
    exists: false,
    version: null,
    headlessLaunch: true,
    launchError: null,
    engine: 'baileys',
    note: 'This backend uses Baileys WebSocket, not Chrome.',
  };
}

async function assertChromeReady() {
  return getChromeDiagnostics();
}

function logChromeStartupCheck() {
  console.log('[engine] Baileys — Chrome not required');
}

module.exports = {
  DEFAULT_PATH: null,
  UBUNTU_CHROME_PACKAGES: [],
  resolveChromePath: () => null,
  getChromeVersion: () => null,
  getPuppeteerConfig: () => ({}),
  getChromeDiagnostics,
  assertChromeReady,
  logChromeStartupCheck,
};
