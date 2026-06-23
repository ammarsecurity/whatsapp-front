require('dotenv').config();

const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const rateLimit = require('express-rate-limit');
const { logChromeStartupCheck } = require('./config/chrome');
const { API_BUILD } = require('./config/build');

// routers
const messagesRouter = require('./routes/messages');
const messagesHistoryRouter = require('./routes/messages-history');
const statusRouter = require('./routes/status');
const accountsRouter = require('./routes/accounts');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const adminRouter = require('./routes/admin');

// middleware
const verifyToken = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 8489;
app.set('trust proxy', 1);


// ======================================================
//                  GLOBAL PROTECTION FIRST
// ======================================================

// warmup lock (يحمي الواتساب عند التشغيل)
global.systemReady = false;

// امنح الواتساب وقت ليشتغل
setTimeout(() => {
    global.systemReady = true;
    console.log("SYSTEM READY ✔");
}, 20000);

// block requests during startup
app.use((req, res, next) => {
    if (!systemReady && !req.path.startsWith('/api/auth')) {
        return res.status(503).json({
            success: false,
            error: 'Server warming up'
        });
    }
    next();
});

// log IP + URL
app.use((req, res, next) => {
    console.log(
        new Date().toISOString(),
        "| IP:", req.ip,
        "|", req.method,
        req.originalUrl
    );
    next();
});

// global rate limit (يحمي من الانفجار)
const globalLimiter = rateLimit({
    windowMs: 1000,
    max: 20
});
app.use(globalLimiter);

// خاص بالتحقق من الرقم (الأخطر)
const checkLimiter = rateLimit({
    windowMs: 5000,          // 5 ثواني
    max: 10,                 // 10 أرقام كل 5 ثواني
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many number checks — slow down'
    }
});




// ======================================================
//                  NORMAL MIDDLEWARE
// ======================================================

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));



// ======================================================
//                  PUBLIC ROUTES
// ======================================================

app.use('/api/auth', authRouter);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));



// ======================================================
//                  PROTECTED ROUTES
// ======================================================

app.use('/api', verifyToken);

// ⚠️ مهم: ضع limiter قبل الروتر مباشرة
app.use('/api/messages/check-number', checkLimiter);

app.use('/api/messages', messagesRouter);
app.use('/api/messages', messagesHistoryRouter);
app.use('/api/status', statusRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/users', usersRouter);
app.use('/api/admin', adminRouter);



// ======================================================
//                      ROOT
// ======================================================

app.get('/', (req, res) => {
    res.json({
        message: 'WhatsApp Sender API',
        version: '1.0.0',
        status: 'running'
    });
});



// ======================================================
//                      ERRORS
// ======================================================

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});



// ======================================================
//                      START
// ======================================================

// منع سقوط العملية بالكامل بسبب أخطاء Puppeteer غير المتوقعة
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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (apiBuild ${API_BUILD})`);
    logChromeStartupCheck();
});
