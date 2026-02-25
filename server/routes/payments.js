'use strict';

/**
 * server/routes/payments.js
 *
 * POST /api/payments/webhook  — Stripe webhook (raw body!)
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

const router  = express.Router();

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
          const dbSub = db.getSubscriptionByStripeId(sub);
          if (dbSub) {
            db.updateSubscription(dbSub.id, { status: 'active' });
            db.createTransaction({
              userId:          dbSub.user_id,
              subscriptionId:  dbSub.id,
              amount:          invoice.amount_paid / 100,
              currency:        invoice.currency.toUpperCase(),
              status:          'completed',
              externalId:      invoice.id,
              metadata:        { stripe_invoice_id: invoice.id },
            });
            db.updateTransactionStatus(invoice.id, 'completed');
          }
        }
        break;
      }

      // Неуспешный платёж
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const dbSub = db.getSubscriptionByStripeId(invoice.subscription);
          if (dbSub) {
            db.updateSubscription(dbSub.id, { status: 'past_due' });
          }
        }
        break;
      }

      // Подписка отменена
      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object;
        const dbSub = db.getSubscriptionByStripeId(stripeSub.id);
        if (dbSub) {
          db.updateSubscription(dbSub.id, {
            status:       'cancelled',
            cancelled_at: new Date().toISOString(),
          });
        }
        break;
      }

      // Подписка обновлена (смена плана, дата окончания)
      case 'customer.subscription.updated': {
        const stripeSub = event.data.object;
        const dbSub = db.getSubscriptionByStripeId(stripeSub.id);
        if (dbSub) {
          const expiresAt = stripeSub.current_period_end
            ? new Date(stripeSub.current_period_end * 1000).toISOString()
            : null;
          db.updateSubscription(dbSub.id, {
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
