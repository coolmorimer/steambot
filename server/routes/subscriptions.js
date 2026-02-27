'use strict';

const express   = require('express');
const db        = require('../db');
const config    = require('../config');
const { requireAuth, requireActiveUser } = require('../middleware/auth');
const SubscriptionService = require('../services/SubscriptionService');

const router = express.Router();
const ALL    = [requireAuth, requireActiveUser];

router.get('/plans', async (req, res, next) => {
  try { res.json(await db.getPlans(true)); }
  catch (e) { next(e); }
});

router.get('/current', ALL, async (req, res, next) => {
  try {
    const sub = await db.getActiveSubscription(req.userId);
    if (!sub) return res.json(null);
    const plans = await db.getPlans(true);
    res.json({
      id: sub.id, plan_id: sub.plan_id, plan_name: sub.plan_name,
      status: sub.status, billing_period: sub.billing_period,
      started_at: sub.started_at, expires_at: sub.expires_at, trial_ends_at: sub.trial_ends_at,
      limits: {
        max_steam_accounts: sub.max_steam_accounts, max_campaigns: sub.max_campaigns,
        max_jobs_per_day: sub.max_jobs_per_day, max_telegram_bots: sub.max_telegram_bots,
      },
      features: {
        has_mini_app: !!sub.has_mini_app, has_ai_templates: !!sub.has_ai_templates,
        has_analytics: !!sub.has_analytics, has_priority_support: !!sub.has_priority_support,
        has_api_access: !!sub.has_api_access,
      },
      available_plans: plans,
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
    const isExpired = !currentSub || currentSub.status === 'expired' || currentSub.status === 'cancelled';
    const isTrialExpired = currentSub?.status === 'trial' && currentSub.trial_ends_at && new Date(currentSub.trial_ends_at) < new Date();

    // После истечения trial пользователь может только купить (Stripe) или обратиться к админу
    if (isExpired || isTrialExpired) {
      if (!config.stripe.enabled) {
        return res.status(403).json({
          error: 'Пробный период истёк. Оплатите подписку или обратитесь к администратору.',
          code: 'PAYMENT_REQUIRED',
        });
      }
      // Stripe включён — перенаправляем на оплату
      const session = await SubscriptionService.createCheckoutSession({
        userId: req.userId, planId: plan_id, billingPeriod: billing_period,
        successUrl: `${config.appUrl}/dashboard?upgraded=1`,
        cancelUrl:  `${config.appUrl}/subscription`,
      });
      return res.json({ ok: true, checkout_url: session.url, session_id: session.id });
    }

    // Во время активного trial — смена плана только через оплату
    if (currentSub?.status === 'trial') {
      if (!config.stripe.enabled) {
        return res.status(403).json({
          error: 'Для смены тарифа необходимо оплатить подписку. Система оплаты находится в разработке.',
          code: 'PAYMENT_REQUIRED',
        });
      }
      const session = await SubscriptionService.createCheckoutSession({
        userId: req.userId, planId: plan_id, billingPeriod: billing_period,
        successUrl: `${config.appUrl}/dashboard?upgraded=1`,
        cancelUrl:  `${config.appUrl}/subscription`,
      });
      return res.json({ ok: true, checkout_url: session.url, session_id: session.id });
    }

    // Активная подписка — смена только через оплату
    if (!config.stripe.enabled) {
      return res.status(403).json({
        error: 'Для смены тарифа необходимо оплатить подписку. Система оплаты находится в разработке.',
        code: 'PAYMENT_REQUIRED',
      });
    }

    const session = await SubscriptionService.createCheckoutSession({
      userId: req.userId, planId: plan_id, billingPeriod: billing_period,
      successUrl: `${config.appUrl}/dashboard?upgraded=1`,
      cancelUrl:  `${config.appUrl}/subscription`,
    });
    res.json({ ok: true, checkout_url: session.url, session_id: session.id });
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
