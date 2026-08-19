require('dotenv').config();

const http = require('http');
const https = require('https');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const rateLimit = require('express-rate-limit');
const { logChromeStartupCheck } = require('./config/chrome');
const { API_BUILD } = require('./config/build');

const messagesRouter = require('./routes/messages');
const messagesHistoryRouter = require('./routes/messages-history');
const statusRouter = require('./routes/status');
const accountsRouter = require('./routes/accounts');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const adminRouter = require('./routes/admin');
const contactGroupsRouter = require('./routes/contact-groups');
const campaignsRouter = require('./routes/campaigns');
const templatesRouter = require('./routes/templates');
const optOutRouter = require('./routes/opt-out');
const autoRepliesRouter = require('./routes/auto-replies');
const integrationsRouter = require('./routes/integrations');
const ultramsgRouter = require('./routes/ultramsg');
const billingRouter = require('./routes/billing');
const paymentsRouter = require('./routes/payments');
const adminBillingRouter = require('./routes/adminBilling');

const verifyAuth = require('./middleware/verifyAuth');
const { checkNumberQuota } = require('./middleware/userQuota');
const wsHub = require('./services/wsHub');
const scheduler = require('./services/scheduler');
const { ensureV28Schema, ensureBillingSchema } = require('./utils/ensureSchema');

const app = express();
const PORT = process.env.PORT || 8490;
const HOST = process.env.HOST || '0.0.0.0';
app.set('trust proxy', 1);

global.systemReady = true;

app.use((req, res, next) => {
  console.log(
    new Date().toISOString(),
    '| IP:', req.ip,
    '|', req.method,
    req.originalUrl,
  );
  next();
});

const globalLimiter = rateLimit({
  windowMs: 1000,
  max: 20,
});
app.use(globalLimiter);

const checkLimiter = rateLimit({
  windowMs: 5000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many number checks — slow down',
  },
});

app.use(cors());
app.use(express.json({
  limit: '12mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

app.use('/api/auth', authRouter);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const healthPayload = () => ({
  success: true,
  status: 'running',
  apiBuild: API_BUILD,
  features: [
    'contact-groups',
    'campaigns',
    'templates',
    'opt-out',
    'auto-replies',
    'integrations',
    'websocket',
    'scheduled-campaigns',
    'ultramsg-compat',
    'message-outbox',
    'billing',
    'payments',
    'baileys-engine',
  ],
});

/** Public — no auth (use /health; /api/health also public before verifyAuth) */
app.get('/health', (req, res) => {
  res.json(healthPayload());
});

app.get('/api/health', (req, res) => {
  res.json(healthPayload());
});

/** UltraMsg-compatible routes — token in query/body, no JWT */
app.use(ultramsgRouter);

/** Payment webhooks — signature verified, no JWT */
app.use('/api/payments', paymentsRouter);

app.use('/api', verifyAuth);

app.use('/api/messages/check-number', checkLimiter, checkNumberQuota);

app.use('/api/messages', messagesRouter);
app.use('/api/messages', messagesHistoryRouter);
app.use('/api/status', statusRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/users', usersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin', adminBillingRouter);
app.use('/api/billing', billingRouter);
app.use('/api/contact-groups', contactGroupsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/opt-out', optOutRouter);
app.use('/api/auto-replies', autoRepliesRouter);
app.use('/api/integrations', integrationsRouter);

app.get('/', (req, res) => {
  res.json({
    message: 'WhatsApp Sender API',
    version: '1.0.0',
    apiBuild: API_BUILD,
    status: 'running',
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason);
  if (
    msg.includes('detached Frame') ||
    msg.includes('Target closed') ||
    msg.includes('Session closed')
  ) {
    console.error('Puppeteer session error (process kept alive):', msg);
    return;
  }
  console.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  const msg = err?.message || String(err);
  if (
    msg.includes('detached Frame') ||
    msg.includes('Target closed') ||
    msg.includes('Session closed')
  ) {
    console.error('Puppeteer session error (process kept alive):', msg);
    return;
  }
  console.error('Uncaught exception:', err);
});

function createServer(app) {
  const certPath = process.env.SSL_CERT;
  const keyPath = process.env.SSL_KEY;
  if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    const server = https.createServer(
      {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
      },
      app,
    );
    server._tlsEnabled = true;
    return server;
  }
  return http.createServer(app);
}

const server = createServer(app);
wsHub.attach(server);
scheduler.start(30000);

function listen() {
  const proto = server._tlsEnabled ? 'https' : 'http';
  server.listen(PORT, HOST, () => {
    console.log(`Baileys API listening on ${proto}://${HOST}:${PORT} (apiBuild ${API_BUILD})`);
    logChromeStartupCheck();
  });
}

ensureV28Schema()
  .then(() => ensureBillingSchema())
  .then(listen)
  .catch((err) => {
    console.error('[schema] failed, starting anyway:', err.message);
    listen();
  });
