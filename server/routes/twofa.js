'use strict';

const express = require('express');
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const config  = require('../config');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');
const EmailService     = require('../services/EmailService');
const TelegramBotManager = require('../services/TelegramBotManager');
const logger  = require('../logger');

const router = express.Router();

function generate6DigitCode() {
  return String(crypto.randomInt(100000, 999999));
}

function codeExpiresAt() {
  return new Date(Date.now() + 5 * 60_000).toISOString(); // 5 min
}

// ── GET /2fa/status — текущее состояние 2FA ──
router.get('/status', requireAuth, async (req, res) => {
  try {
    const settings = await db.get2FASettings(req.userId);
    res.json({
      enabled: !!settings?.is_enabled,
      method:  settings?.method || null,
    });
  } catch (err) {
    logger.error('2FA status error', { err: err.message });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /2fa/enable — начать установку 2FA (отправить код подтверждения) ──
router.post('/enable', requireAuth, async (req, res) => {
  try {
    const { method } = req.body;
    if (!['email', 'telegram'].includes(method)) {
      return res.status(400).json({ error: 'Метод должен быть "email" или "telegram"' });
    }

    const user = await db.getUserById(req.userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    if (method === 'telegram' && !user.telegram_chat_id) {
      return res.status(400).json({ error: 'Сначала привяжите Telegram аккаунт' });
    }

    // Save method preference (not yet enabled)
    await db.upsert2FASettings(req.userId, method);

    // Generate and send verification code
    const code = generate6DigitCode();
    await db.create2FACode(req.userId, code, codeExpiresAt());

    if (method === 'email') {
      await EmailService.send({
        to: user.email,
        subject: 'Код подтверждения 2FA — Steam Poster Bot',
        html: `<p>Ваш код для включения двухфакторной аутентификации: <b>${code}</b></p><p>Код действителен 5 минут.</p>`,
        text: `Ваш код для включения 2FA: ${code}. Действителен 5 минут.`,
      });
    } else {
      await TelegramBotManager.sendNotification(req.userId, `🔐 Код для включения 2FA: <b>${code}</b>\n\nДействителен 5 минут.`);
    }

    logger.info('2FA setup code sent', { userId: req.userId, method });
    res.json({ message: 'Код подтверждения отправлен', method });
  } catch (err) {
    logger.error('2FA enable error', { err: err.message });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /2fa/confirm — подтвердить установку 2FA кодом ──
router.post('/confirm', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Код обязателен' });
    }

    const settings = await db.get2FASettings(req.userId);
    if (!settings) return res.status(400).json({ error: '2FA не инициализирована. Сначала вызовите /enable' });
    if (settings.is_enabled) return res.status(400).json({ error: '2FA уже включена' });

    const result = await db.verify2FACode(req.userId, code.trim());
    if (!result.valid) {
      const msgs = {
        no_code: 'Код не найден. Запросите новый',
        expired: 'Код истёк. Запросите новый',
        too_many_attempts: 'Слишком много попыток. Запросите новый код',
        invalid_code: 'Неверный код',
      };
      return res.status(400).json({ error: msgs[result.reason] || 'Неверный код' });
    }

    await db.enable2FA(req.userId);
    await db.auditLog(req.userId, '2fa_enabled', 'user', req.userId, { method: settings.method }, req.ip);
    logger.info('2FA enabled', { userId: req.userId, method: settings.method });

    res.json({ enabled: true, method: settings.method });
  } catch (err) {
    logger.error('2FA confirm error', { err: err.message });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /2fa/disable — отключить 2FA (требует пароль) ──
router.post('/disable', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Пароль обязателен' });

    const user = await db.getUserById(req.userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const ok = await bcrypt.compare(password, user._password_hash);
    if (!ok) return res.status(401).json({ error: 'Неверный пароль' });

    await db.disable2FA(req.userId);
    await db.auditLog(req.userId, '2fa_disabled', 'user', req.userId, null, req.ip);
    logger.info('2FA disabled', { userId: req.userId });

    res.json({ enabled: false });
  } catch (err) {
    logger.error('2FA disable error', { err: err.message });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
