'use strict';

const express = require('express');
const db      = require('../db');
const { requireAuth, requireActiveUser } = require('../middleware/auth');
const TelegramBotManager = require('../services/TelegramBotManager');

const router = express.Router();
const ALL    = [requireAuth, requireActiveUser];

/**
 * GET /api/telegram — информация о привязке Telegram для текущего пользователя
 */
router.get('/', ALL, async (req, res, next) => {
  try {
    const user = await db.getUserById(req.userId);
    const botUsername = await db.getServerSetting('TG_BOT_USERNAME');
    res.json({
      telegram_chat_id:  user.telegram_chat_id || null,
      tg_notify_errors:  !!user.tg_notify_errors,
      tg_notify_success: !!user.tg_notify_success,
      tg_notify_expired: !!user.tg_notify_expired,
      bot_username:      botUsername || null,
      bot_running:       TelegramBotManager.isRunning(),
    });
  } catch (e) { next(e); }
});

/**
 * PUT /api/telegram — обновить настройки уведомлений
 */
router.put('/', ALL, async (req, res, next) => {
  try {
    const { tg_notify_errors, tg_notify_success, tg_notify_expired } = req.body;
    const updates = {};
    if (tg_notify_errors  !== undefined) updates.tg_notify_errors  = tg_notify_errors  ? 1 : 0;
    if (tg_notify_success !== undefined) updates.tg_notify_success = tg_notify_success ? 1 : 0;
    if (tg_notify_expired !== undefined) updates.tg_notify_expired = tg_notify_expired ? 1 : 0;

    await db.updateUser(req.userId, updates);
    await db.auditLog(req.userId, 'telegram.update_prefs', 'user', req.userId);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/**
 * POST /api/telegram/link — генерация кода привязки
 */
router.post('/link', ALL, async (req, res, next) => {
  try {
    const botUsername = await db.getServerSetting('TG_BOT_USERNAME');
    if (!botUsername) return res.status(400).json({ error: 'Telegram-бот не настроен администратором' });

    const code = await db.createTelegramLinkCode(req.userId);
    const link = `https://t.me/${botUsername}?start=${code}`;
    res.json({ code, link, bot_username: botUsername });
  } catch (e) { next(e); }
});

/**
 * DELETE /api/telegram — отвязать Telegram
 */
router.delete('/', ALL, async (req, res, next) => {
  try {
    await db.updateUser(req.userId, { telegram_chat_id: null });
    await db.auditLog(req.userId, 'telegram.unlink', 'user', req.userId);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/**
 * POST /api/telegram/test — тестовое уведомление
 */
router.post('/test', ALL, async (req, res, next) => {
  try {
    if (!TelegramBotManager.isRunning())
      return res.status(400).json({ error: 'Telegram-бот не запущен' });
    const user = await db.getUserById(req.userId);
    if (!user?.telegram_chat_id)
      return res.status(400).json({ error: 'Telegram не привязан' });
    await TelegramBotManager.sendNotification(req.userId, '✅ Тестовое сообщение от Steam Poster Bot!');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;