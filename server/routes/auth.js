'use strict';

const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const crypto    = require('crypto');
const config    = require('../config');
const db        = require('../db');
const { requireAuth, requireActiveUser } = require('../middleware/auth');
const { validate, schemas }              = require('../middleware/validate');
const EmailService = require('../services/EmailService');
const logger       = require('../logger');

const router = express.Router();

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    config.jwt.secret, { expiresIn: config.jwt.expiresIn }
  );
}
function signRefreshToken()      { return crypto.randomBytes(40).toString('hex'); }
function hashToken(token)        { return crypto.createHash('sha256').update(token).digest('hex'); }
function refreshExpiresAt()      { const d = parseInt(config.jwt.refreshExpiresIn) || 30; return new Date(Date.now() + d * 86400000).toISOString(); }
function clientInfo(req)         { return { ip: req.ip || req.connection.remoteAddress, ua: req.headers['user-agent'] || '' }; }

router.post('/register', validate(schemas.register), async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const existing = await db.getUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email уже зарегистрирован' });

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = await db.createUser({ email, passwordHash, name: name || '' });

    await db.createSubscription({ userId, planId: 'free', status: 'trial', trialDays: config.trialDays });

    const user         = await db.getUserById(userId);
    const accessToken  = signAccessToken(user);
    const refreshToken = signRefreshToken();
    const { ip, ua }   = clientInfo(req);

    await db.createRefreshToken(userId, hashToken(refreshToken), refreshExpiresAt(), { ip, ua });
    await db.auditLog(userId, 'register', 'user', userId, { email }, ip);

    EmailService.sendWelcomeEmail(email, name || email.split('@')[0]).catch(err =>
      logger.warn('Ошибка отправки welcome email', { err: err.message })
    );

    // Отправить email для верификации
    try {
      const verifyToken = crypto.randomBytes(32).toString('hex');
      const verifyExpiresAt = new Date(Date.now() + 24 * 3600000).toISOString(); // 24 ч
      await db.createEmailVerification(userId, verifyToken, verifyExpiresAt);
      const verifyUrl = `${config.appUrl}/verify-email?token=${verifyToken}`;
      EmailService.sendVerificationEmail(email, name || email.split('@')[0], verifyUrl).catch(err =>
        logger.warn('Ошибка отправки verification email', { err: err.message })
      );
    } catch (err) {
      logger.warn('Email verification setup error', { err: err.message });
    }

    logger.info('Новый пользователь', { userId, email });
    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      access_token: accessToken, refresh_token: refreshToken,
    });
  } catch (err) {
    logger.error('register error', { err: err.message });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.post('/login', validate(schemas.login), async (req, res) => {
  try {
    const { email, password } = req.body;
    const raw = await db.getUserByEmail(email);
    if (!raw) return res.status(401).json({ error: 'Неверный email или пароль' });

    const ok = await bcrypt.compare(password, raw._password_hash);
    if (!ok) return res.status(401).json({ error: 'Неверный email или пароль' });
    if (!raw.is_active) return res.status(403).json({ error: 'Аккаунт заблокирован.' });

    await db.updateLastLogin(raw.id);

    const accessToken  = signAccessToken(raw);
    const refreshToken = signRefreshToken();
    const { ip, ua }   = clientInfo(req);

    await db.createRefreshToken(raw.id, hashToken(refreshToken), refreshExpiresAt(), { ip, ua });
    await db.auditLog(raw.id, 'login', 'user', raw.id, null, ip);
    logger.info('Вход выполнен', { userId: raw.id, email });

    const sub = await db.getActiveSubscription(raw.id);
    res.json({
      user: { id: raw.id, email: raw.email, name: raw.name, role: raw.role },
      access_token: accessToken, refresh_token: refreshToken,
      subscription: sub ? { plan_id: sub.plan_id, status: sub.status, expires_at: sub.expires_at, trial_ends_at: sub.trial_ends_at } : null,
    });
  } catch (err) {
    logger.error('login error', { err: err.message });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ error: 'refresh_token обязателен' });

    const stored = await db.getRefreshToken(hashToken(refresh_token));
    if (!stored) return res.status(401).json({ error: 'Недействительный refresh-токен' });
    if (new Date(stored.expires_at) < new Date()) {
      await db.deleteRefreshToken(hashToken(refresh_token));
      return res.status(401).json({ error: 'Refresh-токен истёк. Войдите заново.' });
    }

    const user = await db.getUserById(stored.user_id);
    if (!user || !user.is_active) return res.status(403).json({ error: 'Аккаунт недоступен' });

    await db.deleteRefreshToken(hashToken(refresh_token));

    const newAccessToken  = signAccessToken(user);
    const newRefreshToken = signRefreshToken();
    const { ip, ua }      = clientInfo(req);
    await db.createRefreshToken(user.id, hashToken(newRefreshToken), refreshExpiresAt(), { ip, ua });

    res.json({ access_token: newAccessToken, refresh_token: newRefreshToken });
  } catch (err) {
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  const { refresh_token } = req.body;
  if (refresh_token) await db.deleteRefreshToken(hashToken(refresh_token));
  res.json({ ok: true });
});

