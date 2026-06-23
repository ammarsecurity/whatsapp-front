// SessionStore.js
// Pure memory registry — NO WhatsApp logic

class SessionStore {
    constructor() {
        this.sessions = new Map();
    }

    _key(accountId, userId) {
        return `${userId}_${accountId}`;
    }

    ensure(accountId, userId) {
        const key = this._key(accountId, userId);

        if (!this.sessions.has(key)) {
            this.sessions.set(key, {
                ready: false,
                client: null,
                dispatcher: null,
                waiters: []
            });
        }

        return this.sessions.get(key);
    }

    setClient(accountId, userId, client) {
        this.ensure(accountId, userId).client = client;
    }

    getClient(accountId, userId) {
        return this.ensure(accountId, userId).client;
    }

    setReady(accountId, userId, state = true) {
        const s = this.ensure(accountId, userId);
        s.ready = state;

        if (state) {
            s.waiters.forEach(r => r(true));
            s.waiters = [];
        }
    }

    isReady(accountId, userId) {
        return this.ensure(accountId, userId).ready;
    }

    waitUntilReady(accountId, userId, timeoutMs = 60000) {
        const s = this.ensure(accountId, userId);
        if (s.ready) return Promise.resolve(true);

        return new Promise(resolve => {
            const timer = setTimeout(() => resolve(false), timeoutMs);
            s.waiters.push(() => {
                clearTimeout(timer);
                resolve(true);
            });
        });
    }

    setDispatcher(accountId, userId, dispatcher) {
        this.ensure(accountId, userId).dispatcher = dispatcher;
    }

    getDispatcher(accountId, userId) {
        return this.ensure(accountId, userId).dispatcher;
    }

    remove(accountId, userId) {
        this.sessions.delete(this._key(accountId, userId));
    }
}

module.exports = new SessionStore();
