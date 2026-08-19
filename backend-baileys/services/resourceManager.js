const os = require('os');

function parseNum(name, fallback) {
  const n = parseFloat(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

function bytesToMb(n) {
  return Math.round((n / 1024 / 1024) * 10) / 10;
}

function getSnapshot(runtime = {}) {
  const liveInstances = runtime.liveInstances || 0;
  const activeStarts = runtime.activeStarts || 0;
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const usedPercent = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
  const ramBlockAt = parseNum('WA_RAM_BLOCK_PERCENT', 90);
  const ramSafeAt = parseNum('WA_RAM_SAFE_PERCENT', 80);
  const maxLive = Math.max(0, parseInt(process.env.WA_MAX_LIVE_SESSIONS || '20', 10) || 20);
  const maxConcurrentStarts = Math.max(
    1,
    parseInt(process.env.WA_MAX_CONCURRENT_STARTS || '3', 10) || 3,
  );
  const cores = os.cpus().length || 1;
  const load = os.loadavg()[0] || 0;
  const ramBlock = usedPercent >= ramBlockAt;
  const ramSafe = usedPercent < ramSafeAt;
  const cpuHot = load > cores * 2;
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
    chromeProcessCount: 0,
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
            ? `concurrent starts ${activeStarts} >= ${maxConcurrentStarts}`
            : null,
  };
}

module.exports = {
  getSnapshot,
  countChromeProcesses: () => 0,
  bytesToMb,
};
