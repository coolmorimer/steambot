'use strict';

/**
 * server/services/YooKassaService.js
 *
 * Интеграция с YooKassa (ЮKassa) для пополнения баланса и оплаты подписок.
 * Документация: https://yookassa.ru/developers/api
 */

const https  = require('https');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');
const db     = require('../db');

const API_URL = 'https://api.yookassa.ru/v3';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_URL}${path}`);
    const auth = Buffer.from(`${config.yookassa.shopId}:${config.yookassa.secretKey}`).toString('base64');
    const idempotenceKey = crypto.randomUUID();

    const options = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Idempotence-Key': idempotenceKey,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            logger.error('YooKassa API error', { status: res.statusCode, body: parsed });
            reject(new Error(parsed?.description || `YooKassa error ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`YooKassa: invalid JSON response: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('YooKassa timeout')); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Создать платёж для пополнения баланса ────────────────────────────────────

async function createPayment({ userId, amountRub, description, returnUrl }) {
  if (!config.yookassa.enabled) throw new Error('YooKassa не настроена');

  const payment = await makeRequest('POST', '/payments', {
    amount: {
      value: amountRub.toFixed(2),
      currency: 'RUB',
    },
    capture: true, // автоматическое подтверждение
    confirmation: {
      type: 'redirect',
      return_url: returnUrl || `${config.appUrl}/balance`,
    },
    description: description || `Пополнение баланса: ${amountRub}₽`,
    metadata: {
      user_id: userId,
      type: 'balance_deposit',
      amount_kopecks: Math.round(amountRub * 100),
    },
  });

  logger.info('YooKassa: платёж создан', {
    paymentId: payment.id,
    userId,
    amount: amountRub,
    status: payment.status,
  });

  return {
    paymentId:       payment.id,
    status:          payment.status,
    confirmationUrl: payment.confirmation?.confirmation_url,
    amount:          amountRub,
    provider:        'yookassa',
  };
}

// ── Рублёвые цены подписок ──────────────────────────────────────────────────

const RUB_PRICES = {
  free:       { monthly: 0,    yearly: 0 },
  starter:    { monthly: 490,  yearly: 4990 },
  pro:        { monthly: 1490, yearly: 14990 },
  enterprise: { monthly: 4990, yearly: 49990 },
};

function getPriceRub(planId, billingPeriod) {
  const p = RUB_PRICES[planId];
  if (!p) return 0;
  return billingPeriod === 'yearly' ? p.yearly : p.monthly;
}

// ── Создать платёж для оплаты подписки ──────────────────────────────────────

async function createSubscriptionPayment({ userId, planId, billingPeriod = 'monthly', returnUrl }) {
  if (!config.yookassa.enabled) throw new Error('YooKassa не настроена');

  const plan = await db.getPlan(planId);
  if (!plan) throw new Error('Тарифный план не найден');

  const amountRub = getPriceRub(planId, billingPeriod);
  if (amountRub <= 0) throw new Error('Этот план не требует оплаты');

  const user = await db.getUserById(userId);
  if (!user) throw new Error('Пользователь не найден');

  const description = `Steam Poster Bot — ${plan.name} (${billingPeriod === 'yearly' ? '12 мес.' : '1 мес.'})`;
  const successUrl  = returnUrl || `${config.appUrl}/subscription?payment=success`;

  const payment = await makeRequest('POST', '/payments', {
    amount: {
      value: amountRub.toFixed(2),
      currency: 'RUB',
    },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: successUrl,
    },
    description,
    metadata: {
      user_id:        userId,
      type:           'subscription',
      plan_id:        planId,
      billing_period: billingPeriod,
      amount_kopecks: Math.round(amountRub * 100),
    },
  });

  logger.info('YooKassa: платёж подписки создан', {
    paymentId: payment.id, userId, planId, billingPeriod, amount: amountRub,
  });

  return {
    paymentId:       payment.id,
    status:          payment.status,
    confirmationUrl: payment.confirmation?.confirmation_url,
    formUrl:         payment.confirmation?.confirmation_url, // совместимость со Sberbank API
    amount:          amountRub,
    description:     billingPeriod === 'yearly' ? '12 месяцев' : '1 месяц',
    provider:        'yookassa',
  };
}

// ── Проверить статус платежа ─────────────────────────────────────────────────

async function getPaymentStatus(paymentId) {
  const payment = await makeRequest('GET', `/payments/${paymentId}`);
  return {
    id:       payment.id,
    status:   payment.status,        // pending | waiting_for_capture | succeeded | canceled
    paid:     payment.paid,
    amount:   parseFloat(payment.amount?.value || 0),
    metadata: payment.metadata || {},
  };
}

// ── Обработать webhook от YooKassa ──────────────────────────────────────────

function parseWebhookPayload(body) {
  // YooKassa шлёт JSON с event + object
  if (!body || !body.event || !body.object) return null;

  return {
    event:     body.event,     // payment.succeeded | payment.canceled | ...
    paymentId: body.object.id,
    status:    body.object.status,
    paid:      body.object.paid,
    amount:    parseFloat(body.object.amount?.value || 0),
    metadata:  body.object.metadata || {},
  };
}

module.exports = {
  createPayment,
  createSubscriptionPayment,
  getPaymentStatus,
  parseWebhookPayload,
  getPriceRub,
  RUB_PRICES,
};
