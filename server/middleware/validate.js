'use strict';

/**
 * server/middleware/validate.js
 *
 * Zod-валидация тел запросов.
 * Использование:
 *   router.post('/route', validate(schema), handler)
 */

const { z } = require('zod');

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      return res.status(400).json({ error: errors.join('; ') });
    }
    req.body = result.data;
    next();
  };
}

// ── Схемы ─────────────────────────────────────────────────────────────────────

const schemas = {
  register: z.object({
    email:         z.string().email('Некорректный email'),
    password:      z.string().min(8, 'Пароль минимум 8 символов'),
    name:          z.string().max(100).optional(),
    referral_code: z.string().max(50).optional(),
    trial_plan_id: z.enum(['starter', 'pro', 'enterprise']).optional(),
  }),

  login: z.object({
    email:    z.string().email(),
    password: z.string().min(1),
  }),

  profileImport: z.object({
    name:       z.string().min(1).max(100),
    cookies:    z.array(z.object({ name: z.string(), value: z.string() }).passthrough()).min(1),
    target_url: z.string().url().optional(),
  }),

  campaignCreate: z.object({
    name:             z.string().min(1).max(100),
    title_template:   z.string().min(1).max(500),
    body_template:    z.string().min(1).max(5000),
    schedule_minutes: z.number().int().min(1).max(10080).optional(),
    schedule_times:   z.array(z.string().regex(/^\d{2}:\d{2}$/)).max(24).optional(),
    window_start:     z.string().regex(/^\d{2}:\d{2}$/).optional(),
    window_end:       z.string().regex(/^\d{2}:\d{2}$/).optional(),
    profile_ids:      z.array(z.string().uuid()).min(1),
  }),

  telegramSave: z.object({
    label:               z.string().max(100).optional(),
    bot_token:           z.string().min(10),
    authorized_chat_ids: z.array(z.string()).optional(),
    mini_app_url:        z.string().url().optional().nullable(),
    notify_errors:       z.boolean().optional(),
    notify_success:      z.boolean().optional(),
    notify_expired:      z.boolean().optional(),
    notify_bot_state:    z.boolean().optional(),
  }),

  subscriptionUpgrade: z.object({
    plan_id:        z.string(),
    billing_period: z.enum(['monthly', 'yearly']).optional(),
  }),

  passwordForgot: z.object({
    email: z.string().email(),
  }),

  passwordReset: z.object({
    token:    z.string().min(1),
    password: z.string().min(8),
  }),
};

module.exports = { validate, schemas };
