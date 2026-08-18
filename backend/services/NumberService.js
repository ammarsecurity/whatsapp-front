// NumberService.js
// Centralized service to check WhatsApp numbers WITHOUT creating loops or spam requests
// Uses cache + in-flight protection + system ready check

const axios = require('axios');

class NumberService {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.cache = new Map();           // phone -> { exists, ts }
        this.inFlight = new Map();        // phone -> Promise
        this.cacheTTL = 60 * 1000;       // 1 minute cache
        this.systemReady = false;
        this.lastReadyCheck = 0;
    }

    async isSystemReady() {
        // don't hammer server
        if (Date.now() - this.lastReadyCheck < 3000) return this.systemReady;

        this.lastReadyCheck = Date.now();
        try {
            const res = await axios.get(`${this.baseUrl}/status/system`);
            this.systemReady = res.data.ready === true;
        } catch {
            this.systemReady = false;
        }
        return this.systemReady;
    }

    async checkNumber(phone) {
        if (!phone) return false;

        // 1) wait until whatsapp ready
        const ready = await this.isSystemReady();
        if (!ready) throw new Error('Server warming up');

        // 2) cache hit
        const cached = this.cache.get(phone);
        if (cached && Date.now() - cached.ts < this.cacheTTL)
            return cached.exists;

        // 3) already checking -> reuse same promise (prevents loops!)
        if (this.inFlight.has(phone))
            return this.inFlight.get(phone);

        // 4) create request
        const promise = (async () => {
            try {
                const res = await axios.post(`${this.baseUrl}/api/messages/check-number`, {
                    phone
                });

                const exists = res.data?.exists === true;

                this.cache.set(phone, { exists, ts: Date.now() });
                return exists;
            }
            finally {
                this.inFlight.delete(phone);
            }
        })();

        this.inFlight.set(phone, promise);
        return promise;
    }
}

module.exports = NumberService;