# Deploy backend (fix 404 on new APIs)

## Diagnosis

If `/api/accounts` works but `/api/templates`, `/api/contact-groups`, `/api/inbox` return **404 Route not found**, the server is running an **old** `server.js` without the new routes.

Check:

```bash
curl http://127.0.0.1:8489/health
curl http://127.0.0.1:8489/
```

Expected (v28+):

```json
{"success":true,"apiBuild":"2026-08-18-v28","features":["ultramsg-compat","message-outbox",...]}
```

UltraMsg-compatible send:

```bash
curl -X POST "https://whatsapp-api.smartstick-iq.com/hope/messages/chat" \
  -d "token=wsk_YOUR_KEY&to=9647807110011&body=hello"
```

Restart from aaPanel Node project (do not fight aaPanel). If needed:

```
cd /www/wwwroot/whatsapp-alufiq
# files uploaded, then restart the existing Node app from the panel
```


```json
{"success":true,"apiBuild":"2026-06-02-v15","features":[...]}
```

Root `/` must include `"apiBuild":"2026-06-02-v15"`.

**Text send / check-number fix (v15):** requires `utils/waClientOps.js` on the server. If send/check hang but media works, you are on v13 or older.

**If `/api/health` returns** `"Authorization header is required"` **→ old `middleware/auth.js` still running.**
Upload new `server.js` + `middleware/verifyAuth.js` and restart pm2.

Old server: root without `apiBuild`, `/health` → 404.

**Do not use** `https://whatsapp-api-v1.smartstick-iq.com` until nginx reverse-proxy is configured — it currently serves a static aaPanel page, not Node.

Use in Settings → Configuration:

```
http://74.50.65.142:8489
```

(no trailing `/api`)

---

## Steps on server (74.50.65.142)

1. **Upload** the entire `New folder/` contents to your app directory on the server.

2. **Install dependencies** (includes `ws`):

```bash
cd /path/to/whatsapp-api
npm install
```

3. **Run DB migrations** (MySQL):

```bash
mysql -u USER -p DATABASE < database/migration_contact_groups.sql
mysql -u USER -p DATABASE < database/migration_v10_features.sql
```

4. **Restart** Node (pm2 example):

```bash
pm2 restart whatsapp-api
# or
pm2 stop whatsapp-api && pm2 start server.js --name whatsapp-api
```

5. **Verify**:

```bash
curl http://127.0.0.1:8489/health
curl http://127.0.0.1:8489/
grep apiBuild config/build.js
pm2 logs whatsapp-api --lines 20
```

You must see `apiBuild 2026-06-02-v15` in logs and curl output.

**nginx (recommended for text send timeouts):**

```nginx
proxy_read_timeout 120s;
proxy_connect_timeout 30s;
client_body_timeout 120s;
```

---

## Frontend

Rebuild and deploy `dist/` after backend is live:

```bash
npm run build
```

Ensure API URL in browser localStorage / Settings is `http://74.50.65.142:8489`.
