// WhatsAppService.js - Session-Driven Engine (Production Stable)
const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const EventEmitter = require('events');
const { once } = require('events');
const store = require("./SessionStore.js");
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function fixChromiumLocks(sessionPath) {
    try {
        const files = [
            'SingletonLock',
            'SingletonSocket',
            'DevToolsActivePort',
            'LOCK'
        ];

        const defaultPath = path.join(sessionPath, 'Default');

        for (const file of files) {
            const f1 = path.join(sessionPath, file);
            const f2 = path.join(defaultPath, file);

            if (fs.existsSync(f1)) fs.unlinkSync(f1);
            if (fs.existsSync(f2)) fs.unlinkSync(f2);
        }
    } catch { }
}

function killChromeBySessionPath(sessionPath) {
    try {
        // البحث عن عمليات chrome المرتبطة بالجلسة فقط
        execSync(`ps aux | grep "${sessionPath}" | grep -v grep | awk '{print $2}' | xargs -r kill -9`);
    } catch { }
}


const delay = (ms) => new Promise(r => setTimeout(r, ms));

class AccountSession extends EventEmitter {
    constructor(manager, accountId, userId) {
        super();
        this.manager = manager;

        this.generation = 0;
        this._currentGeneration = 0;

        super();
        this.accountId = accountId;
        this.userId = userId;
        this.key = `${userId}_${accountId}`;

        this.destroyed = false;

        this.reconnecting = false;

        this.ready = false;
        this.synced = false;
        this.initializing = false;

        this._createClient();
        this._readyPromise = new Promise((res, rej) => {
            this._resolveReady = res;
            this._rejectReady = rej;
        });

        this._syncPromise = new Promise((res, rej) => {
            this._resolveSync = res;
            this._rejectSync = rej;
        });
    }


    async _waitForWhatsAppInjection(timeout = 30000) {
        const start = Date.now();

        while (Date.now() - start < timeout) {
            try {
                const page = this.client?.pupPage;
                if (!page || page.isClosed()) throw 0;

                const injected = await page.evaluate(() => {
                    return Boolean(
                        window.Store &&
                        window.Store.Msg &&
                        window.WWebJS
                    );
                });

                if (injected) return true;

            } catch { }

            await delay(1000);
        }

        throw new Error("WA_NOT_INJECTED");
    }


    async _waitForPageReady(timeout = 15000) {
        const start = Date.now();

        while (Date.now() - start < timeout) {
            try {
                const page = this.client?.pupPage;
                if (!page || page.isClosed()) throw 0;

                await page.evaluate(() => document.body);
                return true;
            } catch {
                await delay(500);
            }
        }

        throw new Error("PAGE_NOT_READY");
    }

