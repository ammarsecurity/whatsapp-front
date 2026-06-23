const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LOCK_FILES = [
  'SingletonLock',
  'SingletonSocket',
  'SingletonCookie',
  'DevToolsActivePort',
  'lockfile',
];

function removeLockFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('Unlocked:', filePath);
    }
  } catch (err) {
    console.log('unlock skip:', filePath, err.message);
  }
}

function unlockSession(sessionPath) {
  try {
    if (!sessionPath || !fs.existsSync(sessionPath)) return;

    const dirs = [sessionPath, path.join(sessionPath, 'Default')];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;

      for (const file of LOCK_FILES) {
        removeLockFile(path.join(dir, file));
      }

      const crashpad = path.join(dir, 'Crashpad');
      if (fs.existsSync(crashpad)) {
        fs.rmSync(crashpad, { recursive: true, force: true });
      }
    }
  } catch (err) {
    console.log('unlockSession error:', err.message);
  }
}

/** Kill orphaned Chrome processes holding this session profile (Linux server). */
function killStaleBrowserForSession(sessionPath) {
  if (process.platform === 'win32' || !sessionPath) return;

  const markers = new Set([
    path.basename(sessionPath),
    sessionPath,
    sessionPath.replace(/\\/g, '/'),
  ]);

  for (const marker of markers) {
    if (!marker) continue;
    try {
      const safe = marker.replace(/"/g, '\\"');
      execSync(`pkill -9 -f "${safe}" 2>/dev/null || true`, { stdio: 'ignore' });
    } catch {
      // pkill returns non-zero when no process matched
    }
  }

  try {
    execSync('sleep 0.5', { stdio: 'ignore' });
  } catch {
    // ignore
  }
}

module.exports = unlockSession;
module.exports.killStaleBrowserForSession = killStaleBrowserForSession;
module.exports.LOCK_FILES = LOCK_FILES;
