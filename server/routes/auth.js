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
const TelegramBotManager = require('../services/TelegramBotManager');
const SbpPaymentService = require('../services/SbpPaymentService');
const logger       = require('../logger');

const router = express.Router();

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    config.jwt.secret, { algorithm: 'HS256', expiresIn: config.jwt.expiresIn }
  );
}
function signRefreshToken()      { return crypto.randomBytes(40).toString('hex'); }
function hashToken(token)        { return crypto.createHash('sha256').update(token).digest('hex'); }
function refreshExpiresAt()      { const d = parseInt(config.jwt.refreshExpiresIn) || 30; return new Date(Date.now() + d * 86400000).toISOString(); }
function clientInfo(req)         { return { ip: req.ip || req.connection.remoteAddress, ua: req.headers['user-agent'] || '' }; }

router.post('/register', validate(schemas.register), async (req, res) => {
  try {
    const { email, password, name, referral_code } = req.body;
    const existing = await db.getUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email уже зарегистрирован' });

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = await db.createUser({ email, passwordHash, name: name || '' });

    // Выбранный пробный тариф (Starter/Pro/Enterprise) на 3 дня
    const trialPlanId = req.body.trial_plan_id || 'starter';
    const validTrialPlans = ['starter', 'pro', 'enterprise'];
    const chosenTrialPlan = validTrialPlans.includes(trialPlanId) ? trialPlanId : 'starter';
    await db.createSubscription({ userId, planId: chosenTrialPlan, status: 'trial', trialDays: config.trialDays });

    // ── Обработка реферального кода ──
    if (referral_code) {
      try {
        const ref = await db.resolveReferralCode(referral_code);
        if (ref) {
          await db.setReferredBy(userId, ref.referrerId);

          if (ref.type === 'user') {
            // Обычный пользователь — бонус начислится только после оплаты приглашённым
            await db.createReferralUse({
              referrerId: ref.referrerId,
              referredId: userId,
              referralType: 'user',
              rewardType: 'trial_days',
              rewardAmount: 0,
              rewardGiven: false,
            });
            logger.info('Реферал зарегистрирован (бонус после оплаты)', { referrerId: ref.referrerId, referredId: userId });
          } else if (ref.type === 'partner') {
            // Партнёр (ютубер) — записываем использование, % начислится при оплате
            await db.createReferralUse({
              referrerId: ref.referrerId,
              referredId: userId,
              referralType: 'partner',
              partnerReferralId: ref.partner.id,
              rewardType: 'commission',
              rewardAmount: 0,
              rewardGiven: false,
            });
            logger.info('Партнёрский реферал зарегистрирован (бонус после оплаты)', { partnerId: ref.partner.id, referredId: userId });
          }
        }
      } catch (refErr) {
        logger.warn('Referral processing error', { err: refErr.message });
      }
    }

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

    // ── 2FA check ──
    const tfa = await db.get2FASettings(raw.id);
    if (tfa && tfa.is_enabled) {
      const code = String(crypto.randomInt(100000, 999999));
      const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
      await db.create2FACode(raw.id, code, expiresAt);

      if (tfa.method === 'email') {
        EmailService.send({
          to: raw.email,
          subject: 'Код входа — Steam Poster Bot',
          html: `<p>Ваш код для входа: <b>${code}</b></p><p>Код действителен 5 минут.</p>`,
          text: `Ваш код для входа: ${code}. Действителен 5 минут.`,
        }).catch(err => logger.warn('2FA email send error', { err: err.message }));
      } else {
        TelegramBotManager.sendNotification(raw.id, `🔐 Код для входа: <b>${code}</b>\n\nДействителен 5 минут.`)
          .catch(err => logger.warn('2FA telegram send error', { err: err.message }));
      }

      // Return a short-lived token for 2FA verification
      const tfaToken = jwt.sign(
        { sub: raw.id, purpose: '2fa' },
        config.jwt.secret, { algorithm: 'HS256', expiresIn: '5m' }
      );

      logger.info('2FA код отправлен', { userId: raw.id, method: tfa.method });
      return res.json({ requires_2fa: true, tfa_token: tfaToken, method: tfa.method });
    }

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

// ── POST /auth/2fa/verify — подтвердить код 2FA при логине ──
router.post('/2fa/verify', async (req, res) => {
  try {
    const { tfa_token, code } = req.body;
    if (!tfa_token || !code) return res.status(400).json({ error: 'tfa_token и code обязательны' });

    let payload;
    try {
      payload = jwt.verify(tfa_token, config.jwt.secret, { algorithms: ['HS256'] });
    } catch (e) {
      return res.status(401).json({ error: 'Токен 2FA недействителен или истёк' });
    }
    if (payload.purpose !== '2fa') return res.status(401).json({ error: 'Неверный тип токена' });

    const userId = payload.sub;
    const result = await db.verify2FACode(userId, code.trim());
    if (!result.valid) {
      const msgs = {
        no_code: 'Код не найден. Войдите заново',
        expired: 'Код истёк. Войдите заново',
        too_many_attempts: 'Слишком много попыток. Войдите заново',
        invalid_code: 'Неверный код',
      };
      return res.status(401).json({ error: msgs[result.reason] || 'Неверный код' });
    }

    const user = await db.getUserById(userId);
    if (!user || !user.is_active) return res.status(403).json({ error: 'Аккаунт недоступен' });

    await db.updateLastLogin(user.id);

    const accessToken  = signAccessToken(user);
    const refreshToken = signRefreshToken();
    const { ip, ua }   = clientInfo(req);

    await db.createRefreshToken(user.id, hashToken(refreshToken), refreshExpiresAt(), { ip, ua });
    await db.auditLog(user.id, 'login_2fa', 'user', user.id, null, ip);
    logger.info('Вход через 2FA', { userId: user.id });

    const sub = await db.getActiveSubscription(user.id);
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      access_token: accessToken, refresh_token: refreshToken,
      subscription: sub ? { plan_id: sub.plan_id, status: sub.status, expires_at: sub.expires_at, trial_ends_at: sub.trial_ends_at } : null,
    });
  } catch (err) {
    logger.error('2FA verify error', { err: err.message });
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
    const partnerRef = await db.getPartnerReferralByUserId(req.userId);

    let daysLeft = null;
    if (sub?.expires_at) {
      daysLeft = Math.max(0, Math.ceil((new Date(sub.expires_at) - Date.now()) / 86400000));
    } else if (sub?.status === 'trial' && sub?.trial_ends_at) {
      daysLeft = Math.max(0, Math.ceil((new Date(sub.trial_ends_at) - Date.now()) / 86400000));
    }

    const priceRub = sub ? SbpPaymentService.getPriceRub(sub.plan_id, sub.billing_period || 'monthly') : 0;

    // Последний платёж
    const transactions = await db.getTransactions(req.userId, 3);
    const lastPayment = transactions.find(t => t.status === 'completed') || null;

    res.json({
      id: user.id, email: user.email, name: user.name, role: user.role,
      email_verified: user.email_verified, created_at: user.created_at,
      steam_id: user.steam_id, steam_username: user.steam_username,
      steam_avatar: user.steam_avatar, google_id: user.google_id,
      trade_url: user.trade_url, balance: user.balance || 0,
      is_partner: !!partnerRef,
      is_sysadmin: user.email === config.admin.email,
      subscription: sub ? {
        plan_id: sub.plan_id, plan_name: sub.plan_name, status: sub.status,
        expires_at: sub.expires_at, trial_ends_at: sub.trial_ends_at,
        days_left: daysLeft,
        price_rub: priceRub,
        billing_period: sub.billing_period,
        started_at: sub.started_at,
        limits: {
          max_steam_accounts: sub.max_steam_accounts, max_campaigns: sub.max_campaigns,
          max_jobs_per_day: sub.max_jobs_per_day, max_telegram_bots: sub.max_telegram_bots,
          max_steam_groups: sub.max_steam_groups ?? 0,
        },
        features: {
          has_mini_app: !!sub.has_mini_app, has_ai_templates: !!sub.has_ai_templates,
          has_analytics: !!sub.has_analytics, has_priority_support: !!sub.has_priority_support,
          has_api_access: !!sub.has_api_access,
        },
        last_payment: lastPayment ? {
          amount: lastPayment.amount,
          currency: lastPayment.currency,
          date: lastPayment.created_at,
          method: lastPayment.payment_method,
        } : null,
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
