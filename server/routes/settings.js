'use strict';

const express = require('express');
const db      = require('../db');
const { requireAuth, requireActiveUser } = require('../middleware/auth');

const router = express.Router();
const ALL    = [requireAuth, requireActiveUser];

const ALLOWED_KEYS = [
  'timezone', 'headless', 'slow_mo', 'post_delay_min', 'post_delay_max',
  'retries', 'openai_key', 'openai_base_url', 'openai_model',
  'ollama_url', 'ollama_model', 'notify_email',
];

router.get('/', ALL, async (req, res, next) => {
  try {
    const settings = await db.getAllSettings(req.userId);
    if (settings.openai_key) settings.openai_key = '***';
    res.json(settings);
  } catch (e) { next(e); }
});

router.patch('/', ALL, async (req, res, next) => {
  try {
    const kvMap = {};
    for (const [k, v] of Object.entries(req.body)) {
      if (ALLOWED_KEYS.includes(k)) kvMap[k] = String(v);
    }
    if (Object.keys(kvMap).length) await db.bulkSetSettings(req.userId, kvMap);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
