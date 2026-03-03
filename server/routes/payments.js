'use strict';

/**
 * server/routes/payments.js
 *
 * POST /api/payments/webhook       — Stripe webhook (raw body!)
 * POST /api/payments/sbp/callback  — СБП / онлайн-касса callback
 * POST /api/payments/sbp/create    — Создать платёж через СБП
 * GET  /api/payments/sbp/:id/status — Проверить статус платежа
 *
 * Обрабатывает события:
 *  - checkout.session.completed
 *  - invoice.payment_succeeded
 *  - invoice.payment_failed
 *  - customer.subscription.deleted
 *  - customer.subscription.updated
 */

const express = require('express');
const config  = require('../config');
const db      = require('../db');
const SubscriptionService = require('../services/SubscriptionService');
const SbpPaymentService   = require('../services/SbpPaymentService');
const YooKassaService     = require('../services/YooKassaService');
const logger              = require('../logger');
const { requireAuth, requireActiveUser } = require('../middleware/auth');

const router  = express.Router();
const ALL     = [requireAuth, requireActiveUser];

// ═══════════════════════════════════════════════════════════════════════════
//  СБП — Создать платёж
// ═══════════════════════════════════════════════════════════════════════════

router.post('/sbp/create', ALL, async (req, res, next) => {
  try {
    const { plan_id, billing_period = 'monthly' } = req.body;
    if (!plan_id) return res.status(400).json({ error: 'plan_id обязателен' });

    const plan = await db.getPlan(plan_id);
    if (!plan || !plan.is_active) return res.status(400).json({ error: 'Тариф не найден' });

    const price = config.yookassa.enabled
      ? YooKassaService.getPriceRub(plan_id, billing_period)
      : SbpPaymentService.getPriceRub(plan_id, billing_period);
    if (price <= 0) return res.status(400).json({ error: 'Этот тариф бесплатный' });

    let result;
    if (config.yookassa.enabled) {
      result = await YooKassaService.createSubscriptionPayment({
        userId:        req.userId,
        planId:        plan_id,
        billingPeriod: billing_period,
        returnUrl:     `${config.appUrl}/subscription?payment=success`,
      });
    } else if (config.sberbank.enabled) {
      result = await SbpPaymentService.createPayment({
        userId:        req.userId,
        planId:        plan_id,
        billingPeriod: billing_period,
        returnUrl:     `${config.appUrl}/subscription?payment=success`,
      });
    } else {
      return res.status(400).json({ error: 'Платёжная система не настроена' });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  СБП — Проверить статус платежа
// ═══════════════════════════════════════════════════════════════════════════

router.get('/sbp/:id/status', ALL, async (req, res, next) => {
  try {
    // Если Sberbank не настроен, пробуем YooKassa
    if (!config.sberbank.enabled && config.yookassa.enabled) {
      const result = await YooKassaService.getPaymentStatus(req.params.id);
      return res.json(result);
    }
    const result = await SbpPaymentService.getPaymentStatus(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  СБП — Callback (Webhook) от кассы
// ═══════════════════════════════════════════════════════════════════════════

router.post('/sbp/callback', express.json(), async (req, res) => {
  try {
    // Проверяем подпись
    const signature = req.headers['x-webhook-signature'] || req.headers['x-signature'] || '';
    const rawBody   = JSON.stringify(req.body);

    if (!SbpPaymentService.verifyWebhookSignature(rawBody, signature)) {
      console.error('[SBP] Невалидная подпись webhook');
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const result = await SbpPaymentService.handleCallback(req.body);
    res.json(result);
  } catch (err) {
    console.error('[SBP] Callback error:', err);
    res.json({ ok: true }); // Отвечаем 200 чтобы касса не повторяла
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  Sberbank Acquiring — Callback (GET / POST)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/sberbank/callback', async (req, res) => {
  try {
    await SbpPaymentService.handleCallback(req.query);
  } catch (err) {
    console.error('[Sberbank] GET callback error:', err);
  }
  res.send('OK');
});

router.post('/sberbank/callback', express.json(), async (req, res) => {
  try {
    const payload = { ...req.body, ...req.query };
    await SbpPaymentService.handleCallback(payload);
  } catch (err) {
    console.error('[Sberbank] POST callback error:', err);
  }
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Получить рублёвые цены для планов
// ═══════════════════════════════════════════════════════════════════════════

router.get('/sbp/prices', async (req, res) => {
  if (config.yookassa.enabled) return res.json(YooKassaService.RUB_PRICES);
  res.json(SbpPaymentService.RUB_PRICES);
});

// ═══════════════════════════════════════════════════════════════════════════
//  YooKassa — Проверить статус платежа подписки (polling fallback)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/yookassa/:paymentId/status', ALL, async (req, res) => {
  try {
    if (!config.yookassa.enabled) return res.status(400).json({ error: 'ЮKassa не настроена' });

    const result = await YooKassaService.getPaymentStatus(req.params.paymentId);

    if (result.status === 'succeeded' && result.paid && result.metadata?.type === 'subscription') {
      const userId        = result.metadata.user_id;
      const planId        = result.metadata.plan_id;
      const billingPeriod = result.metadata.billing_period || 'monthly';

      if (userId === req.userId) {
        const existing = await db.getTransactionByExternalId(result.id);
        if (!existing) {
          await SubscriptionService.activatePlan(userId, planId, billingPeriod, { paymentMethod: 'yookassa' });
          logger.info('YooKassa: подписка активирована (polling)', {
            userId, planId, billingPeriod, paymentId: result.id,
          });
        }
      }
    }

    res.json({ status: result.status, paid: result.paid, amount: result.amount });
  } catch (err) {
    logger.error('YooKassa payment status error', { err: err.message });
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!config.stripe.enabled) {
    return res.status(400).json({ error: 'Stripe не настроен' });
  }

  let stripe;
  try {
    stripe = require('stripe')(config.stripe.secretKey);
  } catch (_) {
    return res.status(500).json({ error: 'Stripe не установлен' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`[Stripe] Event: ${event.type}`);

  try {
    switch (event.type) {

      // Успешная оплата Checkout (первая подписка)
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription') {
          const userId = session.metadata?.user_id;
          if (userId) {
            await SubscriptionService.handleCheckoutCompleted(userId, session);
          }
        }
        break;
      }

      // Успешный платёж (renewal)
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const sub     = invoice.subscription;
        if (sub) {
          const dbSub = await db.getSubscriptionByStripeId(sub);
          if (dbSub) {
            await db.updateSubscription(dbSub.id, { status: 'active' });
            await db.createTransaction({
              userId:          dbSub.user_id,
              subscriptionId:  dbSub.id,
              amount:          invoice.amount_paid / 100,
              currency:        invoice.currency.toUpperCase(),
              status:          'completed',
              externalId:      invoice.id,
              metadata:        { stripe_invoice_id: invoice.id },
            });
            await db.updateTransactionStatus(invoice.id, 'completed');
          }
        }
        break;
      }

      // Неуспешный платёж
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const dbSub = await db.getSubscriptionByStripeId(invoice.subscription);
          if (dbSub) {
            await db.updateSubscription(dbSub.id, { status: 'past_due' });
          }
        }
        break;
      }

      // Подписка отменена
      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object;
        const dbSub = await db.getSubscriptionByStripeId(stripeSub.id);
        if (dbSub) {
          await db.updateSubscription(dbSub.id, {
            status:       'cancelled',
            cancelled_at: new Date().toISOString(),
          });
        }
        break;
      }

      // Подписка обновлена (смена плана, дата окончания)
      case 'customer.subscription.updated': {
        const stripeSub = event.data.object;
        const dbSub = await db.getSubscriptionByStripeId(stripeSub.id);
        if (dbSub) {
          const expiresAt = stripeSub.current_period_end
            ? new Date(stripeSub.current_period_end * 1000).toISOString()
            : null;
          await db.updateSubscription(dbSub.id, {
            status:     stripeSub.status === 'active' ? 'active' : stripeSub.status,
            expires_at: expiresAt,
          });
        }
        break;
      }

      default:
        // Игнорируем неизвестные события
        break;
    }
  } catch (err) {
    console.error('[Stripe] Handler error:', err);
    // Возвращаем 200 чтобы Stripe не повторял событие
  }

  res.json({ received: true });
});

module.exports = router;
