'use strict';

/**
 * server/app.js
 *
 * Главный файл SaaS-сервера Steam Poster Bot.
 *
 * Запуск:
 *   node app.js            — продакшен
 *   nodemon app.js         — разработка
 *   node db/seeds.js       — первичное наполнение БД
 */

require('dotenv').config();

const express      = require('express');
const path         = require('path');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const crypto       = require('crypto');

const compression = require('compression');
const config   = require('./config');
const db       = require('./db');
const logger   = require('./logger');
const SubscriptionService = require('./services/SubscriptionService');
const SteamBotManager     = require('./services/SteamBotManager');
const TelegramBotManager  = require('./services/TelegramBotManager');

// ── Routes ───────────────────────────────────────────────────────────────────
const authRoutes          = require('./routes/auth');
const oauthRoutes         = require('./routes/oauth');
const profilesRoutes      = require('./routes/profiles');
const campaignsRoutes     = require('./routes/campaigns');
const steamGroupsRoutes   = require('./routes/steamGroups');
const jobsRoutes          = require('./routes/jobs');
const settingsRoutes      = require('./routes/settings');
const telegramRoutes      = require('./routes/telegram');
const subscriptionsRoutes = require('./routes/subscriptions');
const paymentsRoutes      = require('./routes/payments');
const botRoutes           = require('./routes/bot');
const adminRoutes         = require('./routes/admin');
const supportRoutes       = require('./routes/support');
const apikeysRoutes       = require('./routes/apikeys');
const publicApiRoutes     = require('./routes/publicApi');
const tradesRoutes        = require('./routes/trades');
const balanceRoutes       = require('./routes/balance');
const steamInventoryRoutes = require('./routes/steamInventory');
const steamItemsRoutes    = require('./routes/steamItems');
const referralsRoutes     = require('./routes/referrals');
const twofaRoutes         = require('./routes/twofa');

// ════════════════════════════════════════════════════════════════════════════
//  Express app
// ════════════════════════════════════════════════════════════════════════════

const app = express();

// ── Security ─────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", config.appUrl].filter(Boolean),
      fontSrc:    ["'self'", 'data:'],
      objectSrc:  ["'none'"],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: config.nodeEnv === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
}));

app.set('trust proxy', 1); // за Nginx

// ── CORS ─────────────────────────────────────────────────────────────────────
// Дашборд и API обслуживаются одним сервером, поэтому разрешаем same-host
// запросы (браузер шлёт Origin: http://81.19.135.78 даже для same-origin DELETE).
app.use(cors((req, callback) => {
  const origin = req.headers.origin || '';

  const allowed = [
    config.appUrl,
    ...(config.isDev
      ? ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:4000']
      : []),
  ].filter(Boolean);

  const ok = !origin || allowed.some(a => origin === a || origin.startsWith(a.replace(/\/$/, '') + '/'));
  if (!ok) logger.warn('CORS blocked', { origin });

  callback(null, {
    origin: ok,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Token', 'X-API-Key'],
  });
}));

// ── Logging ───────────────────────────────────────────────────────────────────
if (!config.isDev) {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// ── Compression ───────────────────────────────────────────────────────────────
app.use(compression({ threshold: 1024, level: 6 }));

// ── Request ID ────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// ── Stripe webhook — RAW body BEFORE express.json() ──────────────────────────
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb', parameterLimit: 50 }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const _isLocal = (req) => {
  const ip = req.ip || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
};

const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max:      config.rateLimit.maxPublic,
  standardHeaders: true, legacyHeaders: false,
  skip: _isLocal,
  message: { error: 'Слишком много запросов. Попробуйте позже.' },
});

const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max:      config.rateLimit.maxAuth,
  skip: _isLocal,
  message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут.' },
  keyGenerator: (req) => req.ip + ':' + (req.body?.email || ''),
});

app.use('/api/', generalLimiter);

