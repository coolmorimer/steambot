'use strict';

/**
 * server/middleware/subscription.js
 *
 * Middleware для проверки лимитов плана подписки.
 * Использовать ПОСЛЕ requireAuth.
 *
 * Пример:
 *   router.post('/profiles', requireAuth, checkLimit.profiles, handler)
 */

const db = require('../db');

// ── Загружаем подписку пользователя ─────────────────────────────────────────

async function loadSubscription(req, res, next) {
  try {
    const sub = await db.getActiveSubscription(req.userId);
    if (!sub) {
      return res.status(403).json({
        error: 'Нет активной подписки. Выберите план.',
        code:  'NO_SUBSCRIPTION',
      });
    }

    if (sub.status === 'trial' && sub.trial_ends_at) {
      if (new Date(sub.trial_ends_at) < new Date()) {
        await db.updateSubscription(sub.id, { status: 'expired' });
        return res.status(403).json({
          error: 'Пробный период истёк. Оформите подписку.',
          code:  'TRIAL_EXPIRED',
        });
      }
    }

    if (sub.status === 'active' && sub.expires_at) {
      if (new Date(sub.expires_at) < new Date()) {
        await db.updateSubscription(sub.id, { status: 'expired' });
        return res.status(403).json({
          error: 'Подписка истекла. Продлите план.',
          code:  'SUBSCRIPTION_EXPIRED',
        });
      }
    }

    req.subscription = sub;
    next();
  } catch (err) { next(err); }
}

// ── Хелпер: проверка числового лимита ────────────────────────────────────────

function checkNumericLimit(current, max, resourceName) {
  if (max === -1) return null; // безлимит
  if (current >= max) {
    return {
      error: `Достигнут лимит плана: максимум ${max} ${resourceName}. Обновите подписку.`,
      code:  'LIMIT_REACHED',
      limit: max,
      current,
    };
  }
  return null;
}

// ── Конкретные проверки ──────────────────────────────────────────────────────

const checkLimit = {
  /**
   * Проверить что пользователь может добавить ещё один Steam профиль.
   */
  profiles: [
    loadSubscription,
    async (req, res, next) => {
      try {
        const sub   = req.subscription;
        const count = await db.countProfiles(req.userId);
        const err   = checkNumericLimit(count, sub.max_steam_accounts, 'Steam аккаунтов');
        if (err) return res.status(403).json(err);
        next();
      } catch (e) { next(e); }
    },
  ],

  /**
   * Проверить что пользователь может создать ещё одну кампанию.
   */
  campaigns: [
    loadSubscription,
    async (req, res, next) => {
      try {
        const sub   = req.subscription;
        const count = await db.countCampaigns(req.userId);
        const err   = checkNumericLimit(count, sub.max_campaigns, 'кампаний');
        if (err) return res.status(403).json(err);
        next();
      } catch (e) { next(e); }
    },
  ],

  /**
   * Проверить доступность Telegram-бота.
   */
  telegramBot: [
    loadSubscription,
    (req, res, next) => {
      const sub = req.subscription;
      if (!sub.max_telegram_bots || sub.max_telegram_bots === 0) {
        return res.status(403).json({
          error: 'Telegram-бот недоступен на вашем плане. Обновите подписку.',
          code:  'FEATURE_UNAVAILABLE',
        });
      }
      next();
    },
  ],

  /**
   * Проверить доступность Mini App.
   */
  miniApp: [
    loadSubscription,
    (req, res, next) => {
      if (!req.subscription.has_mini_app) {
        return res.status(403).json({
          error: 'Mini App недоступен на вашем плане.',
          code:  'FEATURE_UNAVAILABLE',
        });
      }
      next();
    },
  ],

  /**
   * Проверить доступность AI-шаблонов.
   */
  aiTemplates: [
    loadSubscription,
    (req, res, next) => {
      if (!req.subscription.has_ai_templates) {
        return res.status(403).json({
          error: 'AI-шаблоны недоступны на вашем плане.',
          code:  'FEATURE_UNAVAILABLE',
        });
      }
      next();
    },
  ],

  /**
   * Проверить доступность API (для внешних интеграций).
   */
  apiAccess: [
    loadSubscription,
    (req, res, next) => {
      if (!req.subscription.has_api_access) {
        return res.status(403).json({
          error: 'API-доступ недоступен на вашем плане.',
          code:  'FEATURE_UNAVAILABLE',
        });
      }
      next();
    },
  ],

  /**
   * Только загрузить подписку (без проверки конкретного лимита).
   */
  any: loadSubscription,
};

module.exports = { checkLimit, loadSubscription };
