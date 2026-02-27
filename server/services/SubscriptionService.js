'use strict';

/**
 * server/services/SubscriptionService.js
 *
 * Бизнес-логика подписок.
 * Работает как со Stripe, так и без него (ручная активация).
 */

const db     = require('../db');
const config = require('../config');

// ── Ручная активация плана (без Stripe) ───────────────────────────────────────

async function activatePlan(userId, planId, billingPeriod = 'monthly') {
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

  await db.createTransaction({
    userId,
    subscriptionId: subId,
    amount:         billingPeriod === 'yearly' ? plan.price_yearly : plan.price_monthly,
    currency:       'USD',
    status:         'completed',
    planId,
    billingPeriod,
    paymentMethod:  'manual',
  });

  return { subscription_id: subId, expires_at: expiresAt };
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
