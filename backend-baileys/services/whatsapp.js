/**
 * WhatsApp engine — Baileys (no Chrome / Puppeteer).
 * Public methods match the Chrome backend so all existing REST routes keep working.
 */
const baileys = require('@whiskeysockets/baileys');
const makeWASocket = baileys.default || baileys.makeWASocket;
const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = baileys;
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const AccountModel = require('../models/Account');
const MessageModel = require('../models/Message');
const { API_BUILD } = require('../config/build');
const {
  ACCOUNT_STATUSES,
  AccountNotReadyError,
  isMessagingAllowed,
  isInitInProgress,
  isLiveBootStatus,
} = require('../utils/accountLifecycle');
const { withTimeout } = require('../utils/withTimeout');
const resourceManager = require('./resourceManager');

const incomingHandler = require('./incomingHandler');
const wsHub = require('./wsHub');

const SEND_MESSAGE_TIMEOUT_MS = 45_000;
const RECONNECT_BACKOFF_MS = [5_000, 10_000, 30_000, 60_000, 120_000];
const MAX_RECONNECT_ATTEMPTS = Math.max(
  1,
  parseInt(process.env.WA_MAX_RECONNECT_ATTEMPTS || '8', 10) || 8,
);
const logger = pino({ level: process.env.WA_LOG_LEVEL || 'silent' });

function parseEnvInt(name, defaultValue) {
  const n = parseInt(String(process.env[name] ?? ''), 10);
  return Number.isFinite(n) ? n : defaultValue;
}

function deleteDirectoryRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function sessionLooksAuthenticated(sessionPath) {
  try {
    return fs.existsSync(path.join(sessionPath, 'creds.json'));
  } catch {
    return false;
  }
}

function toJid(phone) {
  let cleaned = String(phone || '').trim();
  if (cleaned.includes('@')) cleaned = cleaned.split('@')[0];
  cleaned = cleaned.replace(/[^\d]/g, '');
  if (!cleaned) throw new Error('Invalid phone number format');
  return { cleanedNumber: cleaned, jid: `${cleaned}@s.whatsapp.net` };
}

function extractText(msg) {
  const m = msg?.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  );
}

class WhatsAppService {
  constructor() {
    this.accounts = new Map();
    this.initLocks = new Map();
    this.initializingAccounts = new Set();
    this.reconnectTimers = new Map();
    this.reconnectAttempts = new Map();
    this.qrTimers = new Map();
    this.activeStarts = 0;
    this._generationSeq = 0;
    this.loadAccountsFromDb();
    this._startIdleUnloader();
    require('./outbox').startWorker();
  }

  _getAccountKey(accountId, userId) {
    return `${userId}_${accountId}`;
  }

  _sessionPath(accountId, userId) {
    return path.join(
      process.env.SESSION_PATH || './.baileys_auth',
      `session-${this._getAccountKey(accountId, userId)}`,
    );
  }

  _liveBrowserCount() {
    let n = 0;
    for (const acc of this.accounts.values()) {
      if (this._isLiveInstance(acc)) n += 1;
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
    return !!(account && account.sock && !account.browserDead && account.sock.ws);
  }

  hasParkedSession(accountId, userId) {
    if (this._isLiveInstance(this.getAccount(accountId, userId))) return false;
    return sessionLooksAuthenticated(this._sessionPath(accountId, userId));
  }

  _touchAccount(account) {
    if (account) account.lastUsedAt = Date.now();
  }

  _qrParkAfter() {
    return Math.max(3, parseEnvInt('WA_QR_PARK_AFTER', 6));
  }

  _clearReconnectTimer(accountKey) {
    const timer = this.reconnectTimers.get(accountKey);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(accountKey);
    }
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
    const timeoutMs = Math.max(30000, parseEnvInt('WA_QR_TIMEOUT_MS', 120000));
    const generation = account.generation;
    const timer = setTimeout(() => {
      this.qrTimers.delete(accountKey);
      const current = this.accounts.get(accountKey);
      if (!current || current.generation !== generation) return;
      if (current.status !== ACCOUNT_STATUSES.QR) return;
      this._parkSocket(current, 'qr-timeout').catch(() => {});
    }, timeoutMs);
    this.qrTimers.set(accountKey, timer);
  }

  _startIdleUnloader() {
    const idleMs = parseEnvInt('WA_IDLE_UNLOAD_MS', 900000);
    if (!idleMs) return;
    setInterval(() => {
      this._unloadIdleSessions().catch((err) => {
        console.warn('[idle-unload]', err.message);
      });
    }, 60000);
  }

  async _unloadIdleSessions() {
    const idleMs = parseEnvInt('WA_IDLE_UNLOAD_MS', 900000);
    if (!idleMs) return;
    const now = Date.now();
    for (const account of [...this.accounts.values()]) {
      if (account.status === ACCOUNT_STATUSES.QR && (account.qrCount || 0) >= this._qrParkAfter()) {
        await this._parkSocket(account, 'qr-waiting');
        continue;
      }
      if (account.status !== ACCOUNT_STATUSES.READY || !this._isLiveInstance(account)) continue;
      const last = account.lastUsedAt || 0;
      if (!last || now - last < idleMs) continue;
      await this._parkSocket(account, 'idle');
    }
  }

  async _safeEndSock(sock, accountId) {
    if (!sock) return;
    try {
      sock.ev.removeAllListeners();
      sock.end(undefined);
    } catch (err) {
      console.warn(`[${accountId}] sock end:`, err.message);
    }
  }

  async _parkSocket(account, reason) {
    if (!account || account.parking) return;
    const { accountId, userId, sock } = account;
    const accountKey = this._getAccountKey(accountId, userId);
    account.parking = true;
    account.generation = (account.generation || 0) + 1;
    console.log(`[${accountId}] Parking Baileys socket (${reason}) — creds kept`);
    this._clearReconnectTimer(accountKey);
    this._clearQrTimer(accountKey);
    await this._safeEndSock(sock, accountId);
    this.accounts.delete(accountKey);
    this.initializingAccounts.delete(accountKey);
    const hasCreds = sessionLooksAuthenticated(this._sessionPath(accountId, userId));
    await AccountModel.updateStatus(accountId, userId, hasCreds, false).catch(() => {});
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
    } else if (status === ACCOUNT_STATUSES.LOGGED_OUT || status === ACCOUNT_STATUSES.FAILED) {
      accountData.isReady = false;
      accountData.isConnected = false;
      accountData.qrCode = null;
    }
    this._refreshGlobalReadyFlag();
  }

  _refreshGlobalReadyFlag() {
    global.systemReady = [...this.accounts.values()].some(
      (acc) => acc.status === ACCOUNT_STATUSES.READY && acc.isReady,
    );
  }

  async assertAccountNotBusy(accountId, userId) {
    const trimmed = String(accountId || '').trim();
    if (!trimmed) throw new Error('accountId is required');
    const exists = await AccountModel.exists(trimmed, userId);
    if (!exists) throw new Error(`Account with ID "${trimmed}" not found for this user`);
    const accountKey = this._getAccountKey(trimmed, userId);
    if (this.initializingAccounts.has(accountKey)) {
      throw new AccountNotReadyError(trimmed, ACCOUNT_STATUSES.INITIALIZING);
    }
    const account = this.accounts.get(accountKey);
    if (account && isInitInProgress(account.status)) {
      throw new AccountNotReadyError(trimmed, account.status);
    }
  }

  async _waitForAccountReady(account, timeoutMs = 25000) {
    if (!account) throw new Error('Account not initialized');
    if (account.status === ACCOUNT_STATUSES.READY && account.isReady) return true;
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = setInterval(() => {
        if (account.status === ACCOUNT_STATUSES.READY && account.isReady) {
          clearInterval(tick);
          resolve(true);
        } else if (Date.now() - started >= timeoutMs) {
          clearInterval(tick);
          reject(new Error('WhatsApp ready timeout'));
        }
      }, 400);
    });
  }

  async ensureAccountReady(accountId, userId) {
    const trimmed = String(accountId || '').trim();
    if (!trimmed) throw new Error('accountId is required');
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
    if (!exists) throw new Error(`Account with ID "${trimmed}" not found for this user`);

    if (!account && sessionLooksAuthenticated(this._sessionPath(trimmed, userId))) {
      console.log(`[${trimmed}] Waking parked Baileys session...`);
      await this._initializeClientOnce(trimmed, userId);
      account = this.accounts.get(accountKey);
    }

    if (!account) throw new AccountNotReadyError(trimmed, ACCOUNT_STATUSES.DISCONNECTED);

    if (isInitInProgress(account.status)) {
      try {
        await this._waitForAccountReady(account, 25000);
      } catch {
        throw new AccountNotReadyError(trimmed, account.status);
      }
    }

    if (!isMessagingAllowed(account.status) || !account.sock) {
      throw new AccountNotReadyError(trimmed, account.status || ACCOUNT_STATUSES.DISCONNECTED);
    }
    this._touchAccount(account);
    return account;
  }

  async _ensureAccountReady(accountId, userId) {
    return this.ensureAccountReady(accountId, userId);
  }

  async _beginCrashRecovery(account, accountId, userId, reason) {
    if (!account || account.recovering) return;
    account.recovering = true;
    account.browserDead = true;
    account.generation = (account.generation || 0) + 1;
    const accountKey = this._getAccountKey(accountId, userId);
    this._clearQrTimer(accountKey);
    this._setAccountStatus(account, accountId, ACCOUNT_STATUSES.RECONNECTING);
    account.initError = String(reason || 'socket closed');
    await this._safeEndSock(account.sock, accountId);
    account.sock = null;
    this.initializingAccounts.delete(accountKey);
    const hasCreds = sessionLooksAuthenticated(this._sessionPath(accountId, userId));
    if (hasCreds) {
      await AccountModel.updateStatus(accountId, userId, true, false).catch(() => {});
    }
    this._scheduleReconnect(accountId, userId, reason);
  }

  _scheduleReconnect(accountId, userId, reason, delayMs) {
    const accountKey = this._getAccountKey(accountId, userId);
    const upper = String(reason || '').toUpperCase();
    if (upper.includes('LOGOUT') || upper.includes('LOGGED_OUT')) {
      console.log(`[${accountId}] Logged out — auto-reconnect skipped`);
      return;
    }
    if (this.reconnectTimers.has(accountKey)) return;
    const attempts = this.reconnectAttempts.get(accountKey) || 0;
    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      const acc = this.accounts.get(accountKey);
      if (acc) {
        this._setAccountStatus(acc, accountId, ACCOUNT_STATUSES.FAILED);
        acc.initError = `Reconnect exhausted after ${attempts} attempts`;
      }
      return;
    }
    const delay = delayMs ?? RECONNECT_BACKOFF_MS[Math.min(attempts, RECONNECT_BACKOFF_MS.length - 1)];
    this.reconnectAttempts.set(accountKey, attempts + 1);
    console.log(`[${accountId}] Restore in ${Math.round(delay / 1000)}s (${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
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

  async _waitForBrowserSlot(accountId) {
    const maxWait = parseEnvInt('WA_START_WAIT_MS', 45000);
    const started = Date.now();
    while (Date.now() - started < maxWait) {
      const snap = this._resourceSnapshot();
      if (snap.canLaunch) return true;
      console.warn(`[${accountId}] Waiting for slot (${snap.reason})`);
      await new Promise((r) => setTimeout(r, 3000));
    }
    return this._resourceSnapshot().canLaunch;
  }

  async _initializeClientOnce(accountId, userId) {
    const accountKey = this._getAccountKey(accountId, userId);
    const existing = this.accounts.get(accountKey);
    if (existing && this._isLiveInstance(existing) && existing.status === ACCOUNT_STATUSES.READY) {
      return existing;
    }
    if (existing && this._isLiveInstance(existing) && isLiveBootStatus(existing.status)) {
      if (existing.initPromise) await existing.initPromise.catch(() => {});
      return existing;
    }
    if (this.initializingAccounts.has(accountKey)) {
      const lock = this.initLocks.get(accountKey);
      if (lock) await lock;
      return this.accounts.get(accountKey);
    }
    const pending = this.initLocks.get(accountKey);
    if (pending) {
      await pending;
      return this.accounts.get(accountKey);
    }

    this.initializingAccounts.add(accountKey);
    const initPromise = (async () => {
      try {
        const live = this.accounts.get(accountKey);
        if (live && this._isLiveInstance(live) && live.status === ACCOUNT_STATUSES.READY) return live;
        const slot = await this._waitForBrowserSlot(accountId);
        if (!slot) {
          throw new Error(`Server under resource pressure (${this._resourceSnapshot().reason})`);
        }
        this.activeStarts += 1;
        try {
          await this._initializeClient(accountId, userId);
        } finally {
          this.activeStarts = Math.max(0, this.activeStarts - 1);
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

  async loadAccountsFromDb() {
    try {
      if (process.env.AUTO_LOAD_ACCOUNTS === 'false') {
        console.log('Auto-load disabled. Baileys sessions restore on demand.');
        return;
      }
      const dbAccounts = await AccountModel.findAll();
      const maxLive = parseEnvInt('WA_MAX_LIVE_SESSIONS', 20);
      const maxLoad = parseEnvInt('MAX_AUTO_LOAD_ACCOUNTS', 3);
      const cap = maxLoad > 0 ? Math.min(maxLoad, maxLive || maxLoad) : maxLive;
      let loaded = 0;
      for (const row of dbAccounts) {
        if (loaded >= cap) break;
        if (!sessionLooksAuthenticated(this._sessionPath(row.account_id, row.user_id))) continue;
        try {
          await this._initializeClientOnce(row.account_id, row.user_id);
          loaded += 1;
        } catch (err) {
          console.error(`[${row.account_id}] restore failed:`, err.message);
        }
      }
      console.log(`Restored ${loaded} Baileys session(s)`);
    } catch (err) {
      console.error('loadAccountsFromDb:', err.message);
    }
  }

  async _initializeClient(accountId, userId) {
    const accountKey = this._getAccountKey(accountId, userId);
    const live = this.accounts.get(accountKey);
    if (live && this._isLiveInstance(live) && live.status === ACCOUNT_STATUSES.READY) return;

    const sessionPath = this._sessionPath(accountId, userId);
    fs.mkdirSync(sessionPath, { recursive: true });

    this._clearReconnectTimer(accountKey);
    this._clearQrTimer(accountKey);

    if (this.accounts.has(accountKey)) {
      const old = this.accounts.get(accountKey);
      old.generation = (old.generation || 0) + 1;
      await this._safeEndSock(old.sock, accountId);
      this.accounts.delete(accountKey);
    }

    const generation = ++this._generationSeq;
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1025190524] }));

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ['Ubuntu', 'Chrome', '22.04'],
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });

    const accountData = {
      accountId,
      userId,
      sock,
      client: this._wrapClient(sock),
      generation,
      qrCode: null,
      qrCount: 0,
      isReady: false,
      isConnected: false,
      status: ACCOUNT_STATUSES.INITIALIZING,
      lastState: 'connecting',
      initError: null,
      browserDead: false,
      recovering: false,
      lastUsedAt: Date.now(),
      createdAt: new Date(),
    };
    this.accounts.set(accountKey, accountData);
    this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.INITIALIZING);

    const stillCurrent = () => {
      const current = this.accounts.get(accountKey);
      return current && current.generation === generation && current.sock === sock;
    };

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      if (!stillCurrent()) return;
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        accountData.qrCount += 1;
        accountData.qrCode = qr;
        accountData.lastState = 'qr';
        this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.QR);
        this._armQrTimeout(accountData);
        if (accountData.qrCount >= this._qrParkAfter()) {
          this._parkSocket(accountData, 'qr-waiting').catch(() => {});
        }
        return;
      }
      if (connection === 'connecting') {
        accountData.lastState = 'opening';
        if (accountData.status !== ACCOUNT_STATUSES.READY) {
          this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.PAIRING);
        }
      }
      if (connection === 'open') {
        accountData.qrCount = 0;
        this._clearQrTimer(accountKey);
        this._touchAccount(accountData);
        this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.READY);
        await AccountModel.updateStatus(accountId, userId, true, true);
        console.log(`[${accountId}] BAILEYS READY`);
      }
      if (connection === 'close') {
        const err = lastDisconnect?.error;
        const code = err instanceof Boom ? err.output?.statusCode : err?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        console.log(`[${accountId}] DISCONNECTED code=${code} loggedOut=${loggedOut}`);
        if (loggedOut) {
          this._setAccountStatus(accountData, accountId, ACCOUNT_STATUSES.LOGGED_OUT);
          await AccountModel.updateStatus(accountId, userId, false, false);
          await this._safeEndSock(sock, accountId);
          try {
            await this._clearSessionFiles(accountId, userId);
          } catch (err) {
            console.warn(`[${accountId}] clear after logout:`, err.message);
          }
          return;
        }
        await this._beginCrashRecovery(accountData, accountId, userId, `close:${code}`);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (!stillCurrent()) return;
      if (type !== 'notify' && type !== 'append') return;
      for (const m of messages || []) {
        if (!m?.message || m.key?.fromMe) continue;
        const jid = m.key.remoteJid || '';
        if (jid.endsWith('@g.us') || jid === 'status@broadcast') continue;
        const wrapped = {
          fromMe: false,
          from: jid,
          body: extractText(m),
          id: { _serialized: m.key.id },
          getContact: async () => ({ pushname: m.pushName || null, name: m.pushName || null }),
        };
        await incomingHandler.handleIncoming(accountId, userId, wrapped, accountData.client);
      }
    });

    accountData.initPromise = Promise.resolve();
  }

  _wrapClient(sock) {
    return {
      sendMessage: async (jid, content) => {
        const target = String(jid).includes('@') ? jid : `${String(jid).replace(/[^\d]/g, '')}@s.whatsapp.net`;
        if (typeof content === 'string') {
          const sent = await sock.sendMessage(target, { text: content });
          return { id: { _serialized: sent?.key?.id || null } };
        }
        throw new Error('Unsupported send payload');
      },
    };
  }

  async getOrLoadAccount(accountId, userId) {
    const accountKey = this._getAccountKey(accountId, userId);
    if (this.accounts.has(accountKey)) return this.accounts.get(accountKey);
    const exists = await AccountModel.exists(accountId, userId);
    if (!exists) throw new Error('Account not found');
    await this._initializeClientOnce(accountId, userId);
    return this.accounts.get(accountKey);
  }

  async createAccount(accountId, userId) {
    if (!accountId || typeof accountId !== 'string' || !accountId.trim()) {
      throw new Error('accountId is required and must be a non-empty string');
    }
    if (!userId || typeof userId !== 'number') {
      throw new Error('userId is required and must be a number');
    }
    const accountKey = this._getAccountKey(accountId, userId);
    if (this.accounts.has(accountKey)) {
      throw new Error(`Account with ID "${accountId}" already exists for this user`);
    }
    if (await AccountModel.exists(accountId, userId)) {
      throw new Error(`Account with ID "${accountId}" already exists for this user`);
    }
    await AccountModel.create(accountId, userId);
    await this._initializeClientOnce(accountId, userId);
    return { success: true, message: `Account "${accountId}" created successfully` };
  }

  getAccount(accountId, userId) {
    if (!accountId || !userId) return null;
    return this.accounts.get(this._getAccountKey(accountId, userId)) || null;
  }

  _offlineStatus(userId, accountId, dbAccount) {
    const hasCreds = sessionLooksAuthenticated(this._sessionPath(accountId, userId));
    return {
      accountId,
      userId,
      note: dbAccount?.note || '',
      status: hasCreds ? ACCOUNT_STATUSES.STOPPED : ACCOUNT_STATUSES.LOGGED_OUT,
      isReady: false,
      isConnected: false,
      parked: hasCreds,
      needsQr: !hasCreds,
      createdAt: dbAccount?.created_at,
      updatedAt: dbAccount?.updated_at,
    };
  }

  async getAllAccounts(userId) {
    const dbAccounts = await AccountModel.findAllByUserId(userId);
    const accountsMap = new Map();
    for (const dbAccount of dbAccounts) {
      const mem = this.accounts.get(this._getAccountKey(dbAccount.account_id, userId));
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
        accountsMap.set(
          dbAccount.account_id,
          this._offlineStatus(userId, dbAccount.account_id, dbAccount),
        );
      }
    }
    return Array.from(accountsMap.values());
  }

  async getAllAccountsAdmin() {
    const dbAccounts = await AccountModel.findAllWithUsers();
    return dbAccounts.map((row) => {
      const mem = this.accounts.get(`${row.user_id}_${row.account_id}`);
      const hasCreds = sessionLooksAuthenticated(this._sessionPath(row.account_id, row.user_id));
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
        engine: 'baileys',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  async clearStuckSessions(userId) {
    const cleared = [];
    const errors = [];
    for (const account of [...this.accounts.values()]) {
      if (account.userId !== userId) continue;
      if (account.status === ACCOUNT_STATUSES.READY && account.isReady) continue;
      try {
        if (account.status === ACCOUNT_STATUSES.LOGGED_OUT) {
          await this._clearSessionFiles(account.accountId, userId);
        } else {
          await this._parkSocket(account, 'clear-stuck');
        }
        cleared.push({ accountId: account.accountId, previousStatus: account.status });
      } catch (err) {
        errors.push({ accountId: account.accountId, error: err.message });
      }
    }
    this._refreshGlobalReadyFlag();
    return { cleared, errors, clearedCount: cleared.length, errorCount: errors.length };
  }

  async clearAllStuckSessions() {
    const userIds = new Set([...this.accounts.values()].map((a) => a.userId));
    const cleared = [];
    const errors = [];
    for (const userId of userIds) {
      const result = await this.clearStuckSessions(userId);
      cleared.push(...result.cleared.map((row) => ({ ...row, userId })));
      errors.push(...result.errors.map((row) => ({ ...row, userId })));
    }
    return { cleared, errors, clearedCount: cleared.length, errorCount: errors.length };
  }

  async disconnectAccount(accountId, userId) {
    const exists = await AccountModel.exists(accountId, userId);
    if (!exists) throw new Error(`Account with ID "${accountId}" not found for user ${userId}`);
    const accountKey = this._getAccountKey(accountId, userId);
    const account = this.accounts.get(accountKey);
    this._clearReconnectTimer(accountKey);
    this._clearQrTimer(accountKey);
    if (account?.sock) await this._safeEndSock(account.sock, accountId);
    this.accounts.delete(accountKey);
    const hasCreds = sessionLooksAuthenticated(this._sessionPath(accountId, userId));
    await AccountModel.updateStatus(accountId, userId, hasCreds, false);
    return {
      accountId,
      userId,
      disconnected: true,
      parked: hasCreds,
      message: hasCreds
        ? 'Socket stopped. Creds kept — sending will restore without a new QR if still valid.'
        : 'Session stopped. Scan QR to link again.',
    };
  }

  async assertAccountOwnedBy(accountId, userId) {
    const db = await AccountModel.findByAccountId(accountId, userId);
    if (!db) throw new Error(`Account "${accountId}" not found for user ${userId}`);
    return db;
  }

  async deleteAccount(accountId, userId) {
    if (!accountId) throw new Error('Account ID is required');
    if (!userId) throw new Error('User ID is required');
    const accountKey = this._getAccountKey(accountId, userId);
    const account = this.accounts.get(accountKey);
    const dbAccount = account ? true : await AccountModel.findByAccountId(accountId, userId);
    if (!dbAccount) throw new Error(`Account with ID "${accountId}" not found for this user`);
    if (account?.sock) {
      try {
        await account.sock.logout();
      } catch {
        /* ignore */
      }
      await this._safeEndSock(account.sock, accountId);
    }
    this.accounts.delete(accountKey);
    await this._clearSessionFiles(accountId, userId);
    await AccountModel.delete(accountId, userId);
  }

  async _clearSessionFiles(accountId, userId) {
    const accountKey = this._getAccountKey(accountId, userId);
    const account = this.accounts.get(accountKey);
    if (account?.sock) await this._safeEndSock(account.sock, accountId);
    this.accounts.delete(accountKey);
    this._clearReconnectTimer(accountKey);
    deleteDirectoryRecursive(this._sessionPath(accountId, userId));
    await AccountModel.updateStatus(accountId, userId, false, false);
  }

  async resetSession(accountId, userId) {
    const exists = await AccountModel.exists(accountId, userId);
    if (!exists) throw new Error(`Account with ID "${accountId}" not found for this user`);
    await this._clearSessionFiles(accountId, userId);
    await new Promise((r) => setTimeout(r, 500));
    await this._initializeClientOnce(accountId, userId);
    return this.getAccount(accountId, userId);
  }

  async getAccountStatus(accountId, userId) {
    if (!accountId || !userId) return null;
    const account = this.getAccount(accountId, userId);
    if (account) {
      const sessionActive = account.status === ACCOUNT_STATUSES.READY && account.isReady;
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
        needsQr:
          account.status === ACCOUNT_STATUSES.QR ||
          account.status === ACCOUNT_STATUSES.LOGGED_OUT,
        reconnecting: account.status === ACCOUNT_STATUSES.RECONNECTING,
        parked: false,
        engine: 'baileys',
        initError: account.initError || null,
      };
    }
    const dbAccount = await AccountModel.findByAccountId(accountId, userId);
    if (!dbAccount) return null;
    const hasCreds = sessionLooksAuthenticated(this._sessionPath(accountId, userId));
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
      engine: 'baileys',
      hint: hasCreds
        ? 'Session parked. Sending will restore it without a new QR.'
        : 'Scan QR to link again.',
    };
  }

  async _waitForQr(accountId, userId, timeoutMs = 90000) {
    const accountKey = this._getAccountKey(accountId, userId);
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const account = this.accounts.get(accountKey);
      if (!account) {
        return {
          ok: false,
          error: this.hasParkedSession(accountId, userId)
            ? 'Session parked. Request QR again.'
            : 'WhatsApp session failed to start.',
        };
      }
      if (account.qrCode) return { ok: true, qr: account.qrCode };
      if (account.status === ACCOUNT_STATUSES.READY && account.isReady) {
        return { ok: false, connected: true, error: 'Account is already linked.' };
      }
      if (account.initError && !account.qrCode) {
        return { ok: false, error: account.initError, liveState: account.lastState };
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    const account = this.accounts.get(accountKey);
    return {
      ok: false,
      error: account?.initError || 'QR not ready yet',
      liveState: account?.lastState ?? 'TIMEOUT',
    };
  }

  async getQrForAccount(accountId, userId, { regenerate = false } = {}) {
    if (regenerate) {
      await this.resetSession(accountId, userId);
    } else {
      const exists = await AccountModel.exists(accountId, userId);
      if (!exists) throw new Error(`Account with ID "${accountId}" not found for this user`);
      if (!this.getAccount(accountId, userId)) {
        await this._initializeClientOnce(accountId, userId);
      }
    }
    const wait = await this._waitForQr(accountId, userId, 90000);
    if (wait.ok) {
      return { success: true, qr: wait.qr, connected: false, ready: false, apiBuild: API_BUILD, engine: 'baileys' };
    }
    if (wait.connected) {
      return {
        success: false,
        connected: true,
        ready: true,
        qr: null,
        error: wait.error,
        apiBuild: API_BUILD,
        engine: 'baileys',
      };
    }
    return {
      success: false,
      qr: null,
      error: wait.error,
      liveState: wait.liveState,
      apiBuild: API_BUILD,
      engine: 'baileys',
    };
  }

  getAccountQrCode(accountId, userId) {
    const account = this.getAccount(accountId, userId);
    return account ? account.qrCode : null;
  }

  async checkPhoneNumber(accountId, userId, phoneNumber) {
    const account = await this.ensureAccountReady(accountId, userId);
    const { cleanedNumber, jid } = toJid(phoneNumber);
    try {
      const result = await account.sock.onWhatsApp(jid);
      const exists = Array.isArray(result) ? result.some((r) => r.exists) : !!result?.[0]?.exists;
      return { exists, jid: exists ? jid : `${cleanedNumber}@s.whatsapp.net` };
    } catch {
      return { exists: true, jid };
    }
  }

  isSessionReady(accountId, userId) {
    const account = this.getAccount(accountId, userId);
    return !!(account && account.isReady && account.isConnected && isMessagingAllowed(account.status));
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
    return {
      status: map[raw] || 'disconnected',
      accountStatus: { status: map[raw] || 'disconnected' },
      instance: accountId,
      inMemory: !!account,
      sessionActive: this.isSessionReady(accountId, userId),
      engine: 'baileys',
    };
  }

  async sendMessages(accountId, userId, phoneNumbers, message, options = {}) {
    const account = await this.ensureAccountReady(accountId, userId);
    const results = [];
    const delayBetween = Math.max(300, options.delayBetweenMs ?? 300);
    const splitMessage = require('../utils/messageSplitter');

    for (let i = 0; i < phoneNumbers.length; i++) {
      const phone = phoneNumbers[i];
      try {
        const { cleanedNumber, jid } = toJid(phone);
        const parts = splitMessage(message);
        let firstId = null;
        for (const part of parts) {
          const sent = await withTimeout(
            account.sock.sendMessage(jid, { text: part }),
            SEND_MESSAGE_TIMEOUT_MS,
            'WhatsApp text send',
          );
          if (!firstId) firstId = sent?.key?.id || null;
          await new Promise((r) => setTimeout(r, 250));
        }
        MessageModel.create({
          accountId,
          userId,
          phoneNumber: jid,
          messageType: 'text',
          messageText: message,
          messageId: firstId,
          status: 'sent',
        }).catch(() => {});
        results.push({ phone: cleanedNumber, success: true, messageId: firstId });
      } catch (err) {
        results.push({ phone, success: false, error: err.message });
      }
      if (i < phoneNumbers.length - 1) {
        await new Promise((r) => setTimeout(r, delayBetween));
      }
    }
    return results;
  }

  async _sendMediaBuffer(sock, jid, buffer, mediaType, caption, filename, mimetype) {
    if (mediaType === 'image') {
      return sock.sendMessage(jid, { image: buffer, caption: caption || undefined, mimetype });
    }
    if (mediaType === 'video') {
      return sock.sendMessage(jid, { video: buffer, caption: caption || undefined, mimetype });
    }
    if (mediaType === 'audio') {
      return sock.sendMessage(jid, { audio: buffer, mimetype: mimetype || 'audio/mpeg' });
    }
    return sock.sendMessage(jid, {
      document: buffer,
      mimetype: mimetype || 'application/octet-stream',
      fileName: filename || 'file.bin',
      caption: caption || undefined,
    });
  }

  async sendMediaMessage(accountId, userId, phoneNumber, filePath, mediaType = 'document', caption = '') {
    const account = await this.ensureAccountReady(accountId, userId);
    const { cleanedNumber, jid } = toJid(phoneNumber);
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    const buffer = fs.readFileSync(filePath);
    const mime = this._getMimeType(filePath, mediaType);
    const messageRecordId = await MessageModel.create({
      accountId,
      userId,
      phoneNumber: jid,
      messageType: mediaType,
      messageText: caption || '[media]',
      mediaFileName: path.basename(filePath),
      mediaMimeType: mime,
      status: 'pending',
    });
    try {
      const sent = await withTimeout(
        this._sendMediaBuffer(account.sock, jid, buffer, mediaType, caption, path.basename(filePath), mime),
        SEND_MESSAGE_TIMEOUT_MS,
        'WhatsApp media send',
      );
      await MessageModel.updateStatus(messageRecordId, 'sent');
      return { success: true, phone: cleanedNumber, messageId: sent?.key?.id || null };
    } catch (err) {
      await MessageModel.updateStatus(messageRecordId, 'failed', err.message);
      return { success: false, phone: cleanedNumber, error: err.message };
    }
  }

  async sendMediaMessages(accountId, userId, phoneNumbers, filePath, mediaType = 'document', caption = '') {
    await this.ensureAccountReady(accountId, userId);
    const results = [];
    for (const phone of phoneNumbers) {
      results.push(await this.sendMediaMessage(accountId, userId, phone, filePath, mediaType, caption));
      if (phoneNumbers.length > 1) await new Promise((r) => setTimeout(r, 500));
    }
    return results;
  }

  async sendMediaFromSource(accountId, userId, phoneNumber, source, mediaType = 'document', caption = '', filename = '') {
    const account = await this.ensureAccountReady(accountId, userId);
    const { cleanedNumber, jid } = toJid(phoneNumber);
    const { buffer, mime, name } = await this._bufferFromSource(source, filename, mediaType);
    const sent = await withTimeout(
      this._sendMediaBuffer(account.sock, jid, buffer, mediaType, caption, name, mime),
      SEND_MESSAGE_TIMEOUT_MS,
      'WhatsApp media send',
    );
    MessageModel.create({
      accountId,
      userId,
      phoneNumber: jid,
      messageType: mediaType,
      messageText: caption || '[media]',
      mediaFileName: name,
      mediaMimeType: mime,
      status: 'sent',
      messageId: sent?.key?.id || null,
    }).catch(() => {});
    return { success: true, phone: cleanedNumber, messageId: sent?.key?.id || null };
  }

  async _bufferFromSource(source, filename, mediaType) {
    const raw = String(source || '').trim();
    if (!raw) throw new Error('Media source is required');
    if (/^https?:\/\//i.test(raw)) {
      const res = await fetch(raw);
      if (!res.ok) throw new Error(`Failed to download media (${res.status})`);
      const mime = res.headers.get('content-type') || (mediaType === 'image' ? 'image/jpeg' : 'application/octet-stream');
      const buffer = Buffer.from(await res.arrayBuffer());
      return { buffer, mime, name: filename || path.basename(new URL(raw).pathname) || 'file.bin' };
    }
    let mime = mediaType === 'image' ? 'image/jpeg' : 'application/octet-stream';
    let data = raw;
    const dataUrl = raw.match(/^data:([^;]+);base64,(.+)$/s);
    if (dataUrl) {
      mime = dataUrl[1];
      data = dataUrl[2];
    }
    return {
      buffer: Buffer.from(data.replace(/\s/g, ''), 'base64'),
      mime,
      name: filename || (mediaType === 'image' ? 'image.jpg' : 'file.bin'),
    };
  }

  _getMimeType(filePath, mediaType) {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
    };
    if (map[ext]) return map[ext];
    if (mediaType === 'image') return 'image/jpeg';
    if (mediaType === 'video') return 'video/mp4';
    if (mediaType === 'audio') return 'audio/mpeg';
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
        engine: 'baileys',
      });
    });
    return {
      inMemoryCount: this.accounts.size,
      liveBrowsers: this._liveBrowserCount(),
      initLocks: this.initLocks.size,
      reconnectTimers: this.reconnectTimers.size,
      reconnectAttempts: this.reconnectAttempts.size,
      activeStarts: this.activeStarts,
      engine: 'baileys',
      resources: this._resourceSnapshot(),
      sessions,
    };
  }

  getStatus() {
    const accounts = Array.from(this.accounts.values());
    if (!accounts.length) return { connected: false, ready: false, qrCode: null, accountsCount: 0, engine: 'baileys' };
    const first = accounts[0];
    return {
      connected: first.isConnected,
      ready: first.isReady,
      qrCode: first.qrCode,
      accountsCount: accounts.length,
      engine: 'baileys',
    };
  }

  getQrCode() {
    const accounts = Array.from(this.accounts.values());
    return accounts[0]?.qrCode || null;
  }
}

module.exports = new WhatsAppService();
