'use strict';

/**
 * server/routes/apikeys.js
 *
 * Управление API-ключами пользователя.
 * Монтируется как /api/apikeys
 */

const express = require('express');
const crypto  = require('crypto');
const db      = require('../db');
const { requireAuth, requireActiveUser } = require('../middleware/auth');
const { loadSubscription, checkLimit }   = require('../middleware/subscription');
const { hashKey }                        = require('../middleware/apiKeyAuth');

const router = express.Router();
const ALL    = [requireAuth, requireActiveUser, loadSubscription];

const MAX_KEYS = 5;

/**
 * GET /api/apikeys — список ключей пользователя
 */
router.get('/', ALL, async (req, res, next) => {
  try {
    const keys = await db.getApiKeys(req.userId);
    res.json(keys.map(k => ({
      id:           k.id,
      name:         k.name,
      key_prefix:   k.key_prefix,
      permissions:  typeof k.permissions === 'string' ? JSON.parse(k.permissions) : k.permissions,
      last_used_at: k.last_used_at,
      expires_at:   k.expires_at,
      is_active:    k.is_active,
      created_at:   k.created_at,
    })));
  } catch (e) { next(e); }
});

/**
 * POST /api/apikeys — создать новый ключ
 * Body: { name, permissions?, expires_in_days? }
 * Returns: { id, key, name, key_prefix, permissions, created_at }
 * ВАЖНО: ключ возвращается только при создании!
 */
router.post('/', ALL, ...checkLimit.apiAccess, async (req, res, next) => {
  try {
    const count = await db.countApiKeys(req.userId);
    if (count >= MAX_KEYS) {
      return res.status(400).json({ error: `Максимум ${MAX_KEYS} API-ключей`, code: 'LIMIT_REACHED' });
    }

    const { name = 'API Key', permissions = ['read'], expires_in_days } = req.body;

    // Валидация permissions
    const validPerms = ['read', 'write', 'delete'];
    const filteredPerms = permissions.filter(p => validPerms.includes(p));
    if (filteredPerms.length === 0) filteredPerms.push('read');

    // Генерация ключа: spb_ + 40 hex символов
    const rawKey   = 'spb_' + crypto.randomBytes(20).toString('hex');
    const keyHash  = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 12); // "spb_xxxxxxxx"

    const expiresAt = expires_in_days
      ? new Date(Date.now() + expires_in_days * 86400000).toISOString()
      : null;

    const id = await db.createApiKey({
      userId:      req.userId,
      name,
      keyHash,
      keyPrefix,
      permissions: filteredPerms,
      expiresAt,
    });

    await db.auditLog(req.userId, 'apikey.create', 'api_key', id, { name, permissions: filteredPerms });

    // Ключ возвращается ТОЛЬКО при создании
    res.status(201).json({
      id,
      key:         rawKey,
      name,
      key_prefix:  keyPrefix,
      permissions: filteredPerms,
      expires_at:  expiresAt,
      created_at:  new Date().toISOString(),
    });
  } catch (e) { next(e); }
});

/**
 * DELETE /api/apikeys/:id — удалить ключ
 */
router.delete('/:id', ALL, async (req, res, next) => {
  try {
    await db.deleteApiKey(req.params.id, req.userId);
    await db.auditLog(req.userId, 'apikey.delete', 'api_key', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
