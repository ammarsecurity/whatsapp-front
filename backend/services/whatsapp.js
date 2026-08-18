const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const AccountModel = require('../models/Account');
const MessageModel = require('../models/Message');
const { API_BUILD } = require('../config/build');
const {
  getPuppeteerConfig,
  assertChromeReady,
} = require('../config/chrome');
const {
  ACCOUNT_STATUSES,
  AccountNotReadyError,
  isMessagingAllowed,
  isInitInProgress,
  isLiveBootStatus,
} = require('../utils/accountLifecycle');
const { withTimeout } = require('../utils/withTimeout');
const { sendTextSafe } = require('../utils/waClientOps');
const resourceManager = require('./resourceManager');
const {
  classifySessionError,
  isBrowserAlive,
  sessionLooksAuthenticated,
} = require('../utils/sessionErrors');

const RECONNECT_BACKOFF_MS = [5_000, 10_000, 30_000, 60_000, 120_000];
const MAX_RECONNECT_ATTEMPTS = Math.max(
  1,
  parseInt(process.env.WA_MAX_RECONNECT_ATTEMPTS || '8', 10) || 8,
);

const LIVE_STATE_TIMEOUT_MS = 12_000;
const SEND_MESSAGE_TIMEOUT_MS = 45_000;

const incomingHandler = require('./incomingHandler');
const wsHub = require('./wsHub');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());




function parseEnvInt(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : defaultValue;
}

function randomInt(min, max) {
  const a = Math.ceil(min);
  const b = Math.floor(max);
  if (b <= a) return a;
  return Math.floor(Math.random() * (b - a + 1)) + a;
}



/**
 * Helper function to delete directory recursively (compatible with all Node.js versions)
 * @param {string} dirPath - Path to directory to delete
 */
function deleteDirectoryRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  try {
    // Try using fs.rmSync (Node.js 14.14.0+)
    if (fs.rmSync) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } else {
      // Fallback to fs.rmdirSync with recursive option (Node.js 12.10.0+)
      if (fs.rmdirSync.length > 1) {
        fs.rmdirSync(dirPath, { recursive: true });
      } else {
        // Fallback for older Node.js versions - manual deletion
        const files = fs.readdirSync(dirPath);
        files.forEach(file => {
          const filePath = path.join(dirPath, file);
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            deleteDirectoryRecursive(filePath);
          } else {
            fs.unlinkSync(filePath);
          }
        });
        fs.rmdirSync(dirPath);
      }
    }
  } catch (err) {
    console.error(`Error deleting directory ${dirPath}:`, err.message);
    throw err;
  }
}

class WhatsAppService {
  constructor() {
    this.accounts = new Map(); // Map<accountKey, accountData> — one Chrome per account
    this.initLocks = new Map(); // Map<accountKey, Promise<void>>
    this.initializingAccounts = new Set();
    this.reconnectTimers = new Map();
    this.reconnectAttempts = new Map();
    this.qrTimers = new Map();
    this.lastSendAtMs = new Map();
    this.activeStarts = 0;
    this._generationSeq = 0;
    this.loadAccountsFromDb();
    this._startSessionKeepalive();
    this._startIdleUnloader();
    require('./outbox').startWorker();
  }

  _liveBrowserCount() {
    let n = 0;
    for (const acc of this.accounts.values()) {
      if (acc.client && !acc.browserDead && isBrowserAlive(acc.client)) n += 1;
    }
    return n;
  }

  _resourceSnapshot() {
    return resourceManager.getSnapshot({
      liveInstances: this._liveBrowserCount(),
      activeStarts: this.activeStarts,
    });
  }

  _isLiveInstance(account) {
    return !!(
      account &&
      account.client &&
      !account.browserDead &&
      isBrowserAlive(account.client)
    );
  }

  _sessionPath(accountId, userId) {
    const accountKey = this._getAccountKey(accountId, userId);
    return path.join(
      process.env.SESSION_PATH || './.wwebjs_auth',
      `session-${accountKey}`,
    );
  }

  hasParkedSession(accountId, userId) {
    if (this._isLiveInstance(this.getAccount(accountId, userId))) return false;
    return sessionLooksAuthenticated(this._sessionPath(accountId, userId));
  }

  _clearQrTimer(accountKey) {
    const timer = this.qrTimers.get(accountKey);
    if (timer) {
      clearTimeout(timer);
      this.qrTimers.delete(accountKey);
    }
  }

  _armQrTimeout(account) {
    if (!account) return;
    const accountKey = this._getAccountKey(account.accountId, account.userId);
    if (this.qrTimers.has(accountKey)) return;
    const timeoutMs = Math.max(
      30000,
      parseInt(process.env.WA_QR_TIMEOUT_MS || '120000', 10) || 120000,
    );
    const generation = account.generation;
    const timer = setTimeout(() => {
      this.qrTimers.delete(accountKey);
      const current = this.accounts.get(accountKey);
      if (!current || current.generation !== generation) return;
      if (current.status !== ACCOUNT_STATUSES.QR) return;
      this._parkBrowser(current, 'qr-timeout').catch(() => {});
    }, timeoutMs);
    this.qrTimers.set(accountKey, timer);
  }

  async _parkLruIdleToMakeRoom(exceptAccountId, exceptUserId) {
    const idleFloor = Math.max(
      60000,
      parseInt(process.env.WA_PRESSURE_IDLE_MS || '120000', 10) || 120000,
    );
    const now = Date.now();
    let oldest = null;
    for (const account of this.accounts.values()) {
      if (account.accountId === exceptAccountId && account.userId === exceptUserId) continue;
      if (account.status !== ACCOUNT_STATUSES.READY || !this._isLiveInstance(account)) continue;
      const last = account.lastUsedAt || 0;
      if (!last || now - last < idleFloor) continue;
      if (!oldest || last < (oldest.lastUsedAt || 0)) oldest = account;
    }
    if (!oldest) return false;
    await this._parkBrowser(oldest, 'resource-pressure');
    return true;
  }

  async _waitForBrowserSlot(accountId, userId) {
    const maxWait = Math.max(
      5000,
      parseInt(process.env.WA_START_WAIT_MS || '45000', 10) || 45000,
    );
    const started = Date.now();
    while (Date.now() - started < maxWait) {
      const snap = this._resourceSnapshot();
      if (snap.canLaunch) return true;
      const parked = await this._parkLruIdleToMakeRoom(accountId, userId);
      if (parked) continue;
      console.warn(
        `[${accountId}] Waiting for browser slot (${snap.reason || 'busy'})`,
      );
      await new Promise((r) => setTimeout(r, 3000));
    }
    return this._resourceSnapshot().canLaunch;
  }

  async _acquireStartSlot() {
    const max = Math.max(
      1,
      parseInt(process.env.WA_MAX_CONCURRENT_STARTS || '1', 10) || 1,
    );
    while (this.activeStarts >= max) {
      await new Promise((r) => setTimeout(r, 500));
    }
    this.activeStarts += 1;
  }

  _releaseStartSlot() {
    this.activeStarts = Math.max(0, this.activeStarts - 1);
  }

  _qrParkAfter() {
    return Math.max(3, parseInt(process.env.WA_QR_PARK_AFTER || '6', 10) || 6);
  }

  _touchAccount(account) {
    if (account) account.lastUsedAt = Date.now();
  }

  _startIdleUnloader() {
    const idleMs = parseInt(process.env.WA_IDLE_UNLOAD_MS || '900000', 10);
    if (!Number.isFinite(idleMs) || idleMs <= 0) return;
    setInterval(() => {
      this._unloadIdleSessions().catch((err) => {
        console.warn('[idle-unload] tick failed:', err.message);
      });
    }, 60000);
  }

  async _parkBrowser(account, reason) {
    if (!account) return;
    const { accountId, userId, client } = account;
    const accountKey = this._getAccountKey(accountId, userId);
    if (account.parking) return;
    account.parking = true;
    account.generation = (account.generation || 0) + 1;
    const qrPark = reason === 'qr-waiting' || reason === 'qr-timeout';
    console.log(`[${accountId}] Parking Chrome (${reason}) — LocalAuth kept on disk.`);
    this._clearReconnectTimer(accountKey);
    this._clearQrTimer(accountKey);
    if (account.initWatchdog) {
      clearTimeout(account.initWatchdog);
      account.initWatchdog = null;
    }
    await this._safeDestroyClient(client, accountId);
    this.accounts.delete(accountKey);
    this.initializingAccounts.delete(accountKey);
    const hasCreds = sessionLooksAuthenticated(this._sessionPath(accountId, userId));
    if (hasCreds) {
      await AccountModel.updateStatus(accountId, userId, true, false).catch(() => {});
    } else if (qrPark) {
      await AccountModel.updateStatus(accountId, userId, false, false).catch(() => {});
    }
  }

