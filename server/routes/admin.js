'use strict';

const express = require('express');
const db      = require('../db');
const config  = require('../config');
const { requireAdmin } = require('../middleware/auth');
const SbpPaymentService = require('../services/SbpPaymentService');

const router = express.Router();

router.get('/stats', requireAdmin, async (req, res, next) => {
  try { res.json(await db.getAdminStats()); }
  catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  PAYMENTS ADMIN
// ═══════════════════════════════════════════════════════════════════════════

router.get('/payments', requireAdmin, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '50'), 200);
    const offset = parseInt(req.query.offset || '0');
    const { status, method, search, date_from, date_to } = req.query;
    const result = await db.getAdminTransactions({ limit, offset, status, method, search, dateFrom: date_from, dateTo: date_to });
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/payments/stats', requireAdmin, async (req, res, next) => {
  try { res.json(await db.getPaymentStats()); }
  catch (e) { next(e); }
});

router.get('/payments/:id', requireAdmin, async (req, res, next) => {
  try {
    const tx = await db.getTransactionById(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Транзакция не найдена' });
    res.json(tx);
  } catch (e) { next(e); }
});

router.patch('/payments/:id', requireAdmin, async (req, res, next) => {
  try {
    const tx = await db.getTransactionById(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Транзакция не найдена' });

    const { status } = req.body;
    const allowed = ['completed', 'failed', 'refunded', 'pending'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Недопустимый статус' });

    await db.updateTransaction(req.params.id, { status });
    await db.auditLog(req.user.id, 'admin.payment.update', 'payment_transaction', req.params.id, {
      old_status: tx.status, new_status: status,
    });

    // Если подтверждаем платёж — активируем подписку
    if (status === 'completed' && tx.status === 'pending' && tx.plan_id && tx.user_id) {
      const SubscriptionService = require('../services/SubscriptionService');
      await SubscriptionService.activatePlan(tx.user_id, tx.plan_id, tx.billing_period || 'monthly');
    }

    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/users', requireAdmin, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '50'), 200);
    const offset = parseInt(req.query.offset || '0');
    const search = req.query.search || '';
    const [users, total] = await Promise.all([
      db.getAdminUserList({ limit, offset, search }),
      db.countUsers(),
    ]);
    res.json({ users, total, limit, offset });
  } catch (e) { next(e); }
});

router.get('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const [sub, history, profiles, campaigns, stats] = await Promise.all([
      db.getActiveSubscription(req.params.id),
      db.getSubscriptionHistory(req.params.id),
      db.getProfiles(req.params.id),
      db.getCampaigns(req.params.id),
      db.getJobStats(req.params.id),
    ]);

    res.json({
      user, subscription: sub, subscription_history: history,
      profiles: profiles.map(p => ({ id: p.id, name: p.name, is_active: p.is_active, created_at: p.created_at })),
      campaigns, stats,
    });
  } catch (e) { next(e); }
});

