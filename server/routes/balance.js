'use strict';

const express = require('express');
const https   = require('https');
const db      = require('../db');
const config  = require('../config');
const logger  = require('../logger');
const { requireAuth, requireActiveUser } = require('../middleware/auth');
const YooKassaService     = require('../services/YooKassaService');
const SubscriptionService = require('../services/SubscriptionService');

const router = express.Router();

/* ═══════ GET BALANCE + RECENT TRANSACTIONS ═══════ */

router.get('/', requireAuth, async (req, res) => {
  try {
    const [balance, transactions] = await Promise.all([
      db.getUserBalance(req.userId),
      db.getBalanceTransactions(req.userId, 50),
    ]);
    res.json({ balance, transactions });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ═══════ DEPOSIT ═══════ */

router.post('/deposit', requireAuth, requireActiveUser, async (req, res) => {
  try {
    const { amount } = req.body; // в рублях
    if (!amount || amount < 100) return res.status(400).json({ error: 'Минимальная сумма пополнения: 100₽' });
    if (amount > 100000) return res.status(400).json({ error: 'Максимальная сумма: 100 000₽' });

    // ── ЮKassa: создаём платёж и возвращаем URL для оплаты ──
    if (config.yookassa.enabled) {
      const result = await YooKassaService.createPayment({
        userId: req.userId,
        amountRub: parseFloat(amount),
        returnUrl: `${config.appUrl}/balance`,
      });
      return res.json({
        ok: true,
        paymentUrl: result.confirmationUrl,
        paymentId:  result.paymentId,
      });
    }

    // Fallback: прямое начисление (без платёжной системы)
    const amountKopecks = Math.round(amount * 100);
    const newBalance = await db.updateUserBalance(req.userId, amountKopecks);
    await db.createBalanceTransaction({
      userId: req.userId, type: 'deposit', amount: amountKopecks,
      balanceAfter: newBalance,
      description: `Пополнение баланса: ${amount}₽`,
    });

    logger.info('Пополнение баланса (прямое)', { userId: req.userId, amount: amountKopecks });
    res.json({ ok: true, balance: newBalance });
  } catch (err) {
    logger.error('deposit error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ═══════ YOOKASSA UNIFIED WEBHOOK (баланс + подписки) ═══════ */

router.post('/yookassa/webhook', express.json(), async (req, res) => {
  try {
    const payload = YooKassaService.parseWebhookPayload(req.body);
    if (!payload) return res.status(400).json({ error: 'Invalid payload' });

    const paymentType = payload.metadata?.type || 'unknown';
    logger.info('YooKassa webhook', {
      event: payload.event, paymentId: payload.paymentId,
      status: payload.status, type: paymentType,
    });

    // ── payment.succeeded ─────────────────────────────────────────────
    if (payload.event === 'payment.succeeded' && payload.paid) {
      const userId = payload.metadata?.user_id;
      if (!userId) {
        logger.warn('YooKassa webhook: нет user_id в metadata', { paymentId: payload.paymentId });
        return res.json({ ok: true });
      }

      // Verify payment via YooKassa API (protect against forged webhooks)
      let verifiedPayment;
      try {
        verifiedPayment = await YooKassaService.getPaymentStatus(payload.paymentId);
        if (!verifiedPayment || verifiedPayment.status !== 'succeeded' || !verifiedPayment.paid) {
          logger.warn('YooKassa webhook: payment not confirmed by API', { paymentId: payload.paymentId });
          return res.json({ ok: true });
        }
      } catch (verifyErr) {
        logger.error('YooKassa webhook: verification API call failed', { err: verifyErr.message, paymentId: payload.paymentId });
        return res.status(500).json({ error: 'Verification failed' });
      }

      // --- Подписка ---
      if (paymentType === 'subscription') {
        const planId        = payload.metadata.plan_id;
        const billingPeriod = payload.metadata.billing_period || 'monthly';

        if (!planId) {
          logger.warn('YooKassa webhook: нет plan_id в metadata', { paymentId: payload.paymentId });
          return res.json({ ok: true });
        }

        const existing = await db.getTransactionByExternalId(payload.paymentId);
        if (existing) {
          logger.info('YooKassa: подписка уже обработана', { paymentId: payload.paymentId });
          return res.json({ ok: true });
        }

        await SubscriptionService.activatePlan(userId, planId, billingPeriod, { paymentMethod: 'yookassa' });
        logger.info('YooKassa: подписка активирована', {
          userId, planId, billingPeriod, paymentId: payload.paymentId,
        });
        return res.json({ ok: true });
      }

      // --- Пополнение баланса (default) ---
      const rawKopecks = payload.metadata?.amount_kopecks
        ? parseInt(payload.metadata.amount_kopecks)
        : Math.round(payload.amount * 100);

      // Комиссия сервиса 1%
      const SERVICE_FEE = 0.01;
      const feeKopecks    = Math.ceil(rawKopecks * SERVICE_FEE);
      const amountKopecks = rawKopecks - feeKopecks;

      const txList = await db.getBalanceTransactions(userId, 200);
      const alreadyProcessed = txList.some(t => t.description?.includes(payload.paymentId));
      if (alreadyProcessed) {
        logger.info('YooKassa: баланс уже зачислен', { paymentId: payload.paymentId });
        return res.json({ ok: true });
      }

      const newBalance = await db.updateUserBalance(userId, amountKopecks);
      await db.createBalanceTransaction({
        userId, type: 'deposit', amount: amountKopecks,
        balanceAfter: newBalance,
        description: `Пополнение через ЮKassa (${payload.paymentId})`,
      });

      logger.info('YooKassa: баланс пополнен', {
        userId, amountKopecks, paymentId: payload.paymentId, newBalance,
      });
      return res.json({ ok: true });
    }

    // ── payment.canceled ──────────────────────────────────────────────
    if (payload.event === 'payment.canceled') {
      logger.info('YooKassa: платёж отменён', {
        paymentId: payload.paymentId, type: paymentType,
      });
      return res.json({ ok: true });
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error('YooKassa webhook error', { err: err.message });
    res.json({ ok: true }); // Отвечаем 200 чтобы ЮKassa не повторяла
  }
});

/* ═══════ CHECK PAYMENT STATUS (polling fallback) ═══════ */

router.get('/payment/:paymentId/status', requireAuth, async (req, res) => {
  try {
    if (!config.yookassa.enabled) return res.status(400).json({ error: 'ЮKassa не настроена' });

    const result = await YooKassaService.getPaymentStatus(req.params.paymentId);

    // Если платёж успешен — зачисляем (на случай если webhook не дошёл)
    if (result.status === 'succeeded' && result.paid) {
      const userId = result.metadata?.user_id;
      const amountKopecks = result.metadata?.amount_kopecks
        ? parseInt(result.metadata.amount_kopecks)
        : Math.round(result.amount * 100);

      if (userId === req.userId) {
        const existing = await db.getBalanceTransactions(userId, 200);
        const alreadyProcessed = existing.some(t => t.description?.includes(result.id));
        if (!alreadyProcessed) {
          // Комиссия сервиса 1%
          const feeKopecks  = Math.ceil(amountKopecks * 0.01);
          const credited    = amountKopecks - feeKopecks;
          const newBalance = await db.updateUserBalance(userId, credited);
          await db.createBalanceTransaction({
            userId, type: 'deposit', amount: credited,
            balanceAfter: newBalance,
            description: `Пополнение через ЮKassa (${result.id})`,
          });
          logger.info('YooKassa: баланс пополнен (polling)', { userId, credited, fee: feeKopecks, paymentId: result.id });
        }
      }
    }

    res.json({ status: result.status, paid: result.paid, amount: result.amount });
  } catch (err) {
    logger.error('payment status error', { err: err.message });
    res.status(500).json({ error: 'Ошибка' });
  }
});

/* ═══════ WITHDRAW REQUEST ═══════ */

router.post('/withdraw', requireAuth, requireActiveUser, async (req, res) => {
  try {
    const { amount, method, details } = req.body; // amount в рублях
    if (!amount || amount < 500) return res.status(400).json({ error: 'Минимальная сумма вывода: 500₽' });

    const amountKopecks = Math.round(amount * 100);

    // Atomic deduction — prevents race condition (double-spend)
    const result = await db.safeDeductBalance(req.userId, amountKopecks);
    if (!result.success) return res.status(400).json({ error: 'Недостаточно средств' });

    const newBalance = result.balance;
    await db.createBalanceTransaction({
      userId: req.userId, type: 'withdrawal', amount: -amountKopecks,
      balanceAfter: newBalance,
      description: `Заявка на вывод: ${amount}₽`,
      status: 'pending',
    });

    const id = await db.createWithdrawalRequest({
      userId: req.userId, amount: amountKopecks,
      method: method || 'card', details: details || {},
    });

    logger.info('Заявка на вывод', { id, userId: req.userId, amount: amountKopecks });
    res.status(201).json({ ok: true, id, balance: newBalance });
  } catch (err) {
    logger.error('withdraw error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ═══════ MY WITHDRAWAL REQUESTS ═══════ */

router.get('/withdrawals', requireAuth, async (req, res) => {
  try {
    const items = await db.getWithdrawalRequests(req.userId);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ═══════ UPDATE TRADE URL + AUTO-LINK STEAM ═══════ */

router.put('/trade-url', requireAuth, async (req, res) => {
  try {
    const { trade_url } = req.body;
    if (!trade_url) return res.status(400).json({ error: 'Укажите Trade URL' });

    // Validate Steam trade URL format
    const urlMatch = trade_url.match(/^https?:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=(\d+)&token=([a-zA-Z0-9_-]+)$/);
    if (!urlMatch) {
      return res.status(400).json({ error: 'Неверный формат Steam Trade URL' });
    }

    const partnerId = parseInt(urlMatch[1]);
    // Convert 32-bit partner ID to 64-bit SteamID
    const steamId = String(BigInt(partnerId) + 76561197960265728n);

    // Check if this Steam ID is already linked to another account
    const existingSteamUser = await db.getUserBySteamId(steamId);
    if (existingSteamUser && existingSteamUser.id !== req.userId) {
      return res.status(400).json({ error: 'Этот Steam аккаунт уже привязан к другому пользователю' });
    }

    // Fetch Steam profile
    let steamUsername = `Steam_${steamId.slice(-6)}`;
    let steamAvatar   = '';
    if (config.steam.apiKey) {
      try {
        const profileData = await fetchSteamProfile(steamId);
        const player = profileData?.response?.players?.[0];
        if (player) {
          steamUsername = player.personaname || steamUsername;
          steamAvatar   = player.avatarfull || player.avatar || '';
        }
      } catch (e) {
        logger.warn('Steam profile fetch failed', { steamId, err: e.message });
      }
    }

    // Update user: trade_url + steam_id + profile
    await db.updateUser(req.userId, {
      trade_url,
      steam_id: steamId,
      steam_username: steamUsername,
      steam_avatar: steamAvatar,
    });

    logger.info('Steam привязан через Trade URL', { userId: req.userId, steamId, name: steamUsername });
    res.json({ ok: true, steam_id: steamId, steam_username: steamUsername, steam_avatar: steamAvatar });
  } catch (err) {
    logger.error('trade-url link error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/** Fetch Steam profile JSON */
function fetchSteamProfile(steamId) {
  const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${config.steam.apiKey}&steamids=${steamId}`;
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (hres) => {
      let body = '';
      hres.on('data', c => body += c);
      hres.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    }).on('error', reject);
  });
}

/* ═══════ GET MY PROFILE (public market info) ═══════ */

router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = req.dbUser;
    res.json({
      id: user.id,
      name: user.name,
      steam_id: user.steam_id,
      steam_username: user.steam_username,
      steam_avatar: user.steam_avatar,
      trade_url: user.trade_url,
      balance: user.balance || 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
