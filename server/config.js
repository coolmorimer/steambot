'use strict';

require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '4000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  // ── Database ────────────────────────────────────────────────────────────
  db: {
    type: process.env.DB_TYPE || 'sqlite',  // 'sqlite' | 'postgresql'
    sqlite: {
      path: process.env.SQLITE_PATH || './data/server.db',
    },
    postgresql: {
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME     || 'steambot',
      user:     process.env.DB_USER     || 'steambot',
      password: process.env.DB_PASSWORD || '',
      ssl:      process.env.DB_SSL === 'true',
    },
  },

  // ── JWT ─────────────────────────────────────────────────────────────────
  jwt: {
    secret:          process.env.JWT_SECRET          || 'CHANGE_ME_IN_PRODUCTION_32_CHARS_MIN',
    expiresIn:       process.env.JWT_EXPIRES_IN       || '7d',
    refreshExpiresIn:process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  // ── Admin (created on first run) ─────────────────────────────────────────
  admin: {
    email:    process.env.ADMIN_EMAIL    || 'admin@steambot.local',
    password: process.env.ADMIN_PASSWORD || 'admin123',
    name:     process.env.ADMIN_NAME     || 'Admin',
  },

  // ── App URL (for email links, mini app) ──────────────────────────────────
  appUrl: process.env.APP_URL || 'http://localhost:4000',

  // ── Trial ───────────────────────────────────────────────────────────────
  trialDays: parseInt(process.env.TRIAL_DAYS || '3'),

  // ── Stripe (optional) ────────────────────────────────────────────────────
  stripe: {
    secretKey:      process.env.STRIPE_SECRET_KEY      || '',
    webhookSecret:  process.env.STRIPE_WEBHOOK_SECRET  || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    enabled:        !!process.env.STRIPE_SECRET_KEY,
  },

  // ── Sberbank Acquiring ───────────────────────────────────────────────────
  sberbank: {
    token:   process.env.SBERBANK_TOKEN   || '',
    apiUrl:  process.env.SBERBANK_API_URL || 'https://securepayments.sberbank.ru/payment/rest',
    enabled: !!process.env.SBERBANK_TOKEN,
  },

  // ── YooKassa ────────────────────────────────────────────────────────────
  yookassa: {
    shopId:    process.env.YOOKASSA_SHOP_ID    || '',
    secretKey: process.env.YOOKASSA_SECRET_KEY || '',
    enabled:   !!process.env.YOOKASSA_SHOP_ID && !!process.env.YOOKASSA_SECRET_KEY,
  },

  // ── Evotor (онлайн-касса) ──────────────────────────────────────────────
  evotor: {
    accessToken:  process.env.EVOTOR_ACCESS_TOKEN  || '',
    refreshToken: process.env.EVOTOR_REFRESH_TOKEN || '',
    enabled:      !!process.env.EVOTOR_ACCESS_TOKEN,
  },

  steam: {
    apiKey:  process.env.STEAM_API_KEY || '',
    enabled: !!process.env.STEAM_API_KEY,
  },

  google: {
    clientId:     process.env.GOOGLE_CLIENT_ID     || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    enabled:      !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
  },

  // ── Email (optional) ─────────────────────────────────────────────────────
  email: {
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587'),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    from:    process.env.EMAIL_FROM || 'noreply@steambot.local',
    enabled: !!process.env.SMTP_HOST,
  },

  // ── Playwright ───────────────────────────────────────────────────────────
  playwright: {
    headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
    slowMo:   parseInt(process.env.PLAYWRIGHT_SLOW_MO || '100'),
    retries:  parseInt(process.env.PLAYWRIGHT_RETRIES || '2'),
  },

  // ── Rate limiting ────────────────────────────────────────────────────────
  rateLimit: {
    windowMs:  parseInt(process.env.RATE_LIMIT_WINDOW_MS  || '900000'), // 15 min
    maxPublic: parseInt(process.env.RATE_LIMIT_MAX_PUBLIC || '500'),    // 500/15min
    maxAuth:   parseInt(process.env.RATE_LIMIT_MAX_AUTH   || '50'),     // 50/15min (login)
  },
};
