const os = require('os');
const { execSync } = require('child_process');
const { getChromeDiagnostics } = require('./chrome');
const { API_BUILD } = require('./build');

function bytesToMb(n) {
  return Math.round((n / 1024 / 1024) * 10) / 10;
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(seconds % 60)}s`;
}

/** Sum RSS of chrome/chromium processes (Linux/macOS). */
function getChromeMemoryMb() {
  if (process.platform === 'win32') {
    try {
      const out = execSync(
        'wmic process where "name like \'%chrome%\'" get WorkingSetSize /format:list',
        { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      let total = 0;
      for (const line of out.split('\n')) {
        const m = line.match(/WorkingSetSize=(\d+)/);
        if (m) total += parseInt(m[1], 10);
      }
      return total > 0 ? bytesToMb(total) : null;
    } catch {
      return null;
    }
  }

  try {
    const out = execSync(
      "ps -eo rss,comm 2>/dev/null | grep -iE 'chrome|chromium' | grep -v grep || true",
      { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let totalKb = 0;
    for (const line of out.trim().split('\n')) {
      if (!line.trim()) continue;
      const rss = parseInt(line.trim().split(/\s+/)[0], 10);
      if (Number.isFinite(rss)) totalKb += rss;
    }
    return totalKb > 0 ? Math.round((totalKb / 1024) * 10) / 10 : null;
  } catch {
    return null;
  }
}

function countChromeProcesses() {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        'tasklist /FI "IMAGENAME eq chrome.exe" /NH 2>nul',
        { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      return out.split('\n').filter((l) => l.includes('chrome.exe')).length;
    }
    const out = execSync(
      "pgrep -cf 'chrome|chromium' 2>/dev/null || echo 0",
      { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const n = parseInt(String(out).trim(), 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return null;
  }
}

/**
 * Full server health snapshot for admin dashboard.
 * @param {import('../services/whatsapp')} whatsappService
 */
async function getSystemHealth(whatsappService) {
  const chrome = await getChromeDiagnostics();
  const proc = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const runtime = whatsappService.getRuntimeStats();
  let dbAccounts = [];
  try {
    dbAccounts = await whatsappService.getAllAccountsAdmin();
  } catch (err) {
    dbAccounts = [];
  }

  const connected = dbAccounts.filter((a) => a.isConnected || a.isReady).length;
  const offline = dbAccounts.length - connected;
  const withErrors = dbAccounts.filter((a) => a.initError).length;
  const awaitingQr = dbAccounts.filter((a) => a.hasQrCode).length;

  const nodeProcessMb = {
    rss: bytesToMb(proc.rss),
    heapUsed: bytesToMb(proc.heapUsed),
    heapTotal: bytesToMb(proc.heapTotal),
    external: bytesToMb(proc.external),
  };

  const systemMemoryMb = {
    total: bytesToMb(totalMem),
    used: bytesToMb(usedMem),
    free: bytesToMb(freeMem),
    usedPercent: Math.round((usedMem / totalMem) * 1000) / 10,
  };

  const chromeMemoryMb = getChromeMemoryMb();
  const chromeProcessCount = countChromeProcesses();

  const checks = [
    {
      id: 'systemReady',
      label: 'WhatsApp bridge ready',
      ok: global.systemReady === true,
      detail: global.systemReady ? 'Accepting API traffic' : 'Warmup (~20s after restart)',
    },
    {
      id: 'chromeBinary',
      label: 'Chrome binary',
      ok: chrome.exists === true,
      detail: chrome.executablePath,
    },
    {
      id: 'chromeHeadless',
      label: 'Chrome headless launch',
      ok: chrome.headlessLaunch === true,
      detail: chrome.headlessLaunch ? chrome.version : chrome.launchError,
    },
    {
      id: 'memoryPressure',
      label: 'System RAM usage',
      ok: systemMemoryMb.usedPercent < 90,
      detail: `${systemMemoryMb.usedPercent}% used (${systemMemoryMb.used}/${systemMemoryMb.total} MB)`,
    },
  ];

  const overallOk = checks.every((c) => c.ok);

  return {
    success: true,
    apiBuild: API_BUILD,
    timestamp: new Date().toISOString(),
    overall: {
      ok: overallOk,
      status: overallOk ? 'healthy' : 'degraded',
    },
    checks,
    system: {
      bridgeReady: global.systemReady === true,
      platform: process.platform,
      nodeVersion: process.version,
      hostname: os.hostname(),
      uptimeSeconds: Math.floor(process.uptime()),
      uptimeHuman: formatUptime(process.uptime()),
      osUptimeHuman: formatUptime(os.uptime()),
      cpuCores: os.cpus().length,
      loadAverage: os.loadavg().map((n) => Math.round(n * 100) / 100),
    },
    memory: {
      nodeProcessMb,
      systemMb: systemMemoryMb,
      chromeMb: chromeMemoryMb,
      chromeProcessCount,
      estimatedTotalMb:
        chromeMemoryMb != null
          ? Math.round((nodeProcessMb.rss + chromeMemoryMb) * 10) / 10
          : nodeProcessMb.rss,
    },
    chrome,
    whatsapp: {
      accountsTotal: dbAccounts.length,
      connected,
      offline,
      inMemory: runtime.inMemoryCount,
      initLocks: runtime.initLocks,
      reconnectTimers: runtime.reconnectTimers,
      awaitingQr,
      withErrors,
      sessions: runtime.sessions,
    },
    env: {
      sessionPath: process.env.SESSION_PATH || './.wwebjs_auth',
      chromePath: process.env.CHROME_PATH || null,
      port: process.env.PORT || '8489',
    },
  };
}

module.exports = { getSystemHealth, bytesToMb, formatUptime };
