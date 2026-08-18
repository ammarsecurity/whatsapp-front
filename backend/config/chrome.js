const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const DEFAULT_PATH = '/usr/bin/google-chrome';

function getChromeHome() {
  return (
    process.env.CHROME_HOME ||
    process.env.WA_CHROME_HOME ||
    (process.platform === 'linux' ? '/var/lib/whatsapp-api/chrome-home' : path.join(os.tmpdir(), 'wa-chrome-home'))
  );
}

function ensureChromeRuntimeDirs() {
  const home = getChromeHome();
  const dirs = [
    home,
    path.join(home, '.config'),
    path.join(home, '.local'),
    path.join(home, '.local/share'),
    path.join(home, '.local/share/applications'),
    path.join(home, 'crash-dumps'),
  ];
  for (const dir of dirs) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
    } catch (err) {
      console.warn(`[chrome] Could not create ${dir}:`, err.message);
    }
  }
  return home;
}

function chromeSpawnEnv() {
  const home = ensureChromeRuntimeDirs();
  return {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local/share'),
    XDG_CACHE_HOME: path.join(home, '.cache'),
  };
}

function chromeLaunchArgs(includeProfileDir = false) {
  const home = ensureChromeRuntimeDirs();
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-crash-reporter',
    '--disable-crashpad',
    '--disable-breakpad',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--no-zygote',
    `--crash-dumps-dir=${path.join(home, 'crash-dumps')}`,
  ];

  let userDataDir = null;
  if (includeProfileDir) {
    userDataDir = path.join(home, 'health-check-profile');
    try {
      fs.mkdirSync(userDataDir, { recursive: true, mode: 0o755 });
    } catch {
      /* ignore */
    }
    args.push(`--user-data-dir=${userDataDir}`);
  }

  return { userDataDir, args, home };
}

const UBUNTU_CHROME_PACKAGES = [
  'ca-certificates',
  'fonts-liberation',
  'libasound2',
  'libatk-bridge2.0-0',
  'libatk1.0-0',
  'libcairo2',
  'libcups2',
  'libdbus-1-3',
  'libdrm2',
  'libgbm1',
  'libglib2.0-0',
  'libgtk-3-0',
  'libnspr4',
  'libnss3',
  'libpango-1.0-0',
  'libx11-6',
  'libxcomposite1',
  'libxdamage1',
  'libxext6',
  'libxfixes3',
  'libxkbcommon0',
  'libxrandr2',
  'libxshmfence1',
  'xdg-utils',
];

function resolveChromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    DEFAULT_PATH,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return process.env.CHROME_PATH || DEFAULT_PATH;
}

function getChromeVersion(executablePath) {
  try {
    const out = execSync(`"${executablePath}" --version`, {
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return String(out).trim();
  } catch (err) {
    return null;
  }
}

function testHeadlessLaunch(executablePath) {
  try {
    const { args, userDataDir } = chromeLaunchArgs(true);

    const result = spawnSync(
      executablePath,
      [...args, '--dump-dom', 'about:blank'],
      {
        encoding: 'utf8',
        timeout: 30000,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: chromeSpawnEnv(),
      },
    );

    if (result.status === 0) {
      return { ok: true, error: null, chromeHome: getChromeHome() };
    }

    const stderr = (result.stderr || result.stdout || '').trim();
    return {
      ok: false,
      error: stderr || `Chrome exited with code ${result.status}`,
      chromeHome: getChromeHome(),
      userDataDir,
    };
  } catch (err) {
    return { ok: false, error: err.message || String(err), chromeHome: getChromeHome() };
  }
}

function getPuppeteerConfig() {
  const executablePath = resolveChromePath();
  const exists = fs.existsSync(executablePath);
  const { args: baseArgs } = chromeLaunchArgs(false);

  return {
    headless: true,
    executablePath,
    timeout: parseInt(process.env.PUPPETEER_TIMEOUT_MS || '120000', 10),
    protocolTimeout: parseInt(process.env.PUPPETEER_PROTOCOL_TIMEOUT_MS || '120000', 10),
    env: chromeSpawnEnv(),
    args: [
      ...baseArgs.filter((a) => !a.startsWith('--headless')),
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-hang-monitor',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      ...(process.env.CHROME_EXTRA_ARGS
        ? process.env.CHROME_EXTRA_ARGS.split(',').map((s) => s.trim()).filter(Boolean)
        : []),
    ],
    ...(exists ? {} : { _missingBinary: true }),
  };
}

async function getChromeDiagnostics() {
  const executablePath = resolveChromePath();
  const exists = fs.existsSync(executablePath);
  const version = exists ? getChromeVersion(executablePath) : null;
  const launch = exists ? testHeadlessLaunch(executablePath) : { ok: false, error: 'Chrome binary not found' };

  return {
    platform: process.platform,
    executablePath,
    exists,
    version,
    headlessLaunch: launch.ok,
    launchError: launch.error,
    chromeHome: launch.chromeHome || getChromeHome(),
    env: {
      CHROME_PATH: process.env.CHROME_PATH || null,
      CHROME_HOME: process.env.CHROME_HOME || null,
      PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH || null,
    },
    ubuntuHint: !launch.ok
      ? 'Fix: mkdir -p /var/lib/whatsapp-api/chrome-home && chown -R $USER:$USER /var/lib/whatsapp-api — set CHROME_HOME in .env — or run PM2 as non-root user. Also: sudo bash scripts/ubuntu-chrome-setup.sh'
      : null,
  };
}

async function assertChromeReady() {
  const diag = await getChromeDiagnostics();

  if (!diag.exists) {
    throw new Error(
      `Chrome not found at ${diag.executablePath}. Set CHROME_PATH=/usr/bin/google-chrome in .env`,
    );
  }

  if (!diag.headlessLaunch) {
    const detail = diag.launchError || 'unknown error';
    throw new Error(
      `Chrome failed headless launch (${detail}). Install Ubuntu dependencies: sudo bash scripts/ubuntu-chrome-setup.sh`,
    );
  }

  return diag;
}

function logChromeStartupCheck() {
  getChromeDiagnostics()
    .then((diag) => {
      if (diag.headlessLaunch) {
        console.log(`[chrome] OK — ${diag.executablePath} (${diag.version || 'version unknown'})`);
        return;
      }
      console.error('[chrome] FAILED headless launch');
      console.error(`  path: ${diag.executablePath} (exists: ${diag.exists})`);
      if (diag.version) console.error(`  version: ${diag.version}`);
      if (diag.launchError) console.error(`  error: ${diag.launchError}`);
      if (diag.ubuntuHint) console.error(`  fix: ${diag.ubuntuHint}`);
    })
    .catch((err) => {
      console.error('[chrome] startup check error:', err.message);
    });
}

module.exports = {
  DEFAULT_PATH,
  UBUNTU_CHROME_PACKAGES,
  resolveChromePath,
  getChromeVersion,
  getPuppeteerConfig,
  getChromeDiagnostics,
  assertChromeReady,
  logChromeStartupCheck,
};