router.get('/me', requireAuth, requireActiveUser, async (req, res, next) => {
  try {
    const user = req.dbUser;
    const sub  = await db.getActiveSubscription(req.userId);
    res.json({
      id: user.id, email: user.email, name: user.name, role: user.role,
      email_verified: user.email_verified, created_at: user.created_at,
      subscription: sub ? {
        plan_id: sub.plan_id, plan_name: sub.plan_name, status: sub.status,
        expires_at: sub.expires_at, trial_ends_at: sub.trial_ends_at,
        limits: {
          max_steam_accounts: sub.max_steam_accounts, max_campaigns: sub.max_campaigns,
          max_jobs_per_day: sub.max_jobs_per_day, max_telegram_bots: sub.max_telegram_bots,
        },
        features: {
          has_mini_app: !!sub.has_mini_app, has_ai_templates: !!sub.has_ai_templates,
          has_analytics: !!sub.has_analytics, has_priority_support: !!sub.has_priority_support,
          has_api_access: !!sub.has_api_access,
        },
      } : null,
    });
  } catch (e) { next(e); }
});

router.patch('/profile', requireAuth, requireActiveUser, async (req, res, next) => {
  try {
    const { name, current_password, new_password } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name.trim();

    if (new_password) {
      if (!current_password) return res.status(400).json({ error: 'Укажите текущий пароль' });
      const raw = await db.getUserById(req.userId);
      const ok  = await bcrypt.compare(current_password, raw._password_hash);
      if (!ok) return res.status(400).json({ error: 'Неверный текущий пароль' });
      if (new_password.length < 8) return res.status(400).json({ error: 'Пароль слишком короткий' });
      updates.password_hash = await bcrypt.hash(new_password, 12);
    }

    if (Object.keys(updates).length) await db.updateUser(req.userId, updates);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/password/forgot', validate(schemas.passwordForgot), async (req, res) => {
  try {
    const { email } = req.body;
    const user = await db.getUserByEmail(email);
    if (!user) return res.json({ ok: true, message: 'Если email существует  письмо отправлено' });

    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000).toISOString();
    await db.createPasswordReset(user.id, token, expiresAt);

    const resetUrl = `${config.appUrl}/reset-password?token=${token}`;
    logger.info('Запрос сброса пароля', { email });
    EmailService.sendPasswordResetEmail(email, resetUrl).catch(err =>
      logger.warn('Ошибка отправки reset email', { err: err.message })
    );
    res.json({ ok: true, message: 'Если email существует  письмо отправлено' });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/password/reset', validate(schemas.passwordReset), async (req, res) => {
  try {
    const { token, password } = req.body;
    const reset = await db.getPasswordReset(token);
    if (!reset) return res.status(400).json({ error: 'Токен недействителен или истёк' });
    if (new Date(reset.expires_at) < new Date())
      return res.status(400).json({ error: 'Токен истёк.' });

    const passwordHash = await bcrypt.hash(password, 12);
    await db.updateUser(reset.user_id, { password_hash: passwordHash });
    await db.markPasswordResetUsed(reset.id);
    await db.deleteUserRefreshTokens(reset.user_id);

    res.json({ ok: true, message: 'Пароль успешно изменён' });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── Подтверждение email ─────────────────────────────────────────────────────

router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Токен обязателен' });

    const record = await db.getEmailVerification(token);
    if (!record) return res.status(400).json({ error: 'Токен недействителен или уже использован' });
    if (new Date(record.expires_at) < new Date())
      return res.status(400).json({ error: 'Ссылка для подтверждения истекла. Запросите новую.' });

    await db.updateUser(record.user_id, { email_verified: true });
    await db.markEmailVerificationUsed(record.id);

    logger.info('Email подтверждён', { userId: record.user_id });
    res.json({ ok: true, message: 'Email успешно подтверждён!' });
  } catch (err) {
    logger.error('verify-email error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/resend-verification', requireAuth, async (req, res) => {
  try {
    const user = await db.getUserById(req.userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (user.email_verified) return res.json({ ok: true, message: 'Email уже подтверждён' });

    const verifyToken = crypto.randomBytes(32).toString('hex');
    const expiresAt   = new Date(Date.now() + 24 * 3600000).toISOString();
    await db.createEmailVerification(user.id, verifyToken, expiresAt);

    const verifyUrl = `${config.appUrl}/verify-email?token=${verifyToken}`;
    await EmailService.sendVerificationEmail(user.email, user.name || user.email, verifyUrl);

    res.json({ ok: true, message: 'Письмо для подтверждения отправлено' });
  } catch (err) {
    logger.error('resend-verification error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
