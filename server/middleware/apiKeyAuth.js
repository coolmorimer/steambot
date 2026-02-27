'use strict';

/**
 * server/middleware/apiKeyAuth.js
 *
 * Middleware для аутентификации через API-ключ.
 * Заголовок: Authorization: Bearer spb_xxxxxxxxxxxxx
 * Или:       X-API-Key: spb_xxxxxxxxxxxxx
 */

const crypto = require('crypto');
const db     = require('../db');

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function apiKeyAuth(req, res, next) {
  // Извлекаем ключ из заголовков
  let apiKey = null;

  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer spb_')) {
    apiKey = authHeader.slice(7);
  }
  if (!apiKey) {
    apiKey = req.headers['x-api-key'];
  }

  if (!apiKey || !apiKey.startsWith('spb_')) {
    return res.status(401).json({
      error: 'API key required. Use header: Authorization: Bearer spb_xxx or X-API-Key: spb_xxx',
      code: 'UNAUTHORIZED',
    });
  }

  try {
    const keyHash  = hashKey(apiKey);
    const keyRecord = await db.getApiKeyByHash(keyHash);

    if (!keyRecord) {
      return res.status(401).json({ error: 'Invalid API key', code: 'UNAUTHORIZED' });
    }

    // Проверяем срок действия
    if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
      return res.status(401).json({ error: 'API key expired', code: 'KEY_EXPIRED' });
    }

    // Проверяем что пользователь активен
    const user = await db.getUserById(keyRecord.user_id);
    if (!user || !user.is_active) {
      return res.status(403).json({ error: 'Account disabled', code: 'ACCOUNT_DISABLED' });
    }

    // Обновляем last_used_at (не ждём)
    db.updateApiKeyLastUsed(keyRecord.id).catch(() => {});

    // Устанавливаем данные пользователя
    req.userId = keyRecord.user_id;
    req.user   = user;
    req.apiKey  = keyRecord;
    req.apiKeyPermissions = typeof keyRecord.permissions === 'string'
      ? JSON.parse(keyRecord.permissions)
      : (keyRecord.permissions || ['read']);

    next();
  } catch (err) {
    console.error('[apiKeyAuth] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Middleware для проверки разрешений API-ключа
 */
function requirePermission(...perms) {
  return (req, res, next) => {
    const has = req.apiKeyPermissions || [];
    const missing = perms.filter(p => !has.includes(p));
    if (missing.length > 0) {
      return res.status(403).json({
        error: `Missing permissions: ${missing.join(', ')}`,
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    }
    next();
  };
}

module.exports = { apiKeyAuth, requirePermission, hashKey };
