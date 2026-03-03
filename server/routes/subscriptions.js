'use strict';

const express   = require('express');
const db        = require('../db');
const config    = require('../config');
const { requireAuth, requireActiveUser } = require('../middleware/auth');
const SubscriptionService = require('../services/SubscriptionService');
const SbpPaymentService   = require('../services/SbpPaymentService');
const YooKassaService     = require('../services/YooKassaService');

const router = express.Router();
const ALL    = [requireAuth, requireActiveUser];

// Выбираем активный платёжный провайдер для получения цен
function getActivePriceRub(planId, billingPeriod) {
  if (config.yookassa.enabled) return YooKassaService.getPriceRub(planId, billingPeriod);
  return SbpPaymentService.getPriceRub(planId, billingPeriod);
}

router.get('/plans', async (req, res, next) => {
  try {
    const plans = await db.getPlans(true);
    // Добавляем рублёвые цены к каждому плану
    const enriched = plans.map(p => ({
      ...p,
      price_monthly_rub: getActivePriceRub(p.id, 'monthly'),
      price_yearly_rub:  getActivePriceRub(p.id, 'yearly'),
    }));
    res.json(enriched);
  }
  catch (e) { next(e); }
});

router.get('/current', ALL, async (req, res, next) => {
  try {
    const sub = await db.getActiveSubscription(req.userId);
    if (!sub) return res.json(null);

    // Последний успешный платёж
    const transactions = await db.getTransactions(req.userId, 5);
    const lastPayment = transactions.find(t => t.status === 'completed') || null;

    // Оставшиеся дни
    let daysLeft = null;
    if (sub.expires_at) {
      daysLeft = Math.max(0, Math.ceil((new Date(sub.expires_at) - Date.now()) / 86400000));
    } else if (sub.status === 'trial' && sub.trial_ends_at) {
      daysLeft = Math.max(0, Math.ceil((new Date(sub.trial_ends_at) - Date.now()) / 86400000));
    }

    // Рублёвая цена текущего плана
    const priceRub = getActivePriceRub(sub.plan_id, sub.billing_period || 'monthly');

    res.json({
      id: sub.id, plan_id: sub.plan_id, plan_name: sub.plan_name,
      status: sub.status, billing_period: sub.billing_period,
      started_at: sub.started_at, expires_at: sub.expires_at, trial_ends_at: sub.trial_ends_at,
      days_left: daysLeft,
      price_rub: priceRub,
      limits: {
        max_steam_accounts: sub.max_steam_accounts, max_campaigns: sub.max_campaigns,
        max_jobs_per_day: sub.max_jobs_per_day, max_telegram_bots: sub.max_telegram_bots,
        max_steam_groups: sub.max_steam_groups ?? 0,
      },
      features: {
        has_mini_app: !!sub.has_mini_app, has_ai_templates: !!sub.has_ai_templates,
        has_analytics: !!sub.has_analytics, has_priority_support: !!sub.has_priority_support,
        has_api_access: !!sub.has_api_access,
      },
      last_payment: lastPayment ? {
        amount:     lastPayment.amount,
        currency:   lastPayment.currency,
        date:       lastPayment.created_at,
        method:     lastPayment.payment_method,
        plan_id:    lastPayment.plan_id,
        period:     lastPayment.billing_period,
      } : null,
    });
  } catch (e) { next(e); }
});

router.get('/history', ALL, async (req, res, next) => {
  try { res.json(await db.getSubscriptionHistory(req.userId)); }
  catch (e) { next(e); }
});

router.get('/transactions', ALL, async (req, res, next) => {
  try { res.json(await db.getTransactions(req.userId, 50)); }
  catch (e) { next(e); }
});

router.post('/upgrade', ALL, async (req, res, next) => {
  try {
    const { plan_id, billing_period = 'monthly' } = req.body;
    if (!plan_id) return res.status(400).json({ error: 'plan_id обязателен' });

    const plan = await db.getPlan(plan_id);
    if (!plan || !plan.is_active) return res.status(400).json({ error: 'План не найден' });

    // Проверяем текущую подписку
    const currentSub = await db.getActiveSubscription(req.userId);

    const priceRub = getActivePriceRub(plan_id, billing_period);

    // Бесплатный план — сразу переключаем
    if (priceRub <= 0) {
      await SubscriptionService.activatePlan(req.userId, plan_id, billing_period);
      return res.json({ ok: true, message: 'Тариф активирован' });
    }

    // Платный план — создаём платёж (ЮKassa → Sberbank → ошибка)
    try {
      let payment;
      if (config.yookassa.enabled) {
        payment = await YooKassaService.createSubscriptionPayment({
          userId:        req.userId,
          planId:        plan_id,
          billingPeriod: billing_period,
          returnUrl:     `${config.appUrl}/subscription?payment=success`,
        });
      } else if (config.sberbank.enabled) {
        payment = await SbpPaymentService.createPayment({
          userId:        req.userId,
          planId:        plan_id,
          billingPeriod: billing_period,
          returnUrl:     `${config.appUrl}/subscription?payment=success`,
        });
      } else {
        return res.status(400).json({ error: 'Платёжная система не настроена', code: 'PAYMENT_ERROR' });
      }
      return res.json({
        ok:               true,
        payment_required: true,
        payment:          payment,
      });
    } catch (payErr) {
      return res.status(400).json({
        error: payErr.message || 'Ошибка создания платежа',
        code:  'PAYMENT_ERROR',
      });
    }
  } catch (e) { next(e); }
});

router.post('/cancel', ALL, async (req, res, next) => {
  try {
    const { reason } = req.body;
    await SubscriptionService.cancelSubscription(req.userId, reason);
    res.json({ ok: true, message: 'Подписка будет отменена в конце периода.' });
  } catch (e) { next(e); }
});

router.post('/portal', ALL, async (req, res, next) => {
  try {
    if (!config.stripe.enabled) return res.status(400).json({ error: 'Stripe не настроен' });
    const url = await SubscriptionService.createPortalSession(req.userId);
    res.json({ ok: true, url });
  } catch (e) { next(e); }
});

module.exports = router;