// ── No-cache для API (Telegram WebView агрессивно кэширует) ──────────────────
app.use('/api/', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use('/api/auth/login',          authLimiter);
app.use('/api/auth/register',       authLimiter);
app.use('/api/auth/password/forgot',authLimiter);
app.use('/api/auth/refresh', rateLimit({
  windowMs: 15 * 60 * 1000, max: 30, skip: _isLocal,
  message: { error: 'Слишком много запросов обновления токена.' },
}));
app.use('/api/balance/yookassa/webhook', rateLimit({
  windowMs: 60 * 1000, max: 60, skip: _isLocal,
  message: { error: 'Too many requests' },
}));

// ════════════════════════════════════════════════════════════════════════════
//  API Routes
// ════════════════════════════════════════════════════════════════════════════

app.use('/api/auth',          authRoutes);
app.use('/api/oauth',         oauthRoutes);
app.use('/api/profiles',      profilesRoutes);
app.use('/api/campaigns',     campaignsRoutes);
app.use('/api/steam-groups',  steamGroupsRoutes);
app.use('/api/jobs',          jobsRoutes);
app.use('/api/settings',      settingsRoutes);
app.use('/api/telegram',      telegramRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/payments',      paymentsRoutes);
app.use('/api/bot',           botRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/support',       supportRoutes);
app.use('/api/apikeys',       apikeysRoutes);
app.use('/api/v1',            publicApiRoutes);
app.use('/api/trades',        tradesRoutes);
app.use('/api/balance',       balanceRoutes);
app.use('/api/steam-inventory', steamInventoryRoutes);
app.use('/api/steam-items',     steamItemsRoutes);
app.use('/api/referrals',       referralsRoutes);
app.use('/api/auth/2fa',        twofaRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const checks = {};
  try {
    await db.healthCheck();
    checks.db = 'ok';
  } catch {
    checks.db = 'fail';
  }
  const allOk = Object.values(checks).every(v => v === 'ok');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    checks,
    version: '2.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ── API: публичная информация о планах ─────────────────────────────────────
app.get('/api/plans', (req, res) => {
  res.json(db.getPlans(true));
});

// ── SPA: отдаём React-приложение ─────────────────────────────────────────────
// Папка dashboard/dist должна содержать продакшен-сборку React-дашборда
const dashboardDist = path.join(__dirname, 'dashboard', 'dist');
const miniAppDir    = path.join(__dirname, 'dashboard', 'miniapp');
const fs = require('fs');

// Telegram Mini App (открывается из TG) — на пути /miniapp
if (fs.existsSync(miniAppDir)) {
  app.use('/miniapp', express.static(miniAppDir, {
    maxAge: 0,
    etag: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
    },
  }));
}

// Статические публичные страницы (legal, terms и т.д.)
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.get('/legal', (req, res) => res.sendFile(path.join(publicDir, 'legal.html')));
}

if (fs.existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist, { maxAge: '1h' }));
  // SPA fallback — все не-API роуты отдают index.html
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/miniapp')) return next();
    res.sendFile(path.join(dashboardDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({
      message: 'Steam Poster Bot API Server',
      version: '2.0.0',
      docs:    '/api/health',
      note:    'Для веб-интерфейса соберите dashboard: cd dashboard && npm run build',
    });
  });
}

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use('/api/', (req, res) => {
  res.status(404).json({ error: 'Endpoint не найден' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { err: err.message, reqId: req.id, path: req.path });
  if (config.isDev) logger.debug(err.stack);

  res.status(err.status || 500).json({
    error: config.isDev ? err.message : 'Внутренняя ошибка сервера',
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  Auto-start: восстановить боты активных пользователей при перезапуске
// ════════════════════════════════════════════════════════════════════════════

async function autoRestoreBots() {
  // Shared Telegram bot — start if token is configured
  try {
    const tgToken = await db.getServerSetting('TG_BOT_TOKEN');
    if (tgToken) {
      await TelegramBotManager.start();
      console.log('[Server] Shared TG bot started');
    } else {
      console.log('[Server] TG_BOT_TOKEN not configured, skipping TG bot');
    }
  } catch (err) {
    console.error('[Server] TG bot start failed:', err.message);
  }

  // Бот постинга работает ВСЕГДА для пользователей с активными кампаниями
  const allUsers = await db.getAllUsers();
  let steamStarted = 0;
  for (const user of allUsers) {
    if (!user.is_active) continue;
    const campaigns = await db.getCampaigns(user.id);
    const hasActive = campaigns.some(c => c.is_active);
    if (hasActive) {
      SteamBotManager.start(user.id, { silent: true });
      steamStarted++;
      console.log(`[Server] Steam бот автозапущен для ${user.name || user.id} (${campaigns.filter(c => c.is_active).length} кампаний)`);
    }
  }
  if (steamStarted > 0) {
    console.log(`[Server] Steam-ботов запущено: ${steamStarted}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  Start
// ════════════════════════════════════════════════════════════════════════════

// ── Startup validation ────────────────────────────────────────────────────────
if (!config.isDev) {
  if (config.jwt.secret.includes('CHANGE_ME') || config.jwt.secret.length < 32) {
    console.error('\n  FATAL: JWT_SECRET must be set (>= 32 chars) in production!\n');
    process.exit(1);
  }
  if (config.admin.password === 'admin123') {
    console.error('\n  FATAL: ADMIN_PASSWORD must be changed from default in production!\n');
    process.exit(1);
  }
}

const server = app.listen(config.port, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   🎮 Steam Poster Bot — SaaS Server v2.0.0    ║');
  console.log('╠════════════════════════════════════════════════╣');
  console.log(`║  🌐 URL:  http://localhost:${config.port}               ║`);
  console.log(`║  🗄️  DB:   ${config.db.type.padEnd(37)}║`);
  console.log(`║  🔑 Env:  ${config.nodeEnv.padEnd(37)}║`);
  console.log('╚════════════════════════════════════════════════╝');
  console.log('');
  console.log('  📌 Первый запуск? Выполните: node db/seeds.js');
  console.log('');

  // Запустить проверку истечения подписок
  SubscriptionService.startExpirationChecker();

  // Восстановить боты
  autoRestoreBots().catch(err =>
    console.error('[Server] autoRestoreBots error:', err.message)
  );
});

// ── Server timeouts ───────────────────────────────────────────────────────────
server.timeout = 120_000;         // hard kill after 2 min
server.keepAliveTimeout = 65_000; // > Nginx (60s)
server.headersTimeout = 66_000;

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n[Server] ${signal} получен. Завершение...`);
  SteamBotManager.stopAll();
  TelegramBotManager.stopAll();
  server.close(() => {
    console.log('[Server] Сервер остановлен.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

module.exports = app;
