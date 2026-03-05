'use strict';
/**
 * Steam Poster Bot — License Server
 * ──────────────────────────────────
 * Запуск:   node server.js
 * Порт:     PORT env (default 3847)
 * Токен:    ADMIN_TOKEN env (обязателен в prod!)
 * HMAC:     HMAC_SECRET env (должен совпадать с electron/license.js)
 */

const express   = require('express');
const crypto    = require('crypto');
const path      = require('path');
const Database  = require('better-sqlite3');

// ─── Конфигурация ──────────────────────────────────────────────────────────
const PORT         = process.env.PORT         || 3847;
const ADMIN_TOKEN  = process.env.ADMIN_TOKEN  || 'CHANGE_ME_ADMIN_SECRET';
const HMAC_SECRET  = process.env.HMAC_SECRET  || 'CHANGE_ME_HMAC_SECRET_32CHARS_MIN';

// Запрет запуска с дефолтными секретами в production
if (process.env.NODE_ENV === 'production') {
  if (ADMIN_TOKEN === 'CHANGE_ME_ADMIN_SECRET' || HMAC_SECRET === 'CHANGE_ME_HMAC_SECRET_32CHARS_MIN') {
    console.error('[FATAL] ADMIN_TOKEN и HMAC_SECRET должны быть заданы через env в production!');
    process.exit(1);
  }
}
if (ADMIN_TOKEN === 'CHANGE_ME_ADMIN_SECRET') {
  console.warn('[WARN] ADMIN_TOKEN не задан! Используйте значение по умолчанию только для разработки.');
}

// ─── Rate limiter (простой in-memory) ─────────────────────────────────────────
const _rateMap = new Map();
function rateLimit(windowMs = 60000, maxHits = 10) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    let entry = _rateMap.get(ip);
    if (!entry || now - entry.start > windowMs) {
      entry = { start: now, count: 0 };
      _rateMap.set(ip, entry);
    }
    entry.count++;
    if (entry.count > maxHits) {
      return res.status(429).json({ ok: false, error: 'too_many_requests' });
    }
    next();
  };
}
// Очистка старых записей каждые 5 минут
setInterval(() => {
  const cutoff = Date.now() - 300000;
  for (const [ip, entry] of _rateMap) {
    if (entry.start < cutoff) _rateMap.delete(ip);
  }
}, 300000);

// ─── База данных ───────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'licenses.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS licenses (
    key          TEXT PRIMARY KEY,
    hwid_hash    TEXT,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at   INTEGER,
    activated_at INTEGER,
    last_check   INTEGER,
    is_active    INTEGER NOT NULL DEFAULT 1,
    max_bots     INTEGER NOT NULL DEFAULT 5,
    note         TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    key        TEXT    NOT NULL,
    event      TEXT    NOT NULL,
    ip         TEXT,
    hwid_hash  TEXT,
    ts         INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// Миграция: добавить столбец в уже существующую базу
try { db.exec('ALTER TABLE licenses ADD COLUMN max_bots INTEGER NOT NULL DEFAULT 5'); } catch (_) {}

const stmts = {
  getKey:       db.prepare('SELECT * FROM licenses WHERE key = ?'),
  insertKey:    db.prepare(`
    INSERT INTO licenses (key, expires_at, max_bots, note)
    VALUES (@key, @expires_at, @max_bots, @note)
  `),
  activateKey:  db.prepare(`
    UPDATE licenses
    SET hwid_hash = @hwid_hash, activated_at = unixepoch(), last_check = unixepoch()
    WHERE key = @key
  `),
  updateCheck:  db.prepare(`
    UPDATE licenses SET last_check = unixepoch() WHERE key = ?
  `),
  revokeKey:    db.prepare('UPDATE licenses SET is_active = 0 WHERE key = ?'),
  restoreKey:   db.prepare('UPDATE licenses SET is_active = 1 WHERE key = ?'),
  listKeys:     db.prepare('SELECT * FROM licenses ORDER BY created_at DESC'),
  logEvent:     db.prepare(`
    INSERT INTO events (key, event, ip, hwid_hash) VALUES (?, ?, ?, ?)
  `),
};

// ─── Утилиты ───────────────────────────────────────────────────────────────

/** Генерация ключа вида SBXX-XXXX-XXXX-XXXX */
function generateKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = (n) =>
    Array.from(crypto.randomBytes(n))
      .map(b => chars[b % chars.length])
      .join('');
  return `SB${segment(2)}-${segment(4)}-${segment(4)}-${segment(4)}`;
}

/** Хэш HWID (чтобы не хранить исходный) */
function hashHwid(hwid) {
  return crypto.createHash('sha256').update(hwid + HMAC_SECRET).digest('hex').slice(0, 16);
}

/** HMAC-подпись ответа (клиент верифицирует её локально) */
function signResponse(payload) {
  const str = JSON.stringify(payload);
  const sig = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(str)
    .digest('hex');
  return { ...payload, __sig: sig };
}

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').slice(0, 64);
}

// ─── Middleware ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '16kb' }));

// Простая авторизация для admin-эндпоинтов (timing-safe)
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || '';
  if (!token || token.length !== ADMIN_TOKEN.length) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(ADMIN_TOKEN, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  next();
}

// ─── Публичные эндпоинты ───────────────────────────────────────────────────

