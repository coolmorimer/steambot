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

const config   = require('./config');
const db       = require('./db');
const SubscriptionService = require('./services/SubscriptionService');
const SteamBotManager     = require('./services/SteamBotManager');
const TelegramBotManager  = require('./services/TelegramBotManager');

// ── Routes ───────────────────────────────────────────────────────────────────
const authRoutes          = require('./routes/auth');
const profilesRoutes      = require('./routes/profiles');
const campaignsRoutes     = require('./routes/campaigns');
const jobsRoutes          = require('./routes/jobs');
const settingsRoutes      = require('./routes/settings');
const telegramRoutes      = require('./routes/telegram');
const subscriptionsRoutes = require('./routes/subscriptions');
const paymentsRoutes      = require('./routes/payments');
const botRoutes           = require('./routes/bot');
const adminRoutes         = require('./routes/admin');

// ════════════════════════════════════════════════════════════════════════════
//  Express app
// ════════════════════════════════════════════════════════════════════════════

const app = express();

// ── Security ─────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,   // отключаем для SPA
  crossOriginEmbedderPolicy: false,
}));

app.set('trust proxy', 1); // за Nginx

// ── CORS ─────────────────────────────────────────────────────────────────────
// Дашборд и API обслуживаются одним сервером, поэтому разрешаем same-host
// запросы (браузер шлёт Origin: http://81.19.135.78 даже для same-origin DELETE).
app.use(cors((req, callback) => {
  const origin = req.headers.origin || '';
  const host   = req.headers.host   || ''; // "81.19.135.78" или "communityrig.ru"

  const allowed = [
    'http://localhost:3000', 'http://localhost:5173', 'http://localhost:4000',
    config.appUrl,
    `http://${host}`,
    `https://${host}`,
  ].filter(Boolean);

  const ok = !origin || allowed.some(a => origin === a || origin.startsWith(a.replace(/\/$/, '') + '/'));
  if (!ok) console.error('[Error] CORS blocked:', origin);

  callback(null, {
    origin: ok,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Token'],
  });
}));

// ── Logging ───────────────────────────────────────────────────────────────────
if (!config.isDev) {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// ── Stripe webhook — RAW body BEFORE express.json() ──────────────────────────
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

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
app.use('/api/auth/login',          authLimiter);
app.use('/api/auth/register',       authLimiter);
app.use('/api/auth/password/forgot',authLimiter);

// ════════════════════════════════════════════════════════════════════════════
//  API Routes
// ════════════════════════════════════════════════════════════════════════════

app.use('/api/auth',          authRoutes);
app.use('/api/profiles',      profilesRoutes);
app.use('/api/campaigns',     campaignsRoutes);
app.use('/api/jobs',          jobsRoutes);
app.use('/api/settings',      settingsRoutes);
app.use('/api/telegram',      telegramRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/payments',      paymentsRoutes);
app.use('/api/bot',           botRoutes);
app.use('/api/admin',         adminRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
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
  app.use('/miniapp', express.static(miniAppDir, { maxAge: '10m' }));
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
  console.error('[Error]', err.message);
  if (config.isDev) console.error(err.stack);

  res.status(err.status || 500).json({
    error: config.isDev ? err.message : 'Внутренняя ошибка сервера',
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  Auto-start: восстановить боты активных пользователей при перезапуске
// ════════════════════════════════════════════════════════════════════════════

async function autoRestoreBots() {
  // Находим пользователей с активными Telegram-ботами
  const activeBots = await db.getActiveTelegramBotUsers();

  console.log(`[Server] Восстановление ${activeBots.length} TG-ботов...`);

  for (const botRecord of activeBots) {
    const sub = await db.getActiveSubscription(botRecord.user_id);
    if (!sub) continue;

    const chatIds = typeof botRecord.authorized_chat_ids === 'string'
      ? JSON.parse(botRecord.authorized_chat_ids || '[]')
      : (botRecord.authorized_chat_ids || []);

    const botConfig = {
      token:    botRecord.bot_token,
      chatIds,
      notify: {
        errors:   !!botRecord.notify_errors,
        success:  !!botRecord.notify_success,
        expired:  !!botRecord.notify_expired,
        botState: !!botRecord.notify_bot_state,
      },
      webAppUrl: botRecord.mini_app_url,
      userId:    botRecord.user_id,
      getStatus:     () => SteamBotManager.getStatus(botRecord.user_id),
      getAccounts:   () => db.getProfiles(botRecord.user_id),
      getCampaigns:  () => db.getCampaigns(botRecord.user_id),
      getRecentJobs: () => db.getRecentJobs(botRecord.user_id, 20),
      startBot:      () => SteamBotManager.start(botRecord.user_id),
      stopBot:       () => SteamBotManager.stop(botRecord.user_id),
    };

    // suppressNotify: true — не слать «бот запущен» при авторестарте пода
    TelegramBotManager.start(botRecord.user_id, botConfig, { suppressNotify: true }).catch(err => {
      console.error(`[Server] TG bot restore failed for ${botRecord.user_id}:`, err.message);
    });
  }

  // Находим пользователей, у которых бот был запущен (через user_settings)
  const allUsers = await db.getAllUsers();
  let steamRestored = 0;
  for (const user of allUsers) {
    if (!user.is_active) continue;
    const wasRunning = await db.getSetting(user.id, 'bot_running', '0');
    if (wasRunning === '1') {
      SteamBotManager.start(user.id);
      steamRestored++;
      console.log(`[Server] Steam bot авто-восстановлен для пользователя ${user.id}`);
    }
  }
  if (steamRestored > 0) {
    console.log(`[Server] Steam-ботов восстановлено: ${steamRestored}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  Start
// ════════════════════════════════════════════════════════════════════════════

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
