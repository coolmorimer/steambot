'use strict';

const express  = require('express');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const { requireAuth, requireActiveUser } = require('../middleware/auth');
const { loadSubscription }               = require('../middleware/subscription');
const SteamBotManager = require('../services/SteamBotManager');
const config  = require('../config');
const db      = require('../db');

const router = express.Router();
const ALL    = [requireAuth, requireActiveUser, loadSubscription];

router.get('/status', ALL, async (req, res) => {
  res.json(await SteamBotManager.getStatus(req.userId));
});

router.post('/start', ALL, (req, res) => {
  SteamBotManager.start(req.userId);
  res.json({ ok: true });
});

router.post('/stop', ALL, (req, res) => {
  SteamBotManager.stop(req.userId);
  res.json({ ok: true });
});

router.post('/miniapp/auth', async (req, res) => {
  try {
    const { init_data } = req.body;
    if (!init_data) return res.status(400).json({ error: 'init_data обязателен' });

    const params = new URLSearchParams(init_data);
    const hash   = params.get('hash');
    if (!hash) return res.status(401).json({ error: 'hash отсутствует' });

    params.delete('hash');
    const dataCheckStr = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const userField = params.get('user');
    if (!userField) return res.status(401).json({ error: 'Нет данных пользователя' });

    let tgUser;
    try { tgUser = JSON.parse(userField); } catch { return res.status(401).json({ error: 'Некорректные данные' }); }

    const tgId = String(tgUser.id);

    // Shared bot — validate signature with the single bot token
    const botToken = await db.getServerSetting('TG_BOT_TOKEN');
    if (!botToken) return res.status(401).json({ error: 'Telegram-бот не настроен' });

    const secretKey    = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckStr).digest('hex');
    if (expectedHash !== hash) return res.status(401).json({ error: 'Подпись неверна' });

    // Lookup user by telegram_chat_id
    const user = await db.getUserByTelegramChatId(tgId);
    if (!user || !user.is_active) return res.status(403).json({ error: 'Аккаунт недоступен' });

    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      config.jwt.secret, { algorithm: 'HS256', expiresIn: '24h' }
    );

    const sub = await db.getActiveSubscription(user.id);
    res.json({
      access_token: accessToken,
      user: { id: user.id, email: user.email, name: user.name },
      subscription: sub ? { plan_id: sub.plan_id, plan_name: sub.plan_name, status: sub.status } : null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
