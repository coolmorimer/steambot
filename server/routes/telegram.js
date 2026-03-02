'use strict';

const express = require('express');
const db      = require('../db');
const { requireAuth, requireActiveUser } = require('../middleware/auth');
const { checkLimit }        = require('../middleware/subscription');
const TelegramBotManager    = require('../services/TelegramBotManager');
const SteamBotManager       = require('../services/SteamBotManager');

const router = express.Router();
const ALL    = [requireAuth, requireActiveUser];

router.get('/', ALL, async (req, res, next) => {
  try {
    const bot = await db.getTelegramBot(req.userId);
    if (!bot) return res.json(null);
    res.json({
      id: bot.id, label: bot.label,
      bot_username: bot.bot_username,
      bot_token: bot.bot_token ? '***' + bot.bot_token.slice(-6) : null,
      authorized_chat_ids: typeof bot.authorized_chat_ids === 'string'
        ? JSON.parse(bot.authorized_chat_ids) : (bot.authorized_chat_ids || []),
      mini_app_url:     bot.mini_app_url,
      notify_errors:    !!bot.notify_errors,
      notify_success:   !!bot.notify_success,
      notify_expired:   !!bot.notify_expired,
      notify_bot_state: !!bot.notify_bot_state,
      is_active:        !!bot.is_active,
      is_running:       await TelegramBotManager.isRunningAsync(req.userId),
    });
  } catch (e) { next(e); }
});

router.put('/', ALL, ...checkLimit.telegramBot, async (req, res, next) => {
  try {
    const { label, bot_token, authorized_chat_ids, mini_app_url,
            notify_errors, notify_success, notify_expired, notify_bot_state } = req.body;

    // При обновлении существующего бота — bot_token необязателен (сохраняем старый)
    const existing = await db.getTelegramBot(req.userId);
    const finalToken = bot_token || existing?.bot_token;
    if (!finalToken) return res.status(400).json({ error: 'bot_token обязателен' });

    const id = await db.upsertTelegramBot(req.userId, {
      label, bot_token: finalToken,
      authorized_chat_ids: authorized_chat_ids || [],
      mini_app_url: mini_app_url || null,
      notify_errors, notify_success, notify_expired, notify_bot_state,
    });

    const botRecord = await db.getTelegramBot(req.userId);
    if (botRecord && botRecord.is_active) {
      await TelegramBotManager.restart(req.userId, await buildBotConfig(req.userId));
    }

    await db.auditLog(req.userId, 'telegram.save', 'telegram_bot', id);
    res.json({ ok: true, id });
  } catch (e) { next(e); }
});

router.post('/start', ALL, ...checkLimit.telegramBot, async (req, res, next) => {
  try {
    const bot = await db.getTelegramBot(req.userId);
    if (!bot || !bot.bot_token)
      return res.status(400).json({ error: 'Сначала настройте Telegram-бот' });

    await TelegramBotManager.start(req.userId, await buildBotConfig(req.userId));
    await db.upsertTelegramBot(req.userId, { ...botToData(bot), is_active: true });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/stop', ALL, async (req, res, next) => {
  try {
    TelegramBotManager.stop(req.userId);
    const bot = await db.getTelegramBot(req.userId);
    if (bot) await db.upsertTelegramBot(req.userId, { ...botToData(bot), is_active: false });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/test', ALL, async (req, res) => {
  try {
    if (!TelegramBotManager.isRunning(req.userId))
      return res.status(400).json({ error: 'Бот не запущен' });
    await TelegramBotManager.sendNotification(req.userId, 'Тестовое сообщение от Steam Poster Bot!');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/', ALL, async (req, res, next) => {
  try {
    TelegramBotManager.stop(req.userId);
    const bot = await db.getTelegramBot(req.userId);
    if (bot) await db.deleteTelegramBot(bot.id, req.userId);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

async function buildBotConfig(userId) {
  const bot = await db.getTelegramBot(userId);
  if (!bot) return null;
  return {
    token:    bot.bot_token,
    chatIds:  typeof bot.authorized_chat_ids === 'string'
      ? JSON.parse(bot.authorized_chat_ids) : (bot.authorized_chat_ids || []),
    notify: {
      errors:   !!bot.notify_errors,
      success:  !!bot.notify_success,
      expired:  !!bot.notify_expired,
      botState: !!bot.notify_bot_state,
    },
    webAppUrl: bot.mini_app_url,
    userId,
    getStatus:    () => SteamBotManager.getStatus(userId),
    getAccounts:  () => db.getProfiles(userId),
    getCampaigns: () => db.getCampaigns(userId),
    getRecentJobs:() => db.getRecentJobs(userId, 20),
    startBot:     () => SteamBotManager.start(userId),
    stopBot:      () => SteamBotManager.stop(userId),
  };
}

function botToData(bot) {
  return {
    label:               bot.label,
    bot_token:           bot.bot_token,
    authorized_chat_ids: typeof bot.authorized_chat_ids === 'string'
      ? JSON.parse(bot.authorized_chat_ids) : (bot.authorized_chat_ids || []),
    mini_app_url:        bot.mini_app_url,
    notify_errors:       !!bot.notify_errors,
    notify_success:      !!bot.notify_success,
    notify_expired:      !!bot.notify_expired,
    notify_bot_state:    !!bot.notify_bot_state,
  };
}

module.exports = router;
