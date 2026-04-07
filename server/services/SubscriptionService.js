'use strict';

/**
 * server/services/SubscriptionService.js
 *
 * Бизнес-логика подписок.
 * Работает как со Stripe, так и без него (ручная активация).
 */

const db     = require('../db');
const config = require('../config');
const logger = require('../logger');

// ── Ручная активация плана (без Stripe) ───────────────────────────────────────

async function activatePlan(userId, planId, billingPeriod = 'monthly', { skipTransaction = false, paymentMethod = 'yookassa' } = {}) {
  const plan = await db.getPlan(planId);
  if (!plan || !plan.is_active) throw new Error('План не найден');

  // Деактивируем текущую подписку (если есть)
  const oldSub = await db.getActiveSubscription(userId);
  if (oldSub) {
    await db.updateSubscription(oldSub.id, {
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: `Обновление на план ${planId}`,
    });
  }

  const daysMap = { monthly: 30, yearly: 365 };
  const days    = daysMap[billingPeriod] || 30;
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

  const subId = await db.createSubscription({
    userId,
    planId,
    billingPeriod,
    status: 'active',
  });
  await db.updateSubscription(subId, { expires_at: expiresAt });

  if (!skipTransaction) {
    const SbpPaymentService = require('./SbpPaymentService');
    const amountRub = SbpPaymentService.getPriceRub(planId, billingPeriod) || (billingPeriod === 'yearly' ? plan.price_yearly : plan.price_monthly);
    await db.createTransaction({
      userId,
      subscriptionId: subId,
      amount:         amountRub,
      currency:       'RUB',
      status:         'completed',
      planId,
      billingPeriod,
      paymentMethod:  paymentMethod,
    });
  }

  // ── Реферальные бонусы (только при первой оплате) ──────────────────────────
  try {
    await processReferralRewards(userId, planId, billingPeriod);
  } catch (refErr) {
    logger.warn('Ошибка обработки реферальных бонусов', { err: refErr.message, userId });
  }

  return { subscription_id: subId, expires_at: expiresAt };
}

// ── Обработка реферальных бонусов после первой оплаты ─────────────────────────

async function processReferralRewards(userId, planId, billingPeriod) {
  // Найти запись реферала для этого пользователя
  const refUse = await db.getReferralUseByReferredId(userId);
  if (!refUse || refUse.reward_given) return; // нет реферала или уже начислен

  const user = await db.getUserById(userId);
  if (!user || !user.referred_by) return;

  if (refUse.referral_type === 'user') {
    // ── Обычный реферер: +7 дней к его подписке ──
    const extended = await db.extendSubscription(refUse.referrer_id, 7);
    await db.markReferralUseRewarded(refUse.id, 'trial_days', 7);
    logger.info('Реферальный бонус +7 дней рефереру (после оплаты)', {
      referrerId: refUse.referrer_id, referredId: userId, extended,
    });
  } else if (refUse.referral_type === 'partner') {
    // ── Партнёр: комиссия от суммы оплаты ──
    const SbpPaymentService = require('./SbpPaymentService');
    const amountRub = SbpPaymentService.getPriceRub(planId, billingPeriod) || 0;
    const partner = refUse.partner_referral_id
      ? await db.getPartnerReferral(refUse.partner_referral_id)
      : null;
    const commissionPercent = partner?.commission_percent || 10;
    const earningsKopecks = Math.round(amountRub * 100 * commissionPercent / 100); // сумма в копейках

    await db.createReferralEarning({
      partnerReferralId: refUse.partner_referral_id,
      referralUseId: refUse.id,
      amount: earningsKopecks,
    });
    await db.incrementPartnerReferralStats(refUse.partner_referral_id, earningsKopecks);
    await db.markReferralUseRewarded(refUse.id, 'commission', earningsKopecks);
    logger.info('Партнёрская комиссия начислена (после оплаты)', {
      partnerId: refUse.partner_referral_id, referredId: userId,
      amountRub, commissionPercent, earningsKopecks,
    });
  }

  // ── Приглашённому пользователю: +3 дня в подарок ──
  const giftExtended = await db.extendSubscription(userId, 3);
  logger.info('Подарок приглашённому +3 дня', { userId, giftExtended });
}

// ── Stripe: создать Checkout Session ─────────────────────────────────────────