  async _unloadIdleSessions() {
    const idleMs = parseInt(process.env.WA_IDLE_UNLOAD_MS || '900000', 10);
    if (!Number.isFinite(idleMs) || idleMs <= 0) return;
    const now = Date.now();
    for (const account of [...this.accounts.values()]) {
      if (account.status === ACCOUNT_STATUSES.QR && (account.qrCount || 0) >= this._qrParkAfter()) {
        await this._parkBrowser(account, 'qr-waiting');
        continue;
      }
      if (account.status !== ACCOUNT_STATUSES.READY || !account.client) continue;
      const last = account.lastUsedAt || (account.createdAt instanceof Date ? account.createdAt.getTime() : 0);
      if (!last || now - last < idleMs) continue;
      await this._parkBrowser(account, 'idle');
    }
  }

  _startSessionKeepalive() {
    const intervalMs = parseInt(process.env.WA_SESSION_KEEPALIVE_MS || '0', 10);
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;
    setInterval(() => {
      this._pingReadySessions().catch((err) => {
        console.warn('[keepalive] tick failed:', err.message);
      });
    }, intervalMs);
  }

  async _pingReadySessions() {
    for (const account of this.accounts.values()) {
      if (account.status !== ACCOUNT_STATUSES.READY || !account.client) continue;
      if (this._isLiveInstance(account)) continue;
      console.warn(`[${account.accountId}] Keepalive: browser dead — recovering (LocalAuth kept)`);
      await this._beginCrashRecovery(
        account,
        account.accountId,
        account.userId,
        'keepalive-dead-browser',
      );
    }
  }

  _setAccountStatus(accountData, accountId, status) {
    if (!accountData) return;
    const prev = accountData.status;
    accountData.status = status;
    if (prev !== status) {
      console.log(`[${accountId}] STATUS => ${status}`);
      const uid = accountData.userId;
      if (uid) {
        if (status === ACCOUNT_STATUSES.READY) {
          wsHub.broadcast(uid, 'account.ready', { accountId, status });
          require('./webhookDispatcher').dispatch(uid, 'account.ready', { accountId, status });
          require('./outbox').flushAccount(accountId, uid).catch((err) => {
            console.warn(`[${accountId}] outbox flush:`, err.message);
          });
        } else if (
          status === ACCOUNT_STATUSES.LOGGED_OUT ||
          status === ACCOUNT_STATUSES.DISCONNECTED ||
          status === ACCOUNT_STATUSES.FAILED
        ) {
          wsHub.broadcast(uid, 'account.disconnected', { accountId, status });
          require('./webhookDispatcher').dispatch(uid, 'account.disconnected', { accountId, status });
        }
      }
    }
    if (status === ACCOUNT_STATUSES.READY) {
      accountData.isReady = true;
      accountData.isConnected = true;
      accountData.qrCode = null;
      accountData.initError = null;
      accountData.browserDead = false;
      accountData.recovering = false;
      this.reconnectAttempts.delete(this._getAccountKey(accountData.accountId, accountData.userId));
    } else if (
      isInitInProgress(status) ||
      status === ACCOUNT_STATUSES.DISCONNECTED ||
      status === ACCOUNT_STATUSES.STOPPED
    ) {
      accountData.isReady = false;
      accountData.isConnected = false;
    } else if (
      status === ACCOUNT_STATUSES.LOGGED_OUT ||
      status === ACCOUNT_STATUSES.FAILED
    ) {
      accountData.isReady = false;
      accountData.isConnected = false;
      accountData.qrCode = null;
    }
    this._refreshGlobalReadyFlag();
  }

  _refreshGlobalReadyFlag() {
    let anyReady = false;
    for (const acc of this.accounts.values()) {
      if (acc.status === ACCOUNT_STATUSES.READY && acc.isReady) {
        anyReady = true;
        break;
      }
    }
    global.systemReady = anyReady;
  }

  /**
   * Block message/history routes while account is pairing or loading.
   * Allows DB reads when session is not in memory or logged out.
   */
  async assertAccountNotBusy(accountId, userId) {
    const trimmed = String(accountId || '').trim();
    if (!trimmed) throw new Error('accountId is required');

    const exists = await AccountModel.exists(trimmed, userId);
    if (!exists) {
      throw new Error(`Account with ID "${trimmed}" not found for this user`);
    }

    const accountKey = this._getAccountKey(trimmed, userId);
    if (this.initializingAccounts.has(accountKey)) {
      throw new AccountNotReadyError(trimmed, ACCOUNT_STATUSES.INITIALIZING);
    }

    const account = this.accounts.get(accountKey);
    if (account && isInitInProgress(account.status)) {
      throw new AccountNotReadyError(trimmed, account.status);
    }
  }

  /**
   * Returns account + client only when status === ready and client.info exists.
   * @throws {AccountNotReadyError}
   */
  async ensureAccountReady(accountId, userId) {
    const trimmed = String(accountId || '').trim();
    if (!trimmed) {
      throw new Error('accountId is required');
    }

    const accountKey = this._getAccountKey(trimmed, userId);

    if (this.initializingAccounts.has(accountKey)) {
      const pending = this.accounts.get(accountKey);
      if (pending) {
        try {
          await this._waitForAccountReady(pending, 25000);
        } catch {
          throw new AccountNotReadyError(trimmed, pending.status || ACCOUNT_STATUSES.INITIALIZING);
        }
      } else {
        throw new AccountNotReadyError(trimmed, ACCOUNT_STATUSES.INITIALIZING);
      }
    }

    let account = this.accounts.get(accountKey);
    const exists = await AccountModel.exists(trimmed, userId);
    if (!exists) {
      throw new Error(`Account with ID "${trimmed}" not found for this user`);
    }

    if (!account) {
      const sessionPath = path.join(
        process.env.SESSION_PATH || './.wwebjs_auth',
        `session-${accountKey}`,
      );
      if (fs.existsSync(sessionPath)) {
        console.log(`[${trimmed}] Waking parked session for send...`);
        await this._initializeClientOnce(trimmed, userId);
        account = this.accounts.get(accountKey);
      }
    }

    if (!account) {
      throw new AccountNotReadyError(trimmed, ACCOUNT_STATUSES.DISCONNECTED);
    }

    const status = account.status || ACCOUNT_STATUSES.INITIALIZING;
    if (isInitInProgress(status)) {
      try {
        await this._waitForAccountReady(account, 25000);
      } catch {
        throw new AccountNotReadyError(trimmed, account.status || status);
      }
    }

    const readyStatus = account.status || ACCOUNT_STATUSES.INITIALIZING;
    if (!isMessagingAllowed(readyStatus)) {
      throw new AccountNotReadyError(trimmed, readyStatus);
    }

    if (!account.client) {
      throw new AccountNotReadyError(trimmed, ACCOUNT_STATUSES.DISCONNECTED);
    }

    // Never poke Chrome with getState() here — it hangs under RAM pressure and kills sessions.
    if (!this._isLiveInstance(account)) {
      await this._beginCrashRecovery(account, trimmed, userId, 'ready-but-browser-dead');
      throw new AccountNotReadyError(trimmed, ACCOUNT_STATUSES.RECONNECTING);
    }
    return account;
  }

  _handleClientProtocolError(account, accountId, userId, err) {
    const kind = classifySessionError(err);
    const msg = err?.message || String(err);

    if (kind === 'timeout') {
      console.warn(`[${accountId}] Chrome timeout (non-fatal, LocalAuth kept):`, msg);
      return kind;
    }

    if (kind === 'logout') {
      return kind;
    }

    if (kind === 'crash') {
      console.error(`[${accountId}] Browser crash (LocalAuth kept):`, msg);
      this._beginCrashRecovery(account, accountId, userId, msg).catch(() => {});
      return kind;
    }

    console.warn(`[${accountId}] Protocol warning (ignored):`, msg);
    return kind;
  }

  async _beginCrashRecovery(account, accountId, userId, reason) {
    if (!account) return;
    const accountKey = this._getAccountKey(accountId, userId);
    if (account.recovering) return;
    account.recovering = true;
    account.browserDead = true;
    account.generation = (account.generation || 0) + 1;
    this._clearQrTimer(accountKey);
    if (account.initWatchdog) {
      clearTimeout(account.initWatchdog);
      account.initWatchdog = null;
    }
    this._setAccountStatus(account, accountId, ACCOUNT_STATUSES.RECONNECTING);
    account.initError = String(reason || 'browser crash');
    account.client = account.client || null;

    const hasCreds = sessionLooksAuthenticated(this._sessionPath(accountId, userId));
    if (hasCreds) {
      await AccountModel.updateStatus(accountId, userId, true, false).catch(() => {});
    }

    await this._safeDestroyClient(account.client, accountId);
    account.client = null;
    this.initializingAccounts.delete(accountKey);

    console.log(`[${accountId}] Crash recovery — session files kept, scheduling restore`);
    this._scheduleReconnect(accountId, userId, reason);
  }

