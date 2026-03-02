'use strict';

/**
 * server/services/SbpPaymentService.js
 *
 * Интеграция с интернет-эквайрингом Сбербанка.
 * Поддерживает оплату банковскими картами (Visa/MC/МИР), SberPay и СБП.
 *
 * API: https://securepayments.sberbank.ru/payment/rest/
 * Документация: https://developer.sberbank.ru/doc/v1/acquiring
 */

const crypto = require('crypto');
const db     = require('../db');
const config = require('../config');

// ═══════════════════════════════════════════════════════════════════════════
//  ТАРИФНЫЕ ЦЕНЫ В РУБЛЯХ
// ═══════════════════════════════════════════════════════════════════════════
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


// ═══════════════════════════════════════════════════════════════════════════
//  SBERBANK ACQUIRING API HELPER
// ═══════════════════════════════════════════════════════════════════════════

async function sberbankRequest(endpoint, params) {
  const apiUrl = config.sberbank?.apiUrl || 'https://securepayments.sberbank.ru/payment/rest';
  const token  = config.sberbank?.token;

  if (!token) throw new Error('Sberbank API token не настроен');

  const body = new URLSearchParams({ token, ...params });

  console.log(`[Sberbank] → ${endpoint}`);

  const response = await fetch(`${apiUrl}/${endpoint}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  const data = await response.json();

  if (data.errorCode && String(data.errorCode) !== '0') {
    console.error(`[Sberbank] ← ${endpoint} ERROR:`, JSON.stringify(data));
    throw new Error(`Sberbank: ${data.errorMessage || 'Неизвестная ошибка'} (code: ${data.errorCode})`);
  }

  console.log(`[Sberbank] ← ${endpoint} OK`);
  return data;
}


// ═══════════════════════════════════════════════════════════════════════════
//  СОЗДАНИЕ ПЛАТЕЖА
// ═══════════════════════════════════════════════════════════════════════════

async function createPayment({ userId, planId, billingPeriod = 'monthly', returnUrl }) {
  const plan = await db.getPlan(planId);
  if (!plan) throw new Error('Тарифный план не найден');

  const amount = getPriceRub(planId, billingPeriod);
  if (amount <= 0) throw new Error('Этот план не требует оплаты');

  const user = await db.getUserById(userId);
  if (!user) throw new Error('Пользователь не найден');

  const paymentId   = crypto.randomUUID();
  const orderNumber = `SPB_${Date.now()}_${paymentId.slice(0, 8)}`;
  const amountKop   = Math.round(amount * 100); // Sberbank принимает в копейках
  const description = `Steam Poster Bot — ${plan.name} (${billingPeriod === 'yearly' ? '12 мес.' : '1 мес.'})`;
  const successUrl  = returnUrl || `${config.appUrl}/subscription?payment=success`;

  // Регистрируем заказ в Sberbank Acquiring
  const sbData = await sberbankRequest('register.do', {
    orderNumber,
    amount:             String(amountKop),
    returnUrl:          successUrl,
    failUrl:            `${config.appUrl}/subscription?payment=failed`,
    description,
    sessionTimeoutSecs: '1200', // 20 минут на оплату
    jsonParams: JSON.stringify({
      user_id:        userId,
      plan_id:        planId,
      billing_period: billingPeriod,
    }),
  });

  // sbData = { orderId: "sberbank-uuid", formUrl: "https://securepayments.sberbank.ru/..." }
  const externalId      = sbData.orderId;
  const confirmationUrl = sbData.formUrl;

  // Сохраняем pending-транзакцию в БД
  await db.createTransaction({
    userId,
    subscriptionId: null,
    amount,
    currency:       'RUB',
    status:         'pending',
    planId,
    billingPeriod,
    paymentMethod:  'sberbank',
    externalId,
    metadata: {
      order_number: orderNumber,
      return_url:   successUrl,
      plan_name:    plan.name,
      description,
    },
  });

  return {
    paymentId:       externalId,
    orderId:         orderNumber,
    confirmationUrl,
    amount,
    currency:        'RUB',
    status:          'pending',
    description,
  };
}


// ═══════════════════════════════════════════════════════════════════════════
//  ПРОВЕРКА СТАТУСА ПЛАТЕЖА (polling)
// ═══════════════════════════════════════════════════════════════════════════

async function getPaymentStatus(externalId) {
  const tx = await db.getTransactionByExternalId(externalId).catch(() => null);

  // Уже завершён — сразу возвращаем
  if (tx && tx.status !== 'pending') {
    return {
      status:      tx.status === 'completed' ? 'succeeded' : tx.status,
      paid:        tx.status === 'completed',
      amount:      Number(tx.amount),
      captured_at: tx.updated_at || tx.created_at,
    };
  }

  // Запрашиваем актуальный статус у Sberbank
  if (config.sberbank?.token) {
    try {
      const data = await sberbankRequest('getOrderStatusExtended.do', {
        orderId: externalId,
      });

      // orderStatus: 0=зарегистрирован, 1=предавторизация, 2=полная оплата,
      //              3=авторизация отменена, 4=возврат, 5=ACS, 6=отклонён
      if (data.orderStatus === 2 && tx && tx.status === 'pending') {
        // Оплата прошла — активируем подписку
        const SubscriptionService = require('./SubscriptionService');
        const result = await SubscriptionService.activatePlan(
          tx.user_id, tx.plan_id, tx.billing_period, { skipTransaction: true }
        );
        await db.updateTransactionStatus(externalId, 'completed');
        if (result.subscription_id) {
          await db.updateTransaction(tx.id, { subscription_id: result.subscription_id });
        }

        console.log(`[Sberbank] Оплата подтверждена (poll): user=${tx.user_id} plan=${tx.plan_id}`);
        return {
          status: 'succeeded', paid: true,
          amount: Number(tx.amount), captured_at: new Date().toISOString(),
        };
      }

      if ([3, 4, 6].includes(data.orderStatus)) {
        if (tx) await db.updateTransactionStatus(externalId, 'failed');
        return {
          status: 'failed', paid: false,
          amount: tx ? Number(tx.amount) : 0, captured_at: null,
        };
      }

      return {
        status: 'pending', paid: false,
        amount: tx ? Number(tx.amount) : 0, captured_at: null,
      };
    } catch (err) {
      console.error('[Sberbank] Ошибка проверки статуса:', err.message);
    }
  }

  return {
    status:      tx ? tx.status : 'pending',
    paid:        false,
    amount:      tx ? Number(tx.amount) : 0,
    captured_at: null,
  };
}


// ═══════════════════════════════════════════════════════════════════════════
//  CALLBACK ОТ SBERBANK
// ═══════════════════════════════════════════════════════════════════════════

async function handleCallback(payload) {
  const orderId     = payload.mdOrder || payload.orderId;
  const orderNumber = payload.orderNumber;
  const operation   = payload.operation;
  const status      = payload.status;

  if (!orderId) {
    console.warn('[Sberbank] Callback без orderId/mdOrder');
    return { ok: false };
  }

  console.log(`[Sberbank] Callback: orderId=${orderId} operation=${operation} status=${status}`);

  // Верифицируем реальный статус через API Sberbank
  if (config.sberbank?.token) {
    try {
      const data = await sberbankRequest('getOrderStatusExtended.do', { orderId });
      const tx   = await db.getTransactionByExternalId(orderId).catch(() => null);

      if (data.orderStatus === 2 && tx && tx.status === 'pending') {
        // Оплата прошла — активируем подписку
        const SubscriptionService = require('./SubscriptionService');
        const result = await SubscriptionService.activatePlan(
          tx.user_id, tx.plan_id, tx.billing_period, { skipTransaction: true }
        );
        await db.updateTransactionStatus(orderId, 'completed');
        if (result.subscription_id) {
          await db.updateTransaction(tx.id, { subscription_id: result.subscription_id });
        }

        console.log(`[Sberbank] Подписка активирована (callback): user=${tx.user_id} plan=${tx.plan_id}`);
        return { ok: true };
      }

      if ([3, 4, 6].includes(data.orderStatus) && tx && tx.status === 'pending') {
        await db.updateTransactionStatus(orderId, 'failed');
        console.log(`[Sberbank] Платёж отклонён: orderId=${orderId}`);
        return { ok: true };
      }
    } catch (err) {
      console.error('[Sberbank] Callback error:', err.message);
    }
  }

  return { ok: true };
}


// Sberbank верифицирует callback через getOrderStatusExtended.do, а не подписью
function verifyWebhookSignature() {
  return true;
}


module.exports = {
  createPayment,
  getPaymentStatus,
  handleCallback,
  verifyWebhookSignature,
  getPriceRub,
  RUB_PRICES,
};
