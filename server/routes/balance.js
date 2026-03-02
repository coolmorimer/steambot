'use strict';

const express = require('express');
const https   = require('https');
const db      = require('../db');
const config  = require('../config');
const logger  = require('../logger');
const { requireAuth, requireActiveUser } = require('../middleware/auth');

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

/* ═══════ DEPOSIT (placeholder — will be linked to payment gateway) ═══════ */

router.post('/deposit', requireAuth, requireActiveUser, async (req, res) => {
  try {
    const { amount } = req.body; // в рублях
    if (!amount || amount < 100) return res.status(400).json({ error: 'Минимальная сумма пополнения: 100₽' });
    if (amount > 100000) return res.status(400).json({ error: 'Максимальная сумма: 100 000₽' });

    const amountKopecks = Math.round(amount * 100);

    // For now: manual deposit (admin can approve)
    // When ЮKassa is ready, this will create a payment
    const newBalance = await db.updateUserBalance(req.userId, amountKopecks);
    await db.createBalanceTransaction({
      userId: req.userId, type: 'deposit', amount: amountKopecks,
      balanceAfter: newBalance,
      description: `Пополнение баланса: ${amount}₽`,
    });

    logger.info('Пополнение баланса', { userId: req.userId, amount: amountKopecks });
    res.json({ ok: true, balance: newBalance });
  } catch (err) {
    logger.error('deposit error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ═══════ WITHDRAW REQUEST ═══════ */

router.post('/withdraw', requireAuth, requireActiveUser, async (req, res) => {
  try {
    const { amount, method, details } = req.body; // amount в рублях
    if (!amount || amount < 500) return res.status(400).json({ error: 'Минимальная сумма вывода: 500₽' });

    const amountKopecks = Math.round(amount * 100);
    const balance = await db.getUserBalance(req.userId);
    if (balance < amountKopecks) return res.status(400).json({ error: 'Недостаточно средств' });

    // Freeze amount
    const newBalance = await db.updateUserBalance(req.userId, -amountKopecks);
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