  async _assertLiveConnected(account, accountId, userId) {
    if (!account?.client) {
      throw new AccountNotReadyError(accountId, ACCOUNT_STATUSES.DISCONNECTED);
    }
    if (!this._isLiveInstance(account)) {
      await this._beginCrashRecovery(account, accountId, userId, 'browser-not-alive');
      throw new AccountNotReadyError(accountId, ACCOUNT_STATUSES.RECONNECTING);
    }
  }

  _clearReconnectTimer(accountKey) {
    const timer = this.reconnectTimers.get(accountKey);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(accountKey);
    }
  }

  async _safeDestroyClient(client, accountId) {
    if (!client) return;
    try {
      client.removeAllListeners();
      await client.destroy();
    } catch (err) {
      const msg = err?.message || '';
      if (
        err?.name === 'TargetCloseError' ||
        msg.includes('Target closed') ||
        msg.includes('detached Frame') ||
        msg.includes('Session closed')
      ) {
        console.log(`[${accountId}] Browser already closed during destroy (safe)`);
        return;
      }
      console.warn(`[${accountId}] destroy warning:`, msg);
    }
  }

  _scheduleReconnect(accountId, userId, reason, delayMs) {
    const accountKey = this._getAccountKey(accountId, userId);
    const kind = classifySessionError(reason);

    if (kind === 'logout' || String(reason || '').toUpperCase() === 'LOGOUT') {
      console.log(
        `[${accountId}] Session logged out on WhatsApp. Scan QR again to reconnect (auto-reconnect skipped).`,
      );
      return;
    }

    if (this.reconnectTimers.has(accountKey)) return;

    const attempts = this.reconnectAttempts.get(accountKey) || 0;
    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      const acc = this.accounts.get(accountKey);
      console.error(
        `[${accountId}] Reconnect gave up after ${attempts} attempts (LocalAuth kept)`,
      );
      if (acc) {
        this._setAccountStatus(acc, accountId, ACCOUNT_STATUSES.FAILED);
        acc.initError = `Reconnect exhausted after ${attempts} attempts`;
      }
      return;
    }

    const delay =
      delayMs != null
        ? delayMs
        : RECONNECT_BACKOFF_MS[Math.min(attempts, RECONNECT_BACKOFF_MS.length - 1)];
    this.reconnectAttempts.set(accountKey, attempts + 1);

    console.log(
      `[${accountId}] Scheduling restore in ${Math.round(delay / 1000)}s (attempt ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})`,
    );

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(accountKey);
      try {
        await this._initializeClientOnce(accountId, userId);
      } catch (err) {
        console.error(`[${accountId}] Reconnect failed:`, err.message);
        this._scheduleReconnect(accountId, userId, err.message);
      }
    }, delay);

    this.reconnectTimers.set(accountKey, timer);
  }

  async getOrLoadAccount(accountId, userId) {

    const accountKey = `${userId}_${accountId}`;

    // موجود بالذاكرة
    if (this.accounts.has(accountKey))
      return this.accounts.get(accountKey);

    // موجود بالداتابيس ؟
    const exists = await AccountModel.exists(accountId, userId);
    if (!exists)
      throw new Error('Account not found');

    // أنشئه
    await this._initializeClientOnce(accountId, userId);

    // انتظر حتى ينضاف للذاكرة
    let retries = 0;
    while (!this.accounts.has(accountKey) && retries < 20) {
      await new Promise(r => setTimeout(r, 300));
      retries++;
    }

    if (!this.accounts.has(accountKey))
      throw new Error('Failed to load WhatsApp session');

    return this.accounts.get(accountKey);
  }


  _getAccountKey(accountId, userId) {
    return `${userId}_${accountId}`;
  }

  _getQueueSettings() {
    const minDelayMs = Math.max(0, parseEnvInt('WA_ANTIBAN_MIN_DELAY_MS', 1200));
    const maxDelayMs = Math.max(minDelayMs, parseEnvInt('WA_ANTIBAN_MAX_DELAY_MS', 5000));
    const minGapMs = Math.max(0, parseEnvInt('WA_MIN_GAP_BETWEEN_MESSAGES_MS', 1500));
    const presenceDelayMinMs = Math.max(0, parseEnvInt('WA_PRESENCE_DELAY_MIN_MS', 250));
    const presenceDelayMaxMs = Math.max(presenceDelayMinMs, parseEnvInt('WA_PRESENCE_DELAY_MAX_MS', 900));
    const readyTimeoutMs = Math.max(5_000, parseEnvInt('WA_CLIENT_READY_TIMEOUT_MS', 60_000));

    return {
      minDelayMs,
      maxDelayMs,
      minGapMs,
      presenceDelayMinMs,
      presenceDelayMaxMs,
      readyTimeoutMs
    };
  }

  _markSentNow(accountKey) {
    this.lastSendAtMs.set(accountKey, Date.now());
  }


  async _initializeClientOnce(accountId, userId) {
    const accountKey = this._getAccountKey(accountId, userId);

    const existing = this.accounts.get(accountKey);
    if (existing && this._isLiveInstance(existing) && existing.status === ACCOUNT_STATUSES.READY) {
      return existing;
    }
    if (existing && this._isLiveInstance(existing) && isLiveBootStatus(existing.status)) {
      console.log(`[${accountId}] Initialize skipped — already ${existing.status} (single instance)`);
      if (existing.initPromise) await existing.initPromise.catch(() => {});
      return existing;
    }

    if (this.initializingAccounts.has(accountKey)) {
      const lock = this.initLocks.get(accountKey);
      if (lock) await lock;
      return this.accounts.get(accountKey);
    }

    const pendingLock = this.initLocks.get(accountKey);
    if (pendingLock) {
      await pendingLock;
      return this.accounts.get(accountKey);
    }

    this.initializingAccounts.add(accountKey);

    const initPromise = (async () => {
      try {
        const live = this.accounts.get(accountKey);
        if (live && this._isLiveInstance(live) && live.status === ACCOUNT_STATUSES.READY) {
          return live;
        }
        const slot = await this._waitForBrowserSlot(accountId, userId);
        if (!slot) {
          const err = new Error(
            `Server under resource pressure (${this._resourceSnapshot().reason}). WhatsApp start deferred.`,
          );
          if (live) {
            this._setAccountStatus(live, accountId, ACCOUNT_STATUSES.STOPPED);
            live.initError = err.message;
          }
          throw err;
        }
        await this._acquireStartSlot();
        try {
          await this._initializeClient(accountId, userId);
        } finally {
          this._releaseStartSlot();
        }
      } finally {
        this.initializingAccounts.delete(accountKey);
      }
    })();

    this.initLocks.set(accountKey, initPromise);
    try {
      await initPromise;
    } finally {
      this.initLocks.delete(accountKey);
    }
    return this.accounts.get(accountKey);
  }

  /**
   * Ensure the account exists, is connected, and the client is ready.
   * This also prevents double initialization with an init lock.
   * @private
   */
  async _ensureAccountReady(accountId, userId) {
    return this.ensureAccountReady(accountId, userId);
  }


  _formatPhoneNumber(phoneNumber) {
    // Remove @c.us if already present to clean the number first
    let cleanedNumber = String(phoneNumber || '').trim();
    if (cleanedNumber.includes('@')) {
      cleanedNumber = cleanedNumber.split('@')[0];
    }

    // Remove +, spaces, dashes, parentheses, and other non-digit characters except digits
    cleanedNumber = cleanedNumber.replace(/[^\d]/g, '');

    if (!cleanedNumber) {
      throw new Error('Invalid phone number format');
    }

    return {
      cleanedNumber,
      formattedNumber: `${cleanedNumber}@c.us`
    };
  }

  /**
   * Load accounts from database and initialize clients
   * By default, auto-loading is disabled to save memory. Accounts will be loaded on-demand.
   */
  async loadAccountsFromDb() {
    try {
      const dbAccounts = await AccountModel.findAll();
      console.log(`Found ${dbAccounts.length} accounts in database.`);

      // التحقق من متغير البيئة للتحكم في التحميل التلقائي
      const autoLoad = process.env.AUTO_LOAD_ACCOUNTS !== 'false';
      const maxLoad = parseInt(process.env.MAX_AUTO_LOAD_ACCOUNTS || '3', 10);
      const maxLive = Math.max(0, parseInt(process.env.WA_MAX_LIVE_SESSIONS || '4', 10) || 4);
      const sessionRoot = process.env.SESSION_PATH || './.wwebjs_auth';

      const restoreFromDisk = async (limit) => {
        let loadedCount = 0;
        const cap = limit > 0 ? limit : maxLive > 0 ? maxLive : dbAccounts.length;
        for (const dbAccount of dbAccounts) {
          if (loadedCount >= cap) {
            console.log(`Reached session restore limit (${cap}). Remaining accounts stay parked.`);
            break;
          }
          const accountKey = `${dbAccount.user_id}_${dbAccount.account_id}`;
          if (this.accounts.has(accountKey)) continue;
          const sessionPath = path.join(sessionRoot, `session-${accountKey}`);
          if (!sessionLooksAuthenticated(sessionPath) && !dbAccount.is_ready) continue;
          console.log(`[${dbAccount.account_id}] Restoring saved session for user ${dbAccount.user_id}...`);
          try {
            await this._initializeClientOnce(dbAccount.account_id, dbAccount.user_id);
            loadedCount += 1;
          } catch (initError) {
            console.error(`[${dbAccount.account_id}] Session restore failed:`, initError.message);
          }
        }
        if (loadedCount > 0) {
          console.log(`Restored ${loadedCount} WhatsApp session(s) from disk.`);
        }
        return loadedCount;
      };

      if (!autoLoad) {
        console.log('Full auto-load disabled. Restoring authenticated session folders only.');
        await restoreFromDisk(maxLoad > 0 ? maxLoad : maxLive);
        return;
      }

      const cap = maxLoad > 0 ? maxLoad : maxLive;
      console.log(`Auto-loading ready accounts (cap ${cap})`);
      await restoreFromDisk(cap);
    } catch (error) {
      console.error('Error loading accounts from database:', error);
    }
  }

  /**
   * Puppeteer options tuned for Ubuntu headless Chrome.
   * @returns {object}
   * @private
   */
  _getPuppeteerOptions() {
    const config = getPuppeteerConfig();
    console.log(`[puppeteer] Chrome: ${config.executablePath}`);
    return config;
  }

  async _ensureChromeReady(accountId) {
    try {
      await assertChromeReady();
    } catch (err) {
      const msg = err.message || String(err);
      console.error(`[${accountId}] Chrome check failed:`, msg);
      throw err;
    }
  }

  async _waitForAccountReady(account, timeoutMs = 60000) {
    if (!account) throw new Error('Account not initialized');
    if (account.status === ACCOUNT_STATUSES.READY && account.isReady === true) return true;

    return new Promise((resolve, reject) => {
      let finished = false;

      const done = (result, err) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        clearInterval(tick);
        if (account.client) {
          account.client.removeListener('ready', onReady);
          account.client.removeListener('disconnected', onDisconnect);
          account.client.removeListener('auth_failure', onFail);
        }
        err ? reject(err) : resolve(result);
      };

      const onReady = () => done(true);
      const onDisconnect = () => done(false, new Error('WhatsApp disconnected'));
      const onFail = () => done(false, new Error('WhatsApp auth failure'));
      const tick = setInterval(() => {
        if (account.status === ACCOUNT_STATUSES.READY && account.isReady === true) done(true);
      }, 400);

      const timer = setTimeout(() => {
        done(false, new Error('WhatsApp ready timeout'));
      }, timeoutMs);

      if (account.client) {
        account.client.on('ready', onReady);
        account.client.on('disconnected', onDisconnect);
        account.client.on('auth_failure', onFail);
      }
    });
  }



  /**
   * Internal helper to initialize a WhatsApp client
   * @param {string} accountId
   * @param {number} userId
   * @private
   */

  async _initializeClient(accountId, userId) {

    const unlockSession = require('../utils/unlockSession');
    const { killStaleBrowserForSession } = require('../utils/unlockSession');
    const accountKey = `${userId}_${accountId}`;

    const live = this.accounts.get(accountKey);
    if (live && this._isLiveInstance(live) && live.status === ACCOUNT_STATUSES.READY) {
      console.log(`[${accountId}] Reuse existing READY instance — no second Chrome`);
      return;
    }

    await this._ensureChromeReady(accountId);

    const sessionPath = path.join(
      process.env.SESSION_PATH || './.wwebjs_auth',
      `session-${accountKey}`
    );

    if (fs.existsSync(sessionPath)) {
      unlockSession(sessionPath);
      killStaleBrowserForSession(sessionPath);
      console.log(`[${accountId}] 🔓 Lock files cleared`);
    }

    this._clearReconnectTimer(accountKey);
    this._clearQrTimer(accountKey);

    if (this.accounts.has(accountKey)) {
      const old = this.accounts.get(accountKey);
      old.generation = (old.generation || 0) + 1;
      console.log(`[${accountId}] Replacing dead/stale client (generation ${old.generation})`);
      await this._safeDestroyClient(old?.client, accountId);
      this.accounts.delete(accountKey);
    }

    fs.mkdirSync(sessionPath, { recursive: true });

    const generation = ++this._generationSeq;

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: accountKey,
        dataPath: process.env.SESSION_PATH || './.wwebjs_auth'
      }),
      puppeteer: this._getPuppeteerOptions()
    });

    const stillCurrent = () => {
      const current = this.accounts.get(accountKey);
      return current && current.generation === generation && current.client === client;
    };

    const accountData = {
      accountId,
      userId,
      client,
      generation,
      qrCode: null,
      isReady: false,
      isConnected: false,
      status: ACCOUNT_STATUSES.INITIALIZING,
      reconnecting: false,
      recovering: false,
      browserDead: false,
      lastState: ACCOUNT_STATUSES.INITIALIZING,
      initError: null,
      lastUsedAt: Date.now(),
      createdAt: new Date()
    };

    this.accounts.set(accountKey, accountData);
    this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.INITIALIZING);

    client.on('loading_screen', (percent, message) => {
      if (!stillCurrent()) return;
      console.log(`[${accountId}] Loading ${percent}% ${message}`);
      this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.LOADING);
    });

    client.on('qr', (qr) => {
      if (!stillCurrent()) return;
      accountData.qrCount = (accountData.qrCount || 0) + 1;
      console.log(`[${accountId}] QR GENERATED (${accountData.qrCount})`);
      accountData.qrCode = qr;
      this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.QR);
      this._armQrTimeout(accountData);
      if (accountData.qrCount >= this._qrParkAfter()) {
        console.log(`[${accountId}] QR not scanned after ${accountData.qrCount} refreshes — parking Chrome`);
        this._parkBrowser(accountData, 'qr-waiting').catch(() => {});
      }
    });

    client.on('change_state', async (state) => {
      if (!stillCurrent()) return;
      accountData.lastState = state;
      console.log(`[${accountId}] STATE -> ${state}`);

      if (state === 'OPENING' || state === 'PAIRING') {
        if (accountData.status !== ACCOUNT_STATUSES.READY) {
          this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.PAIRING);
        }
        return;
      }

      if (state === 'CONNECTED' && accountData.status === ACCOUNT_STATUSES.READY) {
        await AccountModel.updateStatus(accountId, userId, true, true);
        return;
      }

      if (state === 'UNPAIRED' || state === 'UNLAUNCHED') {
        this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.LOGGED_OUT);
        await AccountModel.updateStatus(accountId, userId, false, false);
        console.log(`[${accountId}] SESSION LOST (${state})`);
      }
    });

    client.on('authenticated', () => {
      if (!stillCurrent()) return;
      console.log(`[${accountId}] Authenticated — LocalAuth saved`);
      this._clearQrTimer(accountKey);
      this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.AUTHENTICATED);
    });

    client.on('ready', async () => {
      if (!stillCurrent()) return;
      console.log(`[${accountId}] WHATSAPP READY`);
      accountData.qrCount = 0;
      this._clearQrTimer(accountKey);
      this._touchAccount(accountData);
      this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.READY);
      await AccountModel.updateStatus(accountId, userId, true, true);
    });

    client.on('message', async (msg) => {
      if (!stillCurrent()) return;
      await incomingHandler.handleIncoming(accountId, userId, msg, client);
    });

    client.on('auth_failure', async (msg) => {
      if (!stillCurrent()) return;
      console.log(`[${accountId}] AUTH FAILURE`, msg);
      this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.FAILED);
      accountData.initError = String(msg);
      await AccountModel.updateStatus(accountId, userId, false, false);
    });

    client.on('disconnected', async (reason) => {
      if (!stillCurrent()) return;
      if (accountData.recovering) return;

      const reasonUpper = String(reason || '').toUpperCase();
      console.log(`[${accountId}] DISCONNECTED: ${reason}`);

      if (reasonUpper === 'LOGOUT') {
        this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.LOGGED_OUT);
        await AccountModel.updateStatus(accountId, userId, false, false);
        await this._safeDestroyClient(client, accountId);
        try {
          await this._clearSessionFiles(accountId, userId);
        } catch (err) {
          console.warn(`[${accountId}] Could not clear session after LOGOUT:`, err.message);
        }
        this.initializingAccounts.delete(accountKey);
        return;
      }

      await this._beginCrashRecovery(accountData, accountId, userId, reason);
    });

    const runInitialize = async (attempt = 1) => {
      if (!stillCurrent()) return;
      try {
        console.log(`[${accountId}] Starting WhatsApp (attempt ${attempt})...`);
        await client.initialize();
        console.log(`[${accountId}] initialize() completed`);
      } catch (err) {
        if (!stillCurrent()) return;
        const msg = err?.message || String(err);
        const kind = classifySessionError(err);
        console.error(`[${accountId}] initialize() failed:`, msg);
        accountData.initError = msg;

        if (msg.includes('browser is already running') && attempt < 3) {
          console.log(`[${accountId}] Retrying after killing stale browser (${attempt}/3)...`);
          unlockSession(sessionPath);
          killStaleBrowserForSession(sessionPath);
          await this._safeDestroyClient(client, accountId);
          await new Promise((r) => setTimeout(r, 3000));
          return runInitialize(attempt + 1);
        }

        if (kind === 'timeout') {
          console.warn(`[${accountId}] initialize timeout — keeping LocalAuth, will restore`);
          await this._beginCrashRecovery(accountData, accountId, userId, msg);
          return;
        }

        if (kind === 'crash' || msg.includes('browser is already running')) {
          await this._beginCrashRecovery(accountData, accountId, userId, msg);
          return;
        }

        this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.FAILED);
        accountData.initError = msg;
      }
    };

    accountData.initPromise = (async () => {
      await new Promise((r) => setTimeout(r, 1000));
      await runInitialize();
    })();

    try {
      await accountData.initPromise.catch(() => {});
    } catch (err) {
      console.error(`[${accountId}] INIT FAILED`, err.message);
    }

    const initWatchdog = setTimeout(() => {
      const current = this.accounts.get(accountKey);
      if (!current || current.generation !== generation) return;
      if (
        current &&
        !current.isConnected &&
        !current.qrCode &&
        current.status !== ACCOUNT_STATUSES.READY &&
        isLiveBootStatus(current.status)
      ) {
        console.log(`[${accountId}] INIT TIMEOUT — parking Chrome, LocalAuth kept`);
        current.initError =
          'WhatsApp did not become ready within 3 minutes. Session files were kept; retry later.';
        this._parkBrowser(current, 'init-timeout').catch(() => {});
      }
    }, 180000);
    accountData.initWatchdog = initWatchdog;
  }

  /**
   * Create a new WhatsApp account
   * @param {string} accountId - Unique identifier for the account
   * @param {number} userId - User ID who owns this account
   * @returns {Promise<void>}
   */

  async createAccount(accountId, userId) {

    if (!accountId || typeof accountId !== 'string' || accountId.trim().length === 0)
      throw new Error('accountId is required and must be a non-empty string');

    if (!userId || typeof userId !== 'number')
      throw new Error('userId is required and must be a number');

    const accountKey = `${userId}_${accountId}`;

    // موجود بالذاكرة
    if (this.accounts.has(accountKey))
      throw new Error(`Account with ID "${accountId}" already exists for this user`);

    // موجود بالداتابيس
    const exists = await AccountModel.exists(accountId, userId);
    if (exists)
      throw new Error(`Account with ID "${accountId}" already exists for this user`);

    // 1️⃣ نسجل فقط في الداتابيس
    await AccountModel.create(accountId, userId);

    console.log(`Account registered in DB: ${accountId}`);

    // 2️⃣ ثم نشغل العميل الحقيقي (النظام الموحد)
    await this._initializeClientOnce(accountId, userId);

    return {
      success: true,
      message: `Account "${accountId}" created successfully`
    };
  }


  /**
   * Get account by ID and userId
   * @param {string} accountId
   * @param {number} userId
   * @returns {object|null}
   */
  getAccount(accountId, userId) {
    if (!accountId || !userId) {
      return null;
    }
    const accountKey = `${userId}_${accountId}`;
    return this.accounts.get(accountKey) || null;
  }

  /**
   * Get all accounts for a specific user
   * @param {number} userId
   * @returns {Promise<Array>}
   */
  async getAllAccounts(userId) {
    // Get from database for persistence
    const dbAccounts = await AccountModel.findAllByUserId(userId);

    // Merge with in-memory accounts for real-time status
    const accountsMap = new Map();

    // Add database accounts — never show ready if session is not in memory
    dbAccounts.forEach(dbAccount => {
      const accountKey = `${userId}_${dbAccount.account_id}`;
      const mem = this.accounts.get(accountKey);
      if (mem) {
        accountsMap.set(dbAccount.account_id, {
          accountId: dbAccount.account_id,
          userId: dbAccount.user_id,
          note: dbAccount.note || '',
          status: mem.status,
          isReady: mem.isReady,
          isConnected: mem.isConnected,
          hasQrCode: !!mem.qrCode,
          parked: false,
          createdAt: dbAccount.created_at,
          updatedAt: dbAccount.updated_at,
        });
      } else {
        const sessionPath = path.join(
          process.env.SESSION_PATH || './.wwebjs_auth',
          `session-${accountKey}`,
        );
        const hasCreds = sessionLooksAuthenticated(sessionPath);
        accountsMap.set(dbAccount.account_id, {
          accountId: dbAccount.account_id,
          userId: dbAccount.user_id,
          note: dbAccount.note || '',
          status: hasCreds ? ACCOUNT_STATUSES.STOPPED : ACCOUNT_STATUSES.LOGGED_OUT,
          isReady: false,
          isConnected: false,
          parked: hasCreds,
          needsQr: !hasCreds,
          createdAt: dbAccount.created_at,
          updatedAt: dbAccount.updated_at,
        });
      }
    });

    // In-memory accounts missing from DB merge (edge case)
    this.accounts.forEach((account) => {
      if (account.userId !== userId || accountsMap.has(account.accountId)) {
        return;
      }
      accountsMap.set(account.accountId, {
        accountId: account.accountId,
        userId: account.userId,
        status: account.status,
        isReady: account.isReady,
        isConnected: account.isConnected,
        hasQrCode: !!account.qrCode,
        createdAt: account.createdAt,
        updatedAt: null,
      });
    });

    return Array.from(accountsMap.values());
  }

  /**
   * Admin: all WhatsApp accounts across every user, merged with live memory state.
   */
  async getAllAccountsAdmin() {
    const dbAccounts = await AccountModel.findAllWithUsers();
    const sessionRoot = process.env.SESSION_PATH || './.wwebjs_auth';
    const list = dbAccounts.map((row) => {
      const accountKey = `${row.user_id}_${row.account_id}`;
      const mem = this.accounts.get(accountKey);
      const hasCreds = sessionLooksAuthenticated(path.join(sessionRoot, `session-${accountKey}`));
      return {
        accountId: row.account_id,
        userId: row.user_id,
        ownerUsername: row.owner_username,
        isReady: !!(mem && mem.status === ACCOUNT_STATUSES.READY && mem.isReady),
        isConnected: !!(mem && mem.status === ACCOUNT_STATUSES.READY && mem.isConnected),
        status: mem?.status ?? (hasCreds ? ACCOUNT_STATUSES.STOPPED : ACCOUNT_STATUSES.LOGGED_OUT),
        inMemory: !!mem,
        hasQrCode: mem ? !!mem.qrCode : false,
        parked: !mem && hasCreds,
        liveState: mem?.lastState ?? null,
        initError: mem?.initError ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    // Sessions loaded in memory but missing from DB row merge (edge case)
    this.accounts.forEach((account) => {
      const found = list.find(
        (a) => a.userId === account.userId && a.accountId === account.accountId,
      );
      if (!found) {
        list.unshift({
          accountId: account.accountId,
          userId: account.userId,
          ownerUsername: null,
          isReady: account.isReady,
          isConnected: account.isConnected,
          inMemory: true,
          hasQrCode: !!account.qrCode,
          liveState: account.lastState ?? null,
          initError: account.initError ?? null,
          createdAt: account.createdAt,
          updatedAt: null,
        });
      }
    });

    return list;
  }

  _isStuckAccount(account) {
    if (!account) return false;
    return !(
      account.status === ACCOUNT_STATUSES.READY && account.isReady === true
    );
  }

  _collectStuckSessionsForUser(userId) {
    const seen = new Set();
    const items = [];

    for (const account of this.accounts.values()) {
      if (account.userId !== userId) continue;
      const accountKey = this._getAccountKey(account.accountId, userId);
      if (!this._isStuckAccount(account)) continue;
      if (seen.has(accountKey)) continue;
      seen.add(accountKey);
      items.push({
        accountId: account.accountId,
        userId,
        accountKey,
        status: account.status,
        liveState: account.lastState ?? null,
      });
    }

    const prefix = `${userId}_`;
    for (const accountKey of this.initializingAccounts) {
      if (!accountKey.startsWith(prefix)) continue;
      if (seen.has(accountKey)) continue;
      seen.add(accountKey);
      items.push({
        accountId: accountKey.slice(prefix.length),
        userId,
        accountKey,
        status: ACCOUNT_STATUSES.INITIALIZING,
        liveState: null,
      });
    }

    return items;
  }

  /**
   * Stop and wipe in-memory sessions that are not ready (QR, pairing, failed, etc.).
   * Ready accounts are left untouched.
   */
  async clearStuckSessions(userId) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const items = this._collectStuckSessionsForUser(userId);
    const cleared = [];
    const errors = [];

    for (const item of items) {
      try {
        this.initializingAccounts.delete(item.accountKey);
        this._clearReconnectTimer(item.accountKey);

        const exists = await AccountModel.exists(item.accountId, userId);
        if (exists) {
          const mem = this.accounts.get(item.accountKey);
          if (item.status === ACCOUNT_STATUSES.LOGGED_OUT) {
            await this._clearSessionFiles(item.accountId, userId);
          } else if (mem) {
            await this._parkBrowser(mem, 'clear-stuck');
          } else {
            this.accounts.delete(item.accountKey);
          }
        } else {
          const account = this.accounts.get(item.accountKey);
          if (account?.client) {
            await this._safeDestroyClient(account.client, item.accountId);
          }
          this.accounts.delete(item.accountKey);
        }

        cleared.push({
          accountId: item.accountId,
          previousStatus: item.status,
          liveState: item.liveState,
        });
      } catch (err) {
        errors.push({
          accountId: item.accountId,
          error: err.message || String(err),
        });
      }
    }

    this._refreshGlobalReadyFlag();

    return {
      cleared,
      errors,
      clearedCount: cleared.length,
      errorCount: errors.length,
    };
  }

  /** Admin: clear stuck sessions for every user with in-memory activity. */
  async clearAllStuckSessions() {
    const userIds = new Set();

    for (const account of this.accounts.values()) {
      if (account.userId) userIds.add(account.userId);
    }

    for (const accountKey of this.initializingAccounts) {
      const uid = parseInt(String(accountKey).split('_')[0], 10);
      if (Number.isFinite(uid)) userIds.add(uid);
    }

    const cleared = [];
    const errors = [];

    for (const userId of userIds) {
      const result = await this.clearStuckSessions(userId);
      for (const row of result.cleared) {
        cleared.push({ ...row, userId });
      }
      for (const row of result.errors) {
        errors.push({ ...row, userId });
      }
    }

    return {
      cleared,
      errors,
      clearedCount: cleared.length,
      errorCount: errors.length,
    };
  }

  /**
   * Stop WhatsApp client in memory without deleting DB record or session files.
   */
  async disconnectAccount(accountId, userId) {
    const exists = await AccountModel.exists(accountId, userId);
    if (!exists) {
      throw new Error(`Account with ID "${accountId}" not found for user ${userId}`);
    }

    const accountKey = this._getAccountKey(accountId, userId);
    const account = this.accounts.get(accountKey);
    this._clearReconnectTimer(accountKey);
    this._clearQrTimer(accountKey);

    if (account?.client) {
      await this._safeDestroyClient(account.client, accountId);
    }

    this.accounts.delete(accountKey);
    const hasCreds = sessionLooksAuthenticated(this._sessionPath(accountId, userId));
    await AccountModel.updateStatus(accountId, userId, hasCreds, false);

    return {
      accountId,
      userId,
      disconnected: true,
      parked: hasCreds,
      message: hasCreds
        ? 'Browser stopped. LocalAuth kept — sending or QR restore will reconnect without a new scan if the session is still valid.'
        : 'Session stopped. Account remains in database — use QR to link again.',
    };
  }

  async assertAccountOwnedBy(accountId, userId) {
    const db = await AccountModel.findByAccountId(accountId, userId);
    if (!db) {
      throw new Error(`Account "${accountId}" not found for user ${userId}`);
    }
    return db;
  }

  /**
   * Delete an account
   * @param {string} accountId
   * @param {number} userId
   * @returns {Promise<void>}
   */
 async deleteAccount(accountId, userId) {
    // التحقق من المعاملات
    if (!accountId) {
      throw new Error('Account ID is required');
    }
    if (!userId) {
      throw new Error('User ID is required');
    }
    const accountKey = `${userId}_${accountId}`;
    const account = this.accounts.get(accountKey);
    if (!account) {
      // Check database if not in memory
      const dbAccount = await AccountModel.findByAccountId(accountId, userId);
      if (!dbAccount) {
        throw new Error(`Account with ID "${accountId}" not found for this user`);
      }
    }
    // Get session paths before deleting account
    const sessionPath = path.join(process.env.SESSION_PATH || './.wwebjs_auth', `session-${accountKey}`);
    const defaultCachePath = path.join('./.wwebjs_cache', `session-${accountKey}`);
    try {
      // Destroy client if exists and logout/disconnect
      if (account && account.client) {
        try {
          // Logout from WhatsApp before destroying
          if (account.isReady || account.isConnected) {
            try {
              await account.client.logout();
              console.log(`[${accountId}] Logged out from WhatsApp`);
            } catch (logoutErr) {
              // ✅ تجاهل TargetCloseError عند logout
              if (logoutErr.name === 'TargetCloseError' || logoutErr.message?.includes('Target closed')) {
                console.log(`[${accountId}] Already closed during logout (safe)`);
              } else {
                console.warn(`[${accountId}] Could not logout (may already be disconnected):`, logoutErr.message);
              }
            }
          }
          // Destroy the client
          await account.client.destroy();
          console.log(`[${accountId}] Client destroyed`);
        } catch (destroyErr) {
          // ✅ تجاهل TargetCloseError عند destroy
          if (destroyErr.name === 'TargetCloseError' || destroyErr.message?.includes('Target closed')) {
            console.log(`[${accountId}] Browser already closed (safe to ignore)`);
          } else {
            console.error(`[${accountId}] Error destroying client:`, destroyErr.message);
          }
          // Continue with deletion even if destroy fails
        }
      }
    } catch (err) {
      console.error(`[${accountId}] Error during client cleanup:`, err);
    }
    // Remove from map
    if (account) {
      this.accounts.delete(accountKey);
      console.log(`[${accountId}] Removed from memory`);
    }
    // Delete session files and cache
    try {
      // Delete session directory
      if (fs.existsSync(sessionPath)) {
        deleteDirectoryRecursive(sessionPath);
        console.log(`[${accountId}] Deleted session directory: ${sessionPath}`);
      }
      // Delete cache directory from default location if exists
      if (fs.existsSync(defaultCachePath)) {
        deleteDirectoryRecursive(defaultCachePath);
        console.log(`[${accountId}] Deleted cache directory: ${defaultCachePath}`);
      }
      // Also check for .wwebjs_cache in root
      const rootCachePath = path.join('./.wwebjs_cache', `user_${userId}_${accountId}`);
      if (fs.existsSync(rootCachePath)) {
        deleteDirectoryRecursive(rootCachePath);
        console.log(`[${accountId}] Deleted root cache directory: ${rootCachePath}`);
      }
    } catch (fsErr) {
      console.error(`[${accountId}] Error deleting session/cache files:`, fsErr.message);
      // Continue with database deletion even if file deletion fails
    }
    // Delete from database (this will also delete related messages due to CASCADE)
    await AccountModel.delete(accountId, userId);
    console.log(`[${accountId}] Deleted from database`);
  }

  _getSessionPaths(accountId, userId) {
    const accountKey = this._getAccountKey(accountId, userId);
    const sessionPath = path.join(
      process.env.SESSION_PATH || './.wwebjs_auth',
      `session-${accountKey}`,
    );
    const defaultCachePath = path.join('./.wwebjs_cache', `session-${accountKey}`);
    const rootCachePath = path.join(
      './.wwebjs_cache',
      `user_${userId}_${accountId}`,
    );
    return { sessionPath, defaultCachePath, rootCachePath, accountKey };
  }

  async _clearSessionFiles(accountId, userId) {
    const unlockSession = require('../utils/unlockSession');
    const { killStaleBrowserForSession } = require('../utils/unlockSession');
    const { sessionPath, defaultCachePath, rootCachePath, accountKey } =
      this._getSessionPaths(accountId, userId);

    const account = this.accounts.get(accountKey);
    if (account?.client) {
      await this._safeDestroyClient(account.client, accountId);
    }
    this.accounts.delete(accountKey);
    this._clearReconnectTimer(accountKey);

    if (fs.existsSync(sessionPath)) {
      unlockSession(sessionPath);
      killStaleBrowserForSession(sessionPath);
      deleteDirectoryRecursive(sessionPath);
      console.log(`[${accountId}] Cleared session: ${sessionPath}`);
    }
    if (fs.existsSync(defaultCachePath)) {
      deleteDirectoryRecursive(defaultCachePath);
    }
    if (fs.existsSync(rootCachePath)) {
      deleteDirectoryRecursive(rootCachePath);
    }

    await AccountModel.updateStatus(accountId, userId, false, false);
  }

  /**
   * Clear saved WhatsApp session and re-init so a new QR is emitted.
   * Use when the account shows connected but you need to link again.
   */
  async resetSession(accountId, userId) {
    const exists = await AccountModel.exists(accountId, userId);
    if (!exists) {
      throw new Error(`Account with ID "${accountId}" not found for this user`);
    }
    await this._clearSessionFiles(accountId, userId);
    await new Promise((r) => setTimeout(r, 2000));
    await this._initializeClientOnce(accountId, userId);
    return this.getAccount(accountId, userId);
  }

  async _syncLiveState(account) {
    if (!account) {
      return {
        connected: false,
        ready: false,
        liveState: null,
        status: ACCOUNT_STATUSES.DISCONNECTED,
      };
    }
    if (!this._isLiveInstance(account)) {
      return {
        connected: false,
        ready: false,
        liveState: account.lastState ?? null,
        status: account.status ?? ACCOUNT_STATUSES.STOPPED,
      };
    }
    return {
      connected: account.isConnected,
      ready: account.isReady,
      liveState: account.lastState,
      status: account.status,
    };
  }

  async getAccountStatus(accountId, userId) {
    if (!accountId || !userId) {
      return null;
    }

    const account = this.getAccount(accountId, userId);
    if (account) {
      const sessionActive = account.status === ACCOUNT_STATUSES.READY && account.isReady;
      const booting = isLiveBootStatus(account.status);
      return {
        accountId: account.accountId,
        userId: account.userId,
        status: account.status,
        connected: !!account.isConnected,
        ready: sessionActive,
        liveState: account.lastState,
        inMemory: true,
        sessionActive,
        qrCode: sessionActive ? null : account.qrCode,
        needsQr: account.status === ACCOUNT_STATUSES.QR || account.status === ACCOUNT_STATUSES.LOGGED_OUT,
        reconnecting: account.status === ACCOUNT_STATUSES.RECONNECTING,
        parked: false,
        initError: account.initError || null,
      };
    }

    try {
      const dbAccount = await AccountModel.findByAccountId(accountId, userId);
      if (dbAccount) {
        const sessionPath = this._sessionPath(accountId, userId);
        const hasCreds = sessionLooksAuthenticated(sessionPath);
        return {
          accountId: dbAccount.account_id,
          userId: dbAccount.user_id,
          status: hasCreds ? ACCOUNT_STATUSES.STOPPED : ACCOUNT_STATUSES.LOGGED_OUT,
          connected: false,
          ready: false,
          inMemory: false,
          sessionActive: false,
          qrCode: null,
          needsQr: !hasCreds,
          parked: hasCreds,
          hint: hasCreds
            ? 'Session parked to save RAM. Sending will restore it without a new QR.'
            : 'Scan QR to link again.',
        };
      }
    } catch (error) {
      console.error(`Error fetching account status from database:`, error);
    }

    return null;
  }

  async _waitForQr(accountId, userId, timeoutMs = 90000) {
    const accountKey = this._getAccountKey(accountId, userId);
    const started = Date.now();
    const remaining = () => Math.max(0, timeoutMs - (Date.now() - started));

    const account0 = this.accounts.get(accountKey);
    if (account0?.initPromise && !account0.qrCode) {
      await Promise.race([
        account0.initPromise.catch(() => {}),
        new Promise((r) => setTimeout(r, Math.min(20000, remaining()))),
      ]);
    }

    while (Date.now() - started < timeoutMs) {
      const account = this.accounts.get(accountKey);

      if (!account) {
        if (this.hasParkedSession(accountId, userId)) {
          return {
            ok: false,
            error:
              'Chrome was parked to save RAM. Request QR again to start a new browser (saved credentials were kept).',
          };
        }
        return {
          ok: false,
          error:
            'WhatsApp session failed to start (removed from memory). Check server logs — often caused by Chrome already running or missing dependencies.',
        };
      }

      if (account.qrCode) {
        return { ok: true, qr: account.qrCode };
      }

      if (account.status === ACCOUNT_STATUSES.READY && account.isReady && account.isConnected) {
        return {
          ok: false,
          connected: true,
          error:
            'Account is already linked. qrCode is null while connected. Use ?regenerate=1 to force a new QR.',
        };
      }

      if (account.initError && !account.qrCode) {
        return {
          ok: false,
          error: account.initError,
          liveState: account.lastState,
        };
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    const account = this.accounts.get(accountKey);
    return {
      ok: false,
      error:
        account?.initError ||
        'QR not ready yet — WhatsApp took too long to start. Check Chrome/Puppeteer on the server and try again.',
      liveState: account?.lastState ?? 'TIMEOUT',
    };
  }

  /**
   * Wait for QR string or confirm session is already linked.
   */
  async getQrForAccount(accountId, userId, { regenerate = false } = {}) {
    if (regenerate) {
      await this.resetSession(accountId, userId);
    } else {
      const exists = await AccountModel.exists(accountId, userId);
      if (!exists) {
        throw new Error(`Account with ID "${accountId}" not found for this user`);
      }
      if (!this.getAccount(accountId, userId)) {
        await this._initializeClientOnce(accountId, userId);
      }
    }

    const wait = await this._waitForQr(accountId, userId, 90000);

    if (wait.ok) {
      return {
        success: true,
        qr: wait.qr,
        connected: false,
        ready: false,
        apiBuild: API_BUILD,
      };
    }

    if (wait.connected) {
      return {
        success: false,
        connected: true,
        ready: true,
        qr: null,
        error: wait.error,
        apiBuild: API_BUILD,
      };
    }

    return {
      success: false,
      qr: null,
      error: wait.error,
      liveState: wait.liveState,
      apiBuild: API_BUILD,
    };
  }

  /**
   * Get account QR code
   * @param {string} accountId
   * @param {number} userId
   * @returns {string|null}
   */
  getAccountQrCode(accountId, userId) {
    const account = this.getAccount(accountId, userId);
    return account ? account.qrCode : null;
  }

  async checkPhoneNumber(accountId, userId, phoneNumber) {
    const accountKey = this._getAccountKey(accountId, userId);
    const account = this.accounts.get(accountKey);
    if (!account || !account.isReady || !isMessagingAllowed(account.status)) {
      throw new AccountNotReadyError(
        accountId,
        account?.status ?? ACCOUNT_STATUSES.DISCONNECTED,
      );
    }
    const { formattedNumber } = this._formatPhoneNumber(phoneNumber);
    return { exists: true, jid: formattedNumber };
  }

  isSessionReady(accountId, userId) {
    const account = this.getAccount(accountId, userId);
    return !!(
      account &&
      account.isReady &&
      account.isConnected &&
      isMessagingAllowed(account.status)
    );
  }

  ultraStatus(accountId, userId) {
    const account = this.getAccount(accountId, userId);
    const raw = account?.status || ACCOUNT_STATUSES.DISCONNECTED;
    const map = {
      [ACCOUNT_STATUSES.READY]: 'authenticated',
      [ACCOUNT_STATUSES.AUTHENTICATED]: 'authenticated',
      [ACCOUNT_STATUSES.PAIRING]: 'loading',
      [ACCOUNT_STATUSES.QR]: 'qr',
      [ACCOUNT_STATUSES.LOADING]: 'loading',
      [ACCOUNT_STATUSES.INITIALIZING]: 'initializing',
      [ACCOUNT_STATUSES.RECONNECTING]: 'loading',
      [ACCOUNT_STATUSES.STOPPED]: 'disconnected',
      [ACCOUNT_STATUSES.DISCONNECTED]: 'disconnected',
      [ACCOUNT_STATUSES.LOGGED_OUT]: 'disconnected',
      [ACCOUNT_STATUSES.FAILED]: 'disconnected',
    };
    const status = map[raw] || 'disconnected';
    return {
      status,
      accountStatus: { status },
      instance: accountId,
      inMemory: !!account,
      sessionActive: this.isSessionReady(accountId, userId),
    };
  }


  async sendMessages(accountId, userId, phoneNumbers, message, options = {}) {
    const account = await this.ensureAccountReady(accountId, userId);
    this._touchAccount(account);
    const results = [];
    const delayBetween = Math.max(300, options.delayBetweenMs ?? 300);
    const splitMessage = require('../utils/messageSplitter');
    const logPrefix = `[${accountId}]`;

    for (let i = 0; i < phoneNumbers.length; i++) {
      const phone = phoneNumbers[i];
      try {
        const { cleanedNumber } = this._formatPhoneNumber(phone);
        const parts = splitMessage(message);
        let firstMsg = null;

        for (const part of parts) {
          const sent = await sendTextSafe(account.client, phone, part, {
            logPrefix,
            timeoutMs: SEND_MESSAGE_TIMEOUT_MS,
          });
          if (!firstMsg) {
            firstMsg = sent;
          }
          await new Promise((r) => setTimeout(r, 300));
        }

        MessageModel.create({
          accountId,
          userId,
          phoneNumber: `${cleanedNumber}@c.us`,
          messageType: 'text',
          messageText: message,
          messageId: firstMsg?.id?._serialized || null,
          status: 'sent',
        }).catch(() => {});

        results.push({
          phone: cleanedNumber,
          success: true,
          messageId: firstMsg?.id?._serialized || null,
        });
      } catch (err) {
        this._handleClientProtocolError(account, accountId, userId, err);
        results.push({
          phone,
          success: false,
          error: err.message,
        });
      }

      if (i < phoneNumbers.length - 1) {
        await new Promise((r) => setTimeout(r, delayBetween));
      }
    }

    return results;
  }


  async sendMediaMessage(accountId, userId, phoneNumber, filePath, mediaType = 'document', caption = '') {
    const account = await this.ensureAccountReady(accountId, userId);
    const { cleanedNumber, formattedNumber } = this._formatPhoneNumber(phoneNumber);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const messageRecordId = await MessageModel.create({
      accountId,
      userId,
      phoneNumber: formattedNumber,
      messageType: mediaType,
      messageText: caption || '[media]',
      mediaFileName: path.basename(filePath),
      mediaMimeType: this._getMimeType(filePath, mediaType),
      status: 'pending',
    });

    try {
      const mime = this._getMimeType(filePath, mediaType);
      const media = MessageMedia.fromFilePath(filePath, mime);
      const sent = await withTimeout(
        account.client.sendMessage(formattedNumber, media, {
          caption: caption || undefined,
        }),
        SEND_MESSAGE_TIMEOUT_MS,
        'WhatsApp media send',
      );

      await MessageModel.updateStatus(messageRecordId, 'sent');

      return {
        success: true,
        phone: cleanedNumber,
        messageId: sent?.id?._serialized || null,
      };
    } catch (err) {
      await MessageModel.updateStatus(messageRecordId, 'failed', err.message);
      return {
        success: false,
        phone: cleanedNumber,
        error: err.message,
      };
    }
  }

  async sendMediaMessages(
    accountId,
    userId,
    phoneNumbers,
    filePath,
    mediaType = 'document',
    caption = '',
  ) {
    await this.ensureAccountReady(accountId, userId);
    const results = [];

    for (const phone of phoneNumbers) {
      const result = await this.sendMediaMessage(
        accountId,
        userId,
        phone,
        filePath,
        mediaType,
        caption,
      );
      results.push(result);
      if (phoneNumbers.length > 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return results;
  }

  async sendMediaFromSource(
    accountId,
    userId,
    phoneNumber,
    source,
    mediaType = 'document',
    caption = '',
    filename = '',
  ) {
    const account = await this.ensureAccountReady(accountId, userId);
    const { cleanedNumber, formattedNumber } = this._formatPhoneNumber(phoneNumber);
    const media = await this._mediaFromSource(source, filename, mediaType);
    const sent = await withTimeout(
      account.client.sendMessage(formattedNumber, media, {
        caption: caption || undefined,
      }),
      SEND_MESSAGE_TIMEOUT_MS,
      'WhatsApp media send',
    );
    MessageModel.create({
      accountId,
      userId,
      phoneNumber: formattedNumber,
      messageType: mediaType,
      messageText: caption || '[media]',
      mediaFileName: filename || media.filename || null,
      mediaMimeType: media.mimetype || null,
      status: 'sent',
      messageId: sent?.id?._serialized || null,
    }).catch(() => {});
    return {
      success: true,
      phone: cleanedNumber,
      messageId: sent?.id?._serialized || null,
    };
  }

  async _mediaFromSource(source, filename, mediaType) {
    const raw = String(source || '').trim();
    if (!raw) {
      throw new Error('Media source is required');
    }
    if (/^https?:\/\//i.test(raw)) {
      return MessageMedia.fromUrl(raw, {
        unsafeMime: true,
        filename: filename || undefined,
      });
    }
    let mime = mediaType === 'image' ? 'image/jpeg' : 'application/octet-stream';
    let data = raw;
    const dataUrl = raw.match(/^data:([^;]+);base64,(.+)$/s);
    if (dataUrl) {
      mime = dataUrl[1];
      data = dataUrl[2];
    } else {
      data = raw.replace(/\s/g, '');
    }
    return new MessageMedia(
      mime,
      data,
      filename || (mediaType === 'image' ? 'image.jpg' : 'file.bin'),
    );
  }


  _getMimeType(filePath, mediaType) {
    const ext = path.extname(filePath).toLowerCase();

    if (mediaType === 'image' || ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) {
      if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
      if (ext === '.png') return 'image/png';
      if (ext === '.gif') return 'image/gif';
      if (ext === '.webp') return 'image/webp';
      return 'image/jpeg';
    }

    if (mediaType === 'video' || ['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext)) {
      if (ext === '.mp4') return 'video/mp4';
      if (ext === '.avi') return 'video/x-msvideo';
      if (ext === '.mov') return 'video/quicktime';
      return 'video/mp4';
    }

    if (mediaType === 'audio' || ['.mp3', '.wav', '.ogg', '.m4a', '.aac'].includes(ext)) {
      if (ext === '.mp3') return 'audio/mpeg';
      if (ext === '.wav') return 'audio/wav';
      if (ext === '.ogg') return 'audio/ogg';
      if (ext === '.m4a') return 'audio/mp4';
      return 'audio/mpeg';
    }

    if (ext === '.pdf') return 'application/pdf';
    if (ext === '.doc') return 'application/msword';
    if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (ext === '.xls') return 'application/vnd.ms-excel';
    if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (ext === '.txt') return 'text/plain';
    if (ext === '.zip') return 'application/zip';
    if (ext === '.rar') return 'application/x-rar-compressed';

    return 'application/octet-stream';
  }

  getRuntimeStats() {
    const sessions = [];
    this.accounts.forEach((acc, accountKey) => {
      sessions.push({
        accountKey,
        accountId: acc.accountId,
        userId: acc.userId,
        isReady: !!acc.isReady,
        isConnected: !!acc.isConnected,
        lastState: acc.lastState ?? null,
        initError: acc.initError ?? null,
        hasQrCode: !!acc.qrCode,
        createdAt: acc.createdAt ?? null,
      });
    });
    return {
      inMemoryCount: this.accounts.size,
      liveBrowsers: this._liveBrowserCount(),
      initLocks: this.initLocks.size,
      reconnectTimers: this.reconnectTimers.size,
      reconnectAttempts: this.reconnectAttempts.size,
      activeStarts: this.activeStarts,
      resources: this._resourceSnapshot(),
      sessions,
    };
  }

  getStatus() {
    const accounts = Array.from(this.accounts.values());
    if (accounts.length === 0) {
      return {
        connected: false,
        ready: false,
        qrCode: null,
        accountsCount: 0
      };
    }

    const firstAccount = accounts[0];
    return {
      connected: firstAccount.isConnected,
      ready: firstAccount.isReady,
      qrCode: firstAccount.qrCode,
      accountsCount: accounts.length
    };
  }

  getQrCode() {
    const accounts = Array.from(this.accounts.values());
    if (accounts.length === 0) {
      return null;
    }
    return accounts[0].qrCode;
  }
}

module.exports = new WhatsAppService();