    _scheduleReconnect(delayMs = 5000) {
        if (this.reconnecting) return;

        this.reconnecting = true;

        const backoff = Math.min(delayMs * (this.generation + 1), 60000);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.reconnecting = false;
            this._createClient();
        }, backoff);
    }


    async shutdown() {
        this.destroyed = true;

        clearInterval(this._heartbeat);
        clearTimeout(this._idleTimer);
        clearTimeout(this.reconnectTimer);

        const oldClient = this.client;
        this.client = null;

        try {
            if (oldClient) await oldClient.destroy();
        } catch { }

        this.emit('destroyed'); // ⭐ مهم جداً
    }


    _touch() {
        this._lastActivity = Date.now();
        clearTimeout(this._idleTimer);
        this._idleTimer = setTimeout(() => {
            this.manager.destroySession(this.accountId, this.userId);
        }, 1000 * 60 * 30); // 30 دقيقة خمول
    }

    isAlive() {
        return this.ready && this.synced && this.client;
    }

    _createClient() {

        if (this.destroyed) return;

        if (this.destroyed) return;
        if (this.initializing) return;

        const sessionPath = path.join('./sessions', `user_${this.userId}`, this.accountId);

        // ⭐ قتل كروم الخاص بهذه الجلسة فقط (يحل Target closed نهائياً)
        if (this.generation === 0) {
            fixChromiumLocks(sessionPath);
        }

        this.initializing = true;
        this.generation++;
        this._currentGeneration = this.generation;

        clearInterval(this._heartbeat);
        clearTimeout(this._idleTimer);
        clearTimeout(this.reconnectTimer);

        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: path.join('./sessions', `user_${this.userId}`, this.accountId)
            }),
          puppeteer: {
    headless: "new",

    executablePath: "/usr/bin/google-chrome",

    ignoreDefaultArgs: [
        '--enable-automation'
    ],

    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=TranslateUI'
    ]
},
            restartOnAuthFail: true,
            webVersionCache: {
                type: 'local'
            }

        });

        const { execSync } = require('child_process');
        try {
            console.log("=== BEFORE INIT CHROME LIST ===");
            console.log(execSync('tasklist | findstr chrome').toString());
        } catch {
            console.log("No chrome running");
        }
        store.setClient(this.accountId, this.userId, this.client);


        this._bindEvents();
        this.client.initialize();

        // ⭐ وافحص بعد التشغيل مباشرة
        setTimeout(() => {
            try {
                console.log("=== AFTER INIT CHROME LIST ===");
                console.log(execSync('tasklist | findstr chrome').toString());
            } catch {
                console.log("Chrome died immediately ❌");
            }
        }, 2000);
    }

    _bindEvents() {

        this.client.on('ready', async () => {
            this.initializing = false;

            store.setReady(this.accountId, this.userId, false);

            await this._waitForPageReady();
            await this._waitForWhatsAppInjection(); // ⭐⭐⭐ هذا هو الحل الحقيقي
            await this._waitForSync();


            this.ready = true;
            this.synced = true;

            store.setReady(this.accountId, this.userId, true);

            this._startHeartbeat();
            this.emit('synced');
        });

        this.client.on('change_state', s => {
            if (s === 'CONFLICT' || s === 'UNPAIRED') {
                this._scheduleReconnect(3000);
            }
        });


        this.client.on('disconnected', async () => {
            this.ready = false;
            this.synced = false;
            this.initializing = false;

            store.setReady(this.accountId, this.userId, false);

            const oldClient = this.client;
            this.client = null;

            try {
                if (oldClient) {
                    oldClient.removeAllListeners();
                    await oldClient.destroy();
                }
            } catch { }

            this._resetSyncPromises('disconnect');
            this.manager.removeDispatcherLock(this.accountId, this.userId);
            store.removeDispatcher(this.accountId, this.userId);

            clearInterval(this._heartbeat);

            this._scheduleReconnect(5000);
        });

        this.client.on('auth_failure', async () => {
            this.ready = false;
            this.synced = false;
            this.initializing = false;

            console.log(`AUTH FAILED ${this.key}`);


            const oldClient = this.client;
            this.client = null;

            try {
                if (oldClient) {
                    oldClient.removeAllListeners();
                    await oldClient.destroy();
                }
            } catch { }

            this.initializing = false;

            this._resetSyncPromises('auth_failure');

            this._scheduleReconnect(8000);

        });

    }


    _startHeartbeat() {
        clearInterval(this._heartbeat);
        this._heartbeat = setInterval(async () => {
            if (Date.now() - this._lastActivity < 20000) return;

            try {
                try {
                    const page = this.client?.pupPage;
                    if (!page || page.isClosed()) return;

                    const ok = await this.client.getState().catch(() => null);
                    if (!ok) this._scheduleReconnect(2000);
                } catch { }

            } catch { }
        }, 30000);
    }


    _resetSyncPromises(reason = 'reconnect') {

        // إنهاء الوعود القديمة حتى لا يعلق أي await
        if (this._rejectReady) this._rejectReady(new Error("SESSION_RESET"));
        if (this._rejectSync) this._rejectSync(new Error("SESSION_RESET"));

        // إنشاء وعود جديدة لمرحلة الاتصال القادمة
        this._readyPromise = new Promise((res, rej) => {
            this._resolveReady = res;
            this._rejectReady = rej;
        });

        this._syncPromise = new Promise((res, rej) => {
            this._resolveSync = res;
            this._rejectSync = rej;
        });


        this.ready = false;
        this.synced = false;
    }


    async _realConnectionCheck() {
        try {
            const chats = await this.client.getChats();
            return Array.isArray(chats);
        } catch {
            return false;
        }
    }

    async waitUntilSynced(timeout = 45000) {

        if (this.ready && this.synced && this.client)
            return;

        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), timeout);

        try {

            await Promise.race([
                client.sendMessage(jid, text),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Send timeout")), 20000))
            ]);


        } catch (e) {
            if (abort.signal.aborted)
                throw new Error('SESSION_SYNC_TIMEOUT');
            throw e;
        } finally {
            clearTimeout(timer);
        }

        if (!this.client || !this.ready || !this.synced)
            throw new Error('SESSION_LOST');
    }


    async _waitForSync() {
        try {
            let ready = false;
            let tries = 0;

            while (!ready && tries < 20) {
                try {
                    const state = await this.client.getState();
                    const wid = this.client.info?.wid?._serialized;
                    if (state === 'CONNECTED' && wid && await this._realConnectionCheck())
                        ready = true;
                } catch { }

                await delay(1000);
                tries++;
            }
        } catch { }
    }


}

class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.dispatcherLocks = new Map(); // ← هنا مكانه الصحيح
        this.generation = 0;
        this._currentGeneration = 0;

    }

    async destroySession(accountId, userId) {
        const key = this._key(accountId, userId);
        const session = this.sessions.get(key);
        if (!session) return;

        await session.shutdown();

        this.sessions.delete(key);
        this.dispatcherLocks.delete(key);
        store.removeDispatcher(accountId, userId);
    }


    _key(accountId, userId) {
        return `${userId}_${accountId}`;
    }

    get(accountId, userId) {
        const key = this._key(accountId, userId);
        if (!this.sessions.has(key)) {
            const session = new AccountSession(this, accountId, userId);
            this.sessions.set(key, session);
        }

        return this.sessions.get(key);
    }

    async sendMessage(accountId, userId, phone, message) {
        const session = this.get(accountId, userId);

        await session.waitUntilSynced(); // ⭐ يمنع فشل الإرسال

        if (!session.isAlive())
            throw new Error('SESSION_RECONNECTING');

        if (session.destroyed)
            throw new Error("SESSION_DESTROYED");

        const key = this._key(accountId, userId);

        if (!this.dispatcherLocks.has(key)) {
            this.dispatcherLocks.set(key, (async () => {
                let dispatcher = store.getDispatcher(accountId, userId);

                if (!dispatcher) {
                    const MessageDispatcher = require('./MessageDispatcher');
                    dispatcher = new MessageDispatcher(session, accountId, userId);
                    store.setDispatcher(accountId, userId, dispatcher);
                }

                return dispatcher;
            })());
        }

        let dispatcher;
        try {
            dispatcher = await this.dispatcherLocks.get(key);
        } catch (e) {
            this.dispatcherLocks.delete(key);
            throw e;
        }


        session._touch();

        return dispatcher.enqueue(phone, message);
    }

    removeDispatcherLock(accountId, userId) {
        const key = this._key(accountId, userId);
        this.dispatcherLocks.delete(key);
    }

}

module.exports = new SessionManager();