async function createCheckoutSession({ userId, planId, billingPeriod, successUrl, cancelUrl }) {
  if (!config.stripe.enabled) throw new Error('Stripe не настроен');

  const stripe = require('stripe')(config.stripe.secretKey);
  const plan   = await db.getPlan(planId);
  const user   = await db.getUserById(userId);

  if (!plan || !plan.is_active) throw new Error('План не найден');

  const priceId = billingPeriod === 'yearly'
    ? plan.stripe_yearly_price_id
    : plan.stripe_monthly_price_id;

  if (!priceId) throw new Error('Stripe price ID не настроен для этого плана');

  // Получить или создать stripe customer
  const existingSub = await db.getActiveSubscription(userId);
  let customerId = existingSub?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name:  user.name || user.email,
      metadata: { user_id: userId },
    });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    mode:       'subscription',
    customer:   customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url:  cancelUrl,
    metadata: {
      user_id:        userId,
      plan_id:        planId,
      billing_period: billingPeriod,
    },
    subscription_data: {
      metadata: { user_id: userId, plan_id: planId },
    },
  });

  return session;
}

// ── Stripe: обработать checkout.session.completed ────────────────────────────

async function handleCheckoutCompleted(userId, session) {
  const stripe       = require('stripe')(config.stripe.secretKey);
  const planId       = session.metadata?.plan_id;
  const billingPeriod = session.metadata?.billing_period || 'monthly';
  const subId        = session.subscription;

  if (!planId || !subId) return;

  const stripeSub = await stripe.subscriptions.retrieve(subId);
  const expiresAt = new Date(stripeSub.current_period_end * 1000).toISOString();

  // Отменяем текущую подписку (если есть)
  const oldSub = await db.getActiveSubscription(userId);
  if (oldSub) {
    await db.updateSubscription(oldSub.id, {
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: `Обновление через Stripe на план ${planId}`,
    });
  }

  const dbSubId = await db.createSubscription({
    userId,
    planId,
    billingPeriod,
    status: 'active',
  });

  await db.updateSubscription(dbSubId, {
    expires_at:             expiresAt,
    stripe_subscription_id: subId,
    stripe_customer_id:     session.customer,
  });

  await db.createTransaction({
    userId,
    subscriptionId: dbSubId,
    amount:         session.amount_total / 100,
    currency:       session.currency.toUpperCase(),
    status:         'completed',
    planId,
    billingPeriod,
    paymentMethod:  'stripe',
    externalId:     session.id,
  });

  // ── Реферальные бонусы (только при первой оплате) ──────────────────────────
  try {
    await processReferralRewards(userId, planId, billingPeriod);
  } catch (refErr) {
    logger.warn('Ошибка обработки реферальных бонусов (Stripe)', { err: refErr.message, userId });
  }
}

// ── Отмена подписки ────────────────────────────────────────────────────────────

async function cancelSubscription(userId, reason) {
  const sub = await db.getActiveSubscription(userId);
  if (!sub) throw new Error('Нет активной подписки');

  if (sub.stripe_subscription_id && config.stripe.enabled) {
    const stripe = require('stripe')(config.stripe.secretKey);
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
  }

  await db.updateSubscription(sub.id, {
    cancelled_at:  new Date().toISOString(),
    cancel_reason: reason || null,
  });
}

// ── Stripe: customer portal ────────────────────────────────────────────────────

async function createPortalSession(userId) {
  const stripe = require('stripe')(config.stripe.secretKey);
  const sub    = await db.getActiveSubscription(userId);
  if (!sub?.stripe_customer_id) throw new Error('Stripe customer не найден');

  const session = await stripe.billingPortal.sessions.create({
    customer:   sub.stripe_customer_id,
    return_url: `${config.appUrl}/dashboard`,
  });
  return session.url;
}

// ── Cron: проверять истёкшие подписки ─────────────────────────────────────────

function startExpirationChecker() {
  const cron = require('node-cron');
  // Каждый час
  cron.schedule('0 * * * *', async () => {
    try {
      const now = new Date().toISOString();
      await db.expireTrialSubscriptions(now);
      await db.expireActiveSubscriptions(now);
      await db.cleanExpiredTokens();
      await db.cleanup2FACodes();
    } catch (err) {
      // тихо логируем
      console.error('[ExpirationChecker]', err.message);
    }
  });
}

module.exports = {
  activatePlan,
  createCheckoutSession,
  handleCheckoutCompleted,
  cancelSubscription,
  createPortalSession,
  startExpirationChecker,
};