router.patch('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const { is_active, role, name } = req.body;
    const updates = {};
    if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;
    if (role      !== undefined) updates.role      = role;
    if (name      !== undefined) updates.name      = name;

    await db.updateUser(req.params.id, updates);
    await db.auditLog(req.user.id, 'admin.user.update', 'user', req.params.id, updates);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    if (req.params.id === req.userId)
      return res.status(400).json({ error: 'Нельзя удалить себя' });

    const user = await db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    await db.deleteUser(req.params.id);
    await db.auditLog(req.user.id, 'admin.user.delete', 'user', req.params.id, { email: user.email });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

const setSubscription = async (req, res, next) => {
  try {
    const { plan_id, billing_period = 'monthly', status = 'active', days } = req.body;

    const [user, plan] = await Promise.all([
      db.getUserById(req.params.id),
      db.getPlan(plan_id),
    ]);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (!plan) return res.status(400).json({ error: 'План не найден' });

    // Отменяем текущую подписку (если есть)
    const oldSub = await db.getActiveSubscription(req.params.id);
    if (oldSub) {
      await db.updateSubscription(oldSub.id, {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: `Изменено администратором на план ${plan_id}`,
      });
    }

    const daysNum = Number(days) || 30;
    const expiresAt = new Date(Date.now() + daysNum * 86400000).toISOString();

    if (status === 'trial') {
      const subId = await db.createSubscription({
        userId: req.params.id, planId: plan_id, billingPeriod: billing_period,
        status: 'trial', trialDays: daysNum,
      });
      await db.auditLog(req.user.id, 'admin.subscription.set', 'subscription', subId, {
        user_id: req.params.id, plan_id, status, days: daysNum,
      });
      return res.json({ ok: true, subscription_id: subId });
    }

    const subId = await db.createSubscription({
      userId: req.params.id, planId: plan_id, billingPeriod: billing_period, status,
    });
    await db.updateSubscription(subId, { expires_at: expiresAt });

    await db.auditLog(req.user.id, 'admin.subscription.set', 'subscription', subId, {
      user_id: req.params.id, plan_id, status, days: daysNum,
    });
    res.json({ ok: true, subscription_id: subId });
  } catch (e) { next(e); }
};

router.post('/users/:id/subscription', requireAdmin, setSubscription);
router.put('/users/:id/subscription', requireAdmin, setSubscription);

router.get('/plans', requireAdmin, async (req, res, next) => {
  try { res.json(await db.getPlans(false)); }
  catch (e) { next(e); }
});

router.put('/plans/:id', requireAdmin, async (req, res, next) => {
  try {
    await db.upsertPlan({ ...req.body, id: req.params.id });
    await db.auditLog(req.user.id, 'admin.plan.upsert', 'plan', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/plans/:id', requireAdmin, async (req, res, next) => {
  try {
    const plan = await db.getPlan(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Тариф не найден' });

    await db.upsertPlan({ ...plan, is_active: false });
    await db.auditLog(req.user.id, 'admin.plan.deactivate', 'plan', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  SERVER CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const SENSITIVE_KEYS = ['DB_PASSWORD', 'JWT_SECRET', 'ADMIN_PASSWORD', 'SMTP_PASS',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];

/**
 * GET /api/admin/config — current running configuration
 * Returns env vars merged with DB server_settings; secrets are masked.
 */
router.get('/config', requireAdmin, async (req, res, next) => {
  try {
    const dbSettings = await db.getAllServerSettings();

    // Groups of config
    const groups = {
      general: {
        label: 'Общие',
        items: {
          APP_URL:    { value: config.appUrl, env: true, description: 'URL приложения' },
          NODE_ENV:   { value: config.nodeEnv, env: true, description: 'Окружение (production/development)' },
          TRIAL_DAYS: { value: String(config.trialDays), env: true, editable: true, description: 'Пробный период (дней)' },
        },
      },
      email: {
        label: 'Email / SMTP',
        items: {
          SMTP_HOST:  { value: config.email.smtp.host, env: true, editable: true, description: 'SMTP сервер' },
          SMTP_PORT:  { value: String(config.email.smtp.port), env: true, editable: true, description: 'SMTP порт' },
          SMTP_USER:  { value: config.email.smtp.user, env: true, editable: true, description: 'SMTP пользователь' },
          SMTP_PASS:  { value: config.email.smtp.pass ? '••••••••' : '', env: true, sensitive: true, description: 'SMTP пароль' },
          EMAIL_FROM: { value: config.email.from, env: true, editable: true, description: 'Адрес отправителя' },
        },
      },
      stripe: {
        label: 'Stripe / Платежи',
        items: {
          STRIPE_SECRET_KEY:      { value: config.stripe.secretKey ? '••••••••' : '', env: true, sensitive: true, description: 'Secret Key' },
          STRIPE_PUBLISHABLE_KEY: { value: config.stripe.publishableKey || '', env: true, editable: true, description: 'Publishable Key' },
          STRIPE_WEBHOOK_SECRET:  { value: config.stripe.webhookSecret ? '••••••••' : '', env: true, sensitive: true, description: 'Webhook Secret' },
        },
      },
      playwright: {
        label: 'Playwright / Браузер',
        items: {
          PLAYWRIGHT_HEADLESS: { value: String(config.playwright.headless), env: true, editable: true, description: 'Headless режим' },
          PLAYWRIGHT_SLOW_MO:  { value: String(config.playwright.slowMo), env: true, editable: true, description: 'Задержка между действиями (мс)' },
          PLAYWRIGHT_RETRIES:  { value: String(config.playwright.retries), env: true, editable: true, description: 'Количество повторов' },
        },
      },
      rateLimit: {
        label: 'Rate Limiting',
        items: {
          RATE_LIMIT_WINDOW_MS:  { value: String(config.rateLimit.windowMs), env: true, editable: true, description: 'Окно ограничений (мс)' },
          RATE_LIMIT_MAX_PUBLIC: { value: String(config.rateLimit.maxPublic), env: true, editable: true, description: 'Макс. запросов (публичные)' },
          RATE_LIMIT_MAX_AUTH:   { value: String(config.rateLimit.maxAuth), env: true, editable: true, description: 'Макс. запросов (авторизация)' },
        },
      },
      database: {
        label: 'База данных',
        items: {
          DB_TYPE:     { value: config.db.type, env: true, description: 'Тип БД' },
          DB_HOST:     { value: config.db.postgresql.host, env: true, description: 'Хост' },
          DB_PORT:     { value: String(config.db.postgresql.port), env: true, description: 'Порт' },
          DB_NAME:     { value: config.db.postgresql.database, env: true, description: 'Имя БД' },
          DB_USER:     { value: config.db.postgresql.user, env: true, description: 'Пользователь' },
          DB_PASSWORD: { value: '••••••••', env: true, sensitive: true, description: 'Пароль' },
        },
      },
    };

    // Merge DB server_settings values as overrides
    for (const group of Object.values(groups)) {
      for (const [key, item] of Object.entries(group.items)) {
        if (dbSettings[key] !== undefined) {
          item.dbValue   = SENSITIVE_KEYS.includes(key) ? '••••••••' : dbSettings[key];
          item.overridden = true;
        }
      }
    }

    res.json({ groups, dbSettings: Object.fromEntries(
      Object.entries(dbSettings).filter(([k]) => !SENSITIVE_KEYS.includes(k))
    ) });
  } catch (e) { next(e); }
});

/**
 * PUT /api/admin/config — save runtime server settings to DB
 * Body: { settings: { key: value, ... } }
 * NOTE: this does NOT change env vars, only server_settings table.
 * The app needs restart to pick up changes in some areas.
 */
router.put('/config', requireAdmin, async (req, res, next) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object')
      return res.status(400).json({ error: 'settings object required' });

    // Do not allow editing truly sensitive values via API for security
    const forbidden = ['DB_PASSWORD', 'JWT_SECRET', 'ADMIN_PASSWORD'];
    for (const key of forbidden) delete settings[key];

    await db.bulkSetServerSettings(settings);
    await db.auditLog(req.user.id, 'admin.config.update', 'server_settings', null, {
      keys: Object.keys(settings),
    });

    res.json({ ok: true, saved: Object.keys(settings).length });
  } catch (e) { next(e); }
});

/**
 * GET /api/admin/audit — audit log
 */
router.get('/audit', requireAdmin, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit || '50'), 200);
    const offset = parseInt(req.query.offset || '0');

    const rows = await db.getAuditLog ? db.getAuditLog({ limit, offset }) : [];
    res.json({ logs: rows, limit, offset });
  } catch (e) { next(e); }
});

/* ═══════ WITHDRAWAL REQUESTS ═══════ */
router.get('/withdrawals', requireAdmin, async (req, res, next) => {
  try {
    const status = req.query.status || null;
    const items = await db.getAllWithdrawalRequests(status);
    res.json(items || []);
  } catch (e) { next(e); }
});

router.patch('/withdrawals/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, admin_note } = req.body;
    if (!['approved', 'rejected', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Недопустимый статус' });
    }

    const wd = await db.getWithdrawalRequests ? null : null;
    // Update withdrawal
    const updates = { status };
    if (admin_note) updates.admin_note = admin_note;
    if (['approved', 'rejected', 'completed'].includes(status)) {
      updates.processed_at = new Date().toISOString();
    }

    await db.updateWithdrawalRequest(id, updates);

    // If rejected, refund the frozen amount to user balance
    if (status === 'rejected') {
      // Find the withdrawal to get amount and user_id
      const rows = await db.getAllWithdrawalRequests();
      const wr = rows.find(r => String(r.id) === String(id));
      if (wr) {
        await db.updateUserBalance(wr.user_id, wr.amount); // positive = refund
        await db.createBalanceTransaction({
          userId: wr.user_id,
          type: 'refund',
          amount: wr.amount,
          balanceAfter: (await db.getUserBalance(wr.user_id)) || 0,
          description: `Возврат средств: заявка на вывод #${id} отклонена`,
          referenceType: 'withdrawal',
          referenceId: String(id),
        });
      }
    }

    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  PARTNER REFERRALS (for YouTubers / influencers)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/partners', requireAdmin, async (req, res, next) => {
  try {
    const partners = await db.getPartnerReferrals();
    res.json(partners);
  } catch (e) { next(e); }
});

router.post('/partners', requireAdmin, async (req, res, next) => {
  try {
    const { user_id, code, label, commission_percent } = req.body;
    if (!user_id || !code) return res.status(400).json({ error: 'user_id и code обязательны' });

    const user = await db.getUserById(user_id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const existing = await db.getPartnerReferralByCode(code);
    if (existing) return res.status(409).json({ error: 'Код уже занят' });

    const partner = await db.createPartnerReferral({
      userId: user_id,
      code: code.toUpperCase(),
      label: label || '',
      commissionPercent: commission_percent || 10,
    });
    res.status(201).json(partner);
  } catch (e) { next(e); }
});

router.patch('/partners/:id', requireAdmin, async (req, res, next) => {
  try {
    const { label, commission_percent, is_active } = req.body;
    const updates = {};
    if (label !== undefined) updates.label = label;
    if (commission_percent !== undefined) updates.commission_percent = commission_percent;
    if (is_active !== undefined) updates.is_active = is_active;
    await db.updatePartnerReferral(req.params.id, updates);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/partners/:id', requireAdmin, async (req, res, next) => {
  try {
    await db.deletePartnerReferral(req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
