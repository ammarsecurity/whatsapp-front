const os = require('os');
const { execSync } = require('child_process');

function parseNum(name, fallback) {
  const n = parseFloat(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

function bytesToMb(n) {
  return Math.round((n / 1024 / 1024) * 10) / 10;
}

function countChromeProcesses() {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        'tasklist /FI "IMAGENAME eq chrome.exe" /NH 2>nul',
        { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      return out.split('\n').filter((l) => l.toLowerCase().includes('chrome.exe')).length;
    }
    const out = execSync(
      "pgrep -cf 'chrome|chromium' 2>/dev/null || echo 0",
      { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const n = parseInt(String(out).trim(), 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Lightweight host snapshot. Does not talk to Puppeteer or WhatsApp.
 * @param {{ liveInstances?: number, activeStarts?: number }} runtime
 */
function getSnapshot(runtime = {}) {
  const liveInstances = runtime.liveInstances || 0;
  const activeStarts = runtime.activeStarts || 0;
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const usedPercent = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
  const ramBlockAt = parseNum('WA_RAM_BLOCK_PERCENT', 85);
  const ramSafeAt = parseNum('WA_RAM_SAFE_PERCENT', 75);
  const maxLive = Math.max(0, parseInt(process.env.WA_MAX_LIVE_SESSIONS || '4', 10) || 4);
  const maxConcurrentStarts = Math.max(
    1,
    parseInt(process.env.WA_MAX_CONCURRENT_STARTS || '1', 10) || 1,
  );
  const cores = os.cpus().length || 1;
  const load = os.loadavg()[0] || 0;
  const chromeProcessCount = countChromeProcesses();

  const ramBlock = usedPercent >= ramBlockAt;
  const ramSafe = usedPercent < ramSafeAt;
  const cpuHot = load > cores * 1.8;
  const overLive = maxLive > 0 && liveInstances >= maxLive;
  const startsBusy = activeStarts >= maxConcurrentStarts;

  return {
    usedPercent,
    freeMb: bytesToMb(free),
    totalMb: bytesToMb(total),
    liveInstances,
    maxLive,
    activeStarts,
    maxConcurrentStarts,
    chromeProcessCount,
    loadAverage: Math.round(load * 100) / 100,
    cpuCores: cores,
    ramBlock,
    ramSafe,
    cpuHot,
    overLive,
    startsBusy,
    canLaunch: !ramBlock && !overLive && !cpuHot && !startsBusy,
    reason: ramBlock
      ? `RAM ${usedPercent}% >= ${ramBlockAt}%`
      : overLive
        ? `live sessions ${liveInstances} >= max ${maxLive}`
        : cpuHot
          ? `CPU load ${load.toFixed(2)} too high`
          : startsBusy
            ? `concurrent Chrome starts ${activeStarts} >= ${maxConcurrentStarts}`
            : null,
  };
}

module.exports = {
  getSnapshot,
  countChromeProcesses,
  bytesToMb,
};
