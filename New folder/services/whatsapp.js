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
} = require('../utils/accountLifecycle');
const { withTimeout } = require('../utils/withTimeout');
const { sendTextSafe } = require('../utils/waClientOps');

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
    this.accounts = new Map(); // Map<accountId, accountData>
    this.initLocks = new Map(); // Map<accountKey, Promise<void>>
    this.initializingAccounts = new Set(); // accountKey — prevent duplicate initialize
    this.reconnectTimers = new Map(); // Map<accountKey, NodeJS.Timeout>
    this.lastSendAtMs = new Map(); // Map<accountKey, number>
    this.loadAccountsFromDb(); // Load accounts from database on startup
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
    } else if (isInitInProgress(status) || status === ACCOUNT_STATUSES.DISCONNECTED) {
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
      throw new AccountNotReadyError(trimmed, ACCOUNT_STATUSES.INITIALIZING);
    }

    let account = this.accounts.get(accountKey);
    if (!account) {
      throw new AccountNotReadyError(trimmed, ACCOUNT_STATUSES.DISCONNECTED);
    }

    const exists = await AccountModel.exists(trimmed, userId);
    if (!exists) {
      throw new Error(`Account with ID "${trimmed}" not found for this user`);
    }

    const status = account.status || ACCOUNT_STATUSES.INITIALIZING;
    if (!isMessagingAllowed(status)) {
      throw new AccountNotReadyError(trimmed, status);
    }

    if (!account.client) {
      throw new AccountNotReadyError(trimmed, ACCOUNT_STATUSES.DISCONNECTED);
    }

    // Skip client.info / getState when session is already ready (client.info can hang)
    if (account.isReady && account.isConnected && status === ACCOUNT_STATUSES.READY) {
      return account;
    }

    try {
      const wid = account.client.info?.wid?._serialized;
      if (!wid) {
        throw new AccountNotReadyError(trimmed, ACCOUNT_STATUSES.LOADING);
      }
    } catch (err) {
      if (err instanceof AccountNotReadyError) throw err;
      this._handleClientProtocolError(account, trimmed, userId, err);
      throw new AccountNotReadyError(trimmed, ACCOUNT_STATUSES.FAILED);
    }

    await this._assertLiveConnected(account, trimmed, userId);

    return account;
  }

  _handleClientProtocolError(account, accountId, userId, err) {
    const msg = err?.message || String(err);
    if (
      msg.includes('Target closed') ||
      msg.includes('detached Frame') ||
      msg.includes('Session closed') ||
      msg.includes('Protocol error') ||
      msg.includes('timed out')
    ) {
      console.error(`[${accountId}] Protocol/session error (non-fatal):`, msg);
      const accountKey = this._getAccountKey(accountId, userId);
      this._setAccountStatus(account, accountId, ACCOUNT_STATUSES.FAILED);
      account.initError = msg;
      this._safeDestroyClient(account.client, accountId).catch(() => {});
      this.accounts.delete(accountKey);
      this.initializingAccounts.delete(accountKey);
      AccountModel.updateStatus(accountId, userId, false, false).catch(() => {});
    }
  }

  async _assertLiveConnected(account, accountId, userId) {
    if (!account?.client) {
      throw new AccountNotReadyError(accountId, ACCOUNT_STATUSES.DISCONNECTED);
    }

    try {
      const liveState = await withTimeout(
        account.client.getState(),
        LIVE_STATE_TIMEOUT_MS,
        'WhatsApp connection check',
      );
      account.lastState = liveState;

      if (liveState !== 'CONNECTED') {
        this._setAccountStatus(account, accountId, ACCOUNT_STATUSES.DISCONNECTED);
        await AccountModel.updateStatus(accountId, userId, false, false);
        throw new AccountNotReadyError(accountId, account.status);
      }
    } catch (err) {
      if (err instanceof AccountNotReadyError) throw err;
      this._handleClientProtocolError(account, accountId, userId, err);
      throw new AccountNotReadyError(
        accountId,
        err.message?.includes('timed out')
          ? ACCOUNT_STATUSES.FAILED
          : ACCOUNT_STATUSES.DISCONNECTED,
      );
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

  _scheduleReconnect(accountId, userId, reason, delayMs = 5000) {
    const accountKey = this._getAccountKey(accountId, userId);
    const reasonUpper = String(reason || '').toUpperCase();

    // LOGOUT = الجلسة انتهت من واتساب — لا فائدة من إعادة التشغيل التلقائي (يسبب detached Frame crash)
    if (reasonUpper === 'LOGOUT') {
      console.log(
        `[${accountId}] Session logged out on WhatsApp. Scan QR again to reconnect (auto-reconnect skipped).`
      );
      return;
    }

    if (this.reconnectTimers.has(accountKey)) return;

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(accountKey);
      try {
        await this._initializeClientOnce(accountId, userId);
      } catch (err) {
        console.error(`[${accountId}] Reconnect failed:`, err.message);
      }
    }, delayMs);

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

    if (this.initializingAccounts.has(accountKey)) {
      const lock = this.initLocks.get(accountKey);
      if (lock) await lock;
      return;
    }

    const existing = this.initLocks.get(accountKey);
    if (existing) {
      await existing;
      return;
    }

    const inMemory = this.accounts.get(accountKey);
    if (inMemory && isInitInProgress(inMemory.status)) {
      console.log(`[${accountId}] Initialize skipped — already ${inMemory.status}`);
      if (inMemory.initPromise) await inMemory.initPromise.catch(() => {});
      return;
    }
    if (inMemory && inMemory.status === ACCOUNT_STATUSES.READY) {
      return;
    }

    this.initializingAccounts.add(accountKey);

    const initPromise = (async () => {
      try {
        if (this.accounts.has(accountKey)) {
          const acc = this.accounts.get(accountKey);
          if (acc?.status === ACCOUNT_STATUSES.READY) return;
        }
        await this._initializeClient(accountId, userId);
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
      const maxLoad = parseInt(process.env.MAX_AUTO_LOAD_ACCOUNTS || '0');

      if (!autoLoad) {
        console.log('Auto-loading disabled. Accounts will be loaded on-demand when needed.');
        console.log('This saves memory at startup. Accounts will load automatically when you send messages.');
        return;
      }

      if (maxLoad > 0) {
        console.log(`Auto-loading enabled with limit: ${maxLoad} accounts`);
      } else {
        console.log('Auto-loading all ready accounts...');
      }

      let loadedCount = 0;
      for (const dbAccount of dbAccounts) {
        // إذا تم تحديد حد أقصى وتم الوصول إليه، توقف
        if (maxLoad > 0 && loadedCount >= maxLoad) {
          console.log(`Reached max auto-load limit (${maxLoad}). Remaining accounts will load on-demand.`);
          break;
        }

        const accountKey = `${dbAccount.user_id}_${dbAccount.account_id}`;

        // Only initialize if not already in memory
        if (!this.accounts.has(accountKey)) {
          // Only auto-initialize if account was ready before
          if (dbAccount.is_ready) {
            console.log(`[${dbAccount.account_id}] Auto-initializing account for user ${dbAccount.user_id}...`);
            try {
              await this._initializeClient(dbAccount.account_id, dbAccount.user_id);
              loadedCount++;
            } catch (initError) {
              console.error(`[${dbAccount.account_id}] Failed to auto-initialize:`, initError.message);
              // Update database status to false if initialization fails
              await AccountModel.updateStatus(dbAccount.account_id, dbAccount.user_id, false, false);
            }
          }
        }
      }

      if (loadedCount > 0) {
        console.log(`Successfully loaded ${loadedCount} account(s) at startup.`);
      }
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

    if (!account)
      throw new Error('Account not initialized');

    // جاهز بالفعل
    if (account.isReady === true)
      return true;

    return new Promise((resolve, reject) => {

      let finished = false;

      const done = (result, err) => {
        if (finished) return;
        finished = true;

        clearTimeout(timer);

        account.client.removeListener('change_state', onState);
        account.client.removeListener('disconnected', onDisconnect);
        account.client.removeListener('auth_failure', onFail);

        err ? reject(err) : resolve(result);
      };

      const onState = (state) => {
        if (state === 'CONNECTED')
          done(true);
      };

      const onDisconnect = () =>
        done(false, new Error('WhatsApp disconnected'));

      const onFail = () =>
        done(false, new Error('WhatsApp auth failure'));

      const timer = setTimeout(() => {
        done(false, new Error('WhatsApp ready timeout'));
      }, timeoutMs);

      account.client.on('change_state', onState);
      account.client.on('disconnected', onDisconnect);
      account.client.on('auth_failure', onFail);

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

    await this._ensureChromeReady(accountId);

    // LocalAuth profile directory
    const sessionPath = path.join(
      process.env.SESSION_PATH || './.wwebjs_auth',
      `session-${accountKey}`
    );

    // ✅ احذف Lock files قبل البدء
    if (fs.existsSync(sessionPath)) {
      unlockSession(sessionPath);
      killStaleBrowserForSession(sessionPath);
      console.log(`[${accountId}] 🔓 Lock files cleared`);
    }

    this._clearReconnectTimer(accountKey);

    /* منع تضارب الجلسات بعد restart */
    if (this.accounts.has(accountKey)) {
      console.log(`[${accountId}] Destroying old client instance...`);
      const old = this.accounts.get(accountKey);
      await this._safeDestroyClient(old?.client, accountId);
      this.accounts.delete(accountKey);
    }

    fs.mkdirSync(sessionPath, { recursive: true });

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: accountKey,
        dataPath: process.env.SESSION_PATH || './.wwebjs_auth'
      }),
      puppeteer: this._getPuppeteerOptions()
    });

    const accountData = {
      accountId,
      userId,
      client,
      qrCode: null,
      isReady: false,
      isConnected: false,
      status: ACCOUNT_STATUSES.INITIALIZING,
      reconnecting: false,
      lastState: ACCOUNT_STATUSES.INITIALIZING,
      initError: null,
      createdAt: new Date()
    };

    this.accounts.set(accountKey, accountData);
    this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.INITIALIZING);

    /* ================= EVENTS ================= */

    client.on('loading_screen', (percent, message) => {
      console.log(`[${accountId}] Loading ${percent}% ${message}`);
      this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.LOADING);
    });

    client.on('qr', qr => {
      console.log(`[${accountId}] 📱 QR GENERATED`);
      accountData.qrCode = qr;
      this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.QR);
    });

    client.on('change_state', async state => {
      accountData.lastState = state;
      console.log(`[${accountId}] STATE -> ${state}`);

      if (state === 'CONNECTED') {
        this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.READY);
        await AccountModel.updateStatus(accountId, userId, true, true);
      }

      if (state === 'UNPAIRED' || state === 'UNLAUNCHED') {
        this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.LOGGED_OUT);
        await AccountModel.updateStatus(accountId, userId, false, false);
        console.log(`[${accountId}] ⚠️ SESSION LOST (${state})`);
      }
    });

    client.on('authenticated', () => {
      console.log(`[${accountId}] Session restored`);
      this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.AUTHENTICATED);
    });

    client.on('ready', async () => {
      console.log(`[${accountId}] 🔥 WHATSAPP READY`);
      this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.READY);
      await AccountModel.updateStatus(accountId, userId, true, true);
    });

    client.on('message', async (msg) => {
      await incomingHandler.handleIncoming(accountId, userId, msg, client);
    });

    client.on('auth_failure', async msg => {
      console.log(`[${accountId}] ❌ AUTH FAILURE`, msg);
      this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.FAILED);
      accountData.initError = String(msg);
      await AccountModel.updateStatus(accountId, userId, false, false);
    });

    client.on('disconnected', async reason => {
      if (accountData.reconnecting) return;
      accountData.reconnecting = true;

      const reasonUpper = String(reason || '').toUpperCase();
      console.log(`[${accountId}] 🔌 DISCONNECTED: ${reason}`);

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
        accountData.reconnecting = false;
        return;
      }

      this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.DISCONNECTED);
      await AccountModel.updateStatus(accountId, userId, false, false);
      await this._safeDestroyClient(client, accountId);
      this.accounts.delete(accountKey);
      this.initializingAccounts.delete(accountKey);
      accountData.reconnecting = false;

      console.log(`[${accountId}] Scheduling reconnect in 8s...`);
      this._scheduleReconnect(accountId, userId, reason, 8000);
    });



    /* ============ INITIALIZE ============ */

    const runInitialize = async (attempt = 1) => {
      try {
        console.log(`[${accountId}] Starting WhatsApp (attempt ${attempt})...`);
        await client.initialize();
        console.log(`[${accountId}] initialize() completed`);
      } catch (err) {
        const msg = err?.message || String(err);
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

        if (msg.includes('browser is already running')) {
          unlockSession(sessionPath);
          killStaleBrowserForSession(sessionPath);
          await this._safeDestroyClient(client, accountId);
          this.accounts.delete(accountKey);
          this._scheduleReconnect(accountId, userId, 'BROWSER_LOCK', 5000);
          return;
        }

        if (
          msg.includes('detached Frame') ||
          msg.includes('Target closed') ||
          msg.includes('Session closed') ||
          msg.includes('Protocol error')
        ) {
          await this._safeDestroyClient(client, accountId);
          this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.FAILED);
          accountData.initError = msg;
          this.accounts.delete(accountKey);
          this.initializingAccounts.delete(accountKey);
          await AccountModel.updateStatus(accountId, userId, false, false);
          return;
        }

        this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.FAILED);
        accountData.initError = msg;
        await AccountModel.updateStatus(accountId, userId, false, false);
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
      this.accounts.delete(accountKey);
      throw err;
    }

    /* Safety timeout — mark failed instead of silently removing account */
    setTimeout(() => {
      const current = this.accounts.get(accountKey);
      if (
        current &&
        !current.isConnected &&
        !current.qrCode &&
        !current.initError &&
        isInitInProgress(current.status)
      ) {
        console.log(`[${accountId}] INIT TIMEOUT — no QR after 3 minutes`);
        this._setAccountStatus(current, accountId, ACCOUNT_STATUSES.FAILED);
        current.initError =
          'WhatsApp did not emit a QR within 3 minutes. Check Chrome on the server (GET /api/status/system → chrome).';
      }
    }, 180000);
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
          status: mem.status,
          isReady: mem.isReady,
          isConnected: mem.isConnected,
          hasQrCode: !!mem.qrCode,
          createdAt: dbAccount.created_at,
          updatedAt: dbAccount.updated_at,
        });
      } else {
        accountsMap.set(dbAccount.account_id, {
          accountId: dbAccount.account_id,
          userId: dbAccount.user_id,
          status: dbAccount.is_ready
            ? ACCOUNT_STATUSES.DISCONNECTED
            : ACCOUNT_STATUSES.LOGGED_OUT,
          isReady: false,
          isConnected: false,
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
    const list = dbAccounts.map((row) => {
      const accountKey = `${row.user_id}_${row.account_id}`;
      const mem = this.accounts.get(accountKey);
      return {
        accountId: row.account_id,
        userId: row.user_id,
        ownerUsername: row.owner_username,
        isReady: mem ? mem.isReady : !!row.is_ready,
        isConnected: mem ? mem.isConnected : !!row.is_connected,
        status: mem?.status ?? (row.is_ready ? ACCOUNT_STATUSES.DISCONNECTED : ACCOUNT_STATUSES.LOGGED_OUT),
        inMemory: !!mem,
        hasQrCode: mem ? !!mem.qrCode : false,
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
          await this._clearSessionFiles(item.accountId, userId);
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

    if (account?.client) {
      try {
        if (account.isReady || account.isConnected) {
          await account.client.logout().catch(() => {});
        }
      } catch {
        /* ignore logout errors */
      }
      await this._safeDestroyClient(account.client, accountId);
    }

    this.accounts.delete(accountKey);
    await AccountModel.updateStatus(accountId, userId, false, false);

    return {
      accountId,
      userId,
      disconnected: true,
      message: 'Session stopped. Account remains in database — use reset/QR to link again.',
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
    if (!account?.client) {
      return {
        connected: account?.isConnected ?? false,
        ready: account?.isReady ?? false,
        liveState: account?.lastState ?? null,
        status: account?.status ?? ACCOUNT_STATUSES.DISCONNECTED,
      };
    }

    try {
      const liveState = await account.client.getState();
      const connected = liveState === 'CONNECTED';
      account.lastState = liveState;
      if (connected && account.status !== ACCOUNT_STATUSES.READY) {
        this._setAccountStatus(account, account.accountId, ACCOUNT_STATUSES.READY);
      } else if (!connected && account.status === ACCOUNT_STATUSES.READY) {
        this._setAccountStatus(account, account.accountId, ACCOUNT_STATUSES.DISCONNECTED);
      }
      return {
        connected: account.isConnected,
        ready: account.isReady,
        liveState,
        status: account.status,
      };
    } catch (err) {
      this._handleClientProtocolError(
        account,
        account.accountId,
        account.userId,
        err,
      );
      return {
        connected: false,
        ready: false,
        liveState: account.lastState,
        status: account.status ?? ACCOUNT_STATUSES.FAILED,
      };
    }
  }

  async getAccountStatus(accountId, userId) {
    if (!accountId || !userId) {
      return null;
    }

    const account = this.getAccount(accountId, userId);
    if (account) {
      const live = await this._syncLiveState(account);
      const sessionActive = live.status === ACCOUNT_STATUSES.READY;

      return {
        accountId: account.accountId,
        userId: account.userId,
        status: live.status,
        connected: live.connected,
        ready: live.ready,
        liveState: live.liveState,
        inMemory: true,
        sessionActive,
        qrCode: sessionActive ? null : account.qrCode,
        needsQr: !sessionActive && !account.qrCode,
        initError: account.initError || null,
      };
    }

    try {
      const dbAccount = await AccountModel.findByAccountId(accountId, userId);
      if (dbAccount) {
        const status = dbAccount.is_ready
          ? ACCOUNT_STATUSES.DISCONNECTED
          : ACCOUNT_STATUSES.LOGGED_OUT;
        return {
          accountId: dbAccount.account_id,
          userId: dbAccount.user_id,
          status,
          connected: !!dbAccount.is_connected,
          ready: !!dbAccount.is_ready,
          inMemory: false,
          sessionActive: false,
          qrCode: null,
          needsQr: !dbAccount.is_connected,
          hint: 'Session not loaded in memory. Call GET /qr to start linking.',
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
        return {
          ok: false,
          error:
            'WhatsApp session failed to start (removed from memory). Check server logs — often caused by Chrome already running or missing dependencies.',
        };
      }

      if (account.qrCode) {
        return { ok: true, qr: account.qrCode };
      }

      if (account.isReady && account.isConnected) {
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


  async sendMessages(accountId, userId, phoneNumbers, message, options = {}) {
    const account = await this.ensureAccountReady(accountId, userId);
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
          error: err.message?.includes('timed out')
            ? `${err.message}. Try Accounts → Clear stuck sessions, then link with QR again.`
            : err.message,
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
      initLocks: this.initLocks.size,
      reconnectTimers: this.reconnectTimers.size,
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