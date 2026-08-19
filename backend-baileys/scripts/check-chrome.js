#!/usr/bin/env node
/**
 * Run on Ubuntu server to verify Chrome before starting the API:
 *   node scripts/check-chrome.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { getChromeDiagnostics } = require('../config/chrome');

(async () => {
  const diag = await getChromeDiagnostics();
  console.log(JSON.stringify(diag, null, 2));
  if (!diag.headlessLaunch) {
    console.error('\nChrome is NOT ready. Run: sudo bash scripts/ubuntu-chrome-setup.sh');
    process.exit(1);
  }
  console.log('\nChrome OK');
})();