/**
 * POST /api/activate
 * Body: { key: "SB...", hwid: "<raw hwid>" }
 * Привязывает ключ к HWID.
 */
app.post('/api/activate', rateLimit(60000, 5), (req, res) => {
  const { key, hwid } = req.body ?? {};
  const ip = getClientIp(req);
  if (!key || !hwid) return res.json({ ok: false, error: 'missing_fields' });

  const row = stmts.getKey.get(key);
  if (!row) {
    stmts.logEvent.run(key, 'activate_not_found', ip, null);
    return res.json({ ok: false, error: 'key_not_found' });
  }
  if (!row.is_active) {
    stmts.logEvent.run(key, 'activate_revoked', ip, hashHwid(hwid));
    return res.json({ ok: false, error: 'key_revoked' });
  }
  if (row.expires_at && row.expires_at < Math.floor(Date.now() / 1000)) {
    return res.json({ ok: false, error: 'key_expired' });
  }

  const hashed = hashHwid(hwid);

  // Уже привязан к другому устройству?
  if (row.hwid_hash && row.hwid_hash !== hashed) {
    stmts.logEvent.run(key, 'activate_hwid_mismatch', ip, hashed);
    return res.json({ ok: false, error: 'key_used_other_device' });
  }

  // Привязываем
  stmts.activateKey.run({ key, hwid_hash: hashed });
  stmts.logEvent.run(key, 'activated', ip, hashed);

  const payload = {
    ok:         true,
    expires_at: row.expires_at ?? null,
    max_bots:   row.max_bots   ?? 5,
    issued_at:  Math.floor(Date.now() / 1000),
  };
  return res.json(signResponse(payload));
});

/**
 * POST /api/validate
 * Body: { key, hwid }
 * Периодическая валидация (при каждом запуске приложения).
 */
app.post('/api/validate', rateLimit(60000, 30), (req, res) => {
  const { key, hwid } = req.body ?? {};
  const ip = getClientIp(req);
  if (!key || !hwid) return res.json({ ok: false, error: 'missing_fields' });

  const row = stmts.getKey.get(key);
  if (!row) {
    stmts.logEvent.run(key, 'validate_not_found', ip, null);
    return res.json({ ok: false, error: 'key_not_found' });
  }
  if (!row.is_active) {
    stmts.logEvent.run(key, 'validate_revoked', ip, null);
    return res.json({ ok: false, error: 'key_revoked' });
  }
  if (row.expires_at && row.expires_at < Math.floor(Date.now() / 1000)) {
    return res.json({ ok: false, error: 'key_expired' });
  }
  if (!row.hwid_hash) {
    return res.json({ ok: false, error: 'key_not_activated' });
  }

  const hashed = hashHwid(hwid);
  if (row.hwid_hash !== hashed) {
    stmts.logEvent.run(key, 'validate_hwid_mismatch', ip, hashed);
    return res.json({ ok: false, error: 'hwid_mismatch' });
  }

  stmts.updateCheck.run(key);
  stmts.logEvent.run(key, 'validated', ip, hashed);

  const payload = {
    ok:         true,
    expires_at: row.expires_at ?? null,
    max_bots:   row.max_bots   ?? 5,
    issued_at:  Math.floor(Date.now() / 1000),
  };
  return res.json(signResponse(payload));
});

// ─── Admin эндпоинты ──────────────────────────────────────────────────────

/** POST /admin/generate — создать новый ключ */
app.post('/admin/generate', adminAuth, (req, res) => {
  const { note, days, max_bots } = req.body ?? {};
  const key        = generateKey();
  const expires_at = days ? Math.floor(Date.now() / 1000) + days * 86400 : null;
  const bots       = Number(max_bots) || 5;
  stmts.insertKey.run({ key, expires_at, max_bots: bots, note: note ?? null });
  return res.json({ ok: true, key, expires_at, max_bots: bots });
});

/** POST /admin/revoke — отозвать ключ */
app.post('/admin/revoke', adminAuth, (req, res) => {
  const { key } = req.body ?? {};
  if (!key) return res.json({ ok: false, error: 'missing_key' });
  stmts.revokeKey.run(key);
  return res.json({ ok: true });
});

/** POST /admin/restore — восстановить отозванный ключ */
app.post('/admin/restore', adminAuth, (req, res) => {
  const { key } = req.body ?? {};
  if (!key) return res.json({ ok: false, error: 'missing_key' });
  stmts.restoreKey.run(key);
  return res.json({ ok: true });
});

/** GET /admin/keys — список всех ключей */
app.get('/admin/keys', adminAuth, (req, res) => {
  const keys = stmts.listKeys.all().map(r => ({
    ...r,
    hwid_hash: r.hwid_hash ? r.hwid_hash.slice(0, 8) + '...' : null, // не раскрываем полный хэш
  }));
  return res.json({ ok: true, keys });
});

/** GET /health */
app.get('/health', (_, res) => res.json({ ok: true, ts: Date.now() }));

// ─── Запуск ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[SteamBot License Server] Запущен на порту ${PORT}`);
  console.log(`[INFO] Для управления ключами используйте activator (admin panel)`);
  if (HMAC_SECRET === 'CHANGE_ME_HMAC_SECRET_32CHARS_MIN') {
    console.warn('[WARN] Задайте HMAC_SECRET через env! По умолчанию — только для разработки.');
  }
});
