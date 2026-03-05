'use strict';
/**
 * electron/license.js
 * ─────────────────────────────────────────────────────────────────────────
 * Управление лицензией в главном процессе Electron.
 *
 * Схема работы:
 *  1. При первом запуске — нет license.dat → приложение показывает экран активации.
 *  2. Пользователь вводит ключ → /api/activate на сервере лицензий.
 *  3. Сервер привязывает ключ к HWID и возвращает подписанный токен.
 *  4. Токен шифруется AES-256 (ключ = HWID) и сохраняется в license.dat.
 *  5. При каждом запуске — расшифровываем, проверяем подпись, сверяемся с сервером.
 *  6. Если сервер недоступен — оффлайн-грейс 7 дней от последней успешной проверки.
 *  7. Если ключ отозван / не совпадает HWID — стираем кэш, просим переактивировать.
 */

const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const http    = require('http');
const https   = require('https');

// Установите true для сборки без лицензии (всегда активна)
const BYPASS_LICENSE = process.env.NODE_ENV === 'development';

// ── Настройки (разработчик меняет SERVER_URL и HMAC_SECRET перед релизом) ──
const SERVER_URL   = process.env.LICENSE_SERVER_URL || 'http://localhost:3847';
const HMAC_SECRET  = process.env.LICENSE_HMAC_SECRET || 'CHANGE_ME_HMAC_SECRET_32CHARS_MIN';
const GRACE_DAYS   = 7;   // дней оффлайн-работы

// ── Пути ────────────────────────────────────────────────────────────────────
let _userDataPath = null;
function getLicenseFile() {
  if (!_userDataPath) {
    const { app } = require('electron');
    _userDataPath = app.getPath('userData');
  }
  return path.join(_userDataPath, 'license.dat');
}

// ── HWID ─────────────────────────────────────────────────────────────────────
let _hwid = null;
function getHwid() {
  if (_hwid) return _hwid;
  const raw = [
    os.hostname(),
    os.cpus()?.[0]?.model ?? 'cpu',
    String(os.totalmem()),
    os.platform(),
  ].join('|');
  _hwid = crypto.createHash('sha256').update(raw).digest('hex').toUpperCase().slice(0, 32);
  return _hwid;
}

// ── Шифрование/расшифровка (AES-256-CBC, ключ = HWID) ────────────────────────
const ENC_KEY = () =>
  crypto.createHash('sha256').update(getHwid() + HMAC_SECRET).digest(); // 32 bytes

function encrypt(obj) {
  const iv  = crypto.randomBytes(16);
  const cip = crypto.createCipheriv('aes-256-cbc', ENC_KEY(), iv);
  const data = Buffer.from(JSON.stringify(obj), 'utf8');
  const enc  = Buffer.concat([cip.update(data), cip.final()]);
  return iv.toString('hex') + ':' + enc.toString('hex');
}

function decrypt(str) {
  try {
    const [ivHex, encHex] = str.split(':');
    const iv   = Buffer.from(ivHex, 'hex');
    const enc  = Buffer.from(encHex, 'hex');
    const dec  = crypto.createDecipheriv('aes-256-cbc', ENC_KEY(), iv);
    const data = Buffer.concat([dec.update(enc), dec.final()]);
    return JSON.parse(data.toString('utf8'));
  } catch (_) {
    return null;
  }
}

// ── Чтение/запись кэша ────────────────────────────────────────────────────────
function readCache() {
  try {
    const raw = fs.readFileSync(getLicenseFile(), 'utf8');
    return decrypt(raw);
  } catch (_) {
    return null;
  }
}

function writeCache(data) {
  try {
    fs.writeFileSync(getLicenseFile(), encrypt(data), 'utf8');
  } catch (_) {}
}

function clearCache() {
  try { fs.unlinkSync(getLicenseFile()); } catch (_) {}
}

// ── Верификация HMAC-подписи ответа сервера ───────────────────────────────────
function verifySignature(payload) {
  const { __sig, ...body } = payload;
  if (!__sig) return false;
  const expected = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(JSON.stringify(body))
    .digest('hex');
  // Timing-safe сравнение
  if (expected.length !== __sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(__sig, 'utf8'));
}

// ── HTTP-запрос к серверу лицензий ────────────────────────────────────────────
function serverRequest(endpoint, body, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const u   = new URL(SERVER_URL + endpoint);
    const lib = u.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);

    const req = lib.request({
      hostname: u.hostname,
      port:     u.port,
      path:     u.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (_) { reject(new Error('Bad JSON')); }
      });
    });

    const t = setTimeout(() => { req.destroy(); reject(new Error('timeout')); }, timeoutMs);
    req.on('error', (e) => { clearTimeout(t); reject(e); });
    req.on('close', () => clearTimeout(t));
    req.write(data);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Публичный API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * check() → { status, key?, expiresAt?, offlineDaysLeft? }
 *
 * status:
 *  'ok'          — лицензия валидна
 *  'offline_ok'  — нет сети, оффлайн-грейс ещё действует
 *  'not_found'   — license.dat отсутствует / не расшифровывается
 *  'revoked'     — ключ отозван на сервере
 *  'expired'     — ключ по сроку истёк
 *  'hwid_mismatch' — ключ привязан к другому устройству
 *  'grace_expired' — оффлайн-грейс кончился
 *  'server_error'  — непредвиденная ошибка сервера
 */
async function check() {
  if (BYPASS_LICENSE) return { status: 'ok', maxBots: 9999, expiresAt: null };

  const cache = readCache();
  if (!cache || !cache.key) return { status: 'not_found' };

  const hwid = getHwid();
  if (cache.hwid !== hwid) {
    // license.dat перенесён на другую машину
    clearCache();
    return { status: 'hwid_mismatch' };
  }

  // Пробуем онлайн-проверку
  try {
    const res = await serverRequest('/api/validate', { key: cache.key, hwid });

    if (!res.ok) {
      const map = {
        key_revoked:        'revoked',
        key_expired:        'expired',
        key_not_found:      'not_found',
        hwid_mismatch:      'hwid_mismatch',
        key_not_activated:  'not_found',
      };
      const status = map[res.error] || 'server_error';
      if (['revoked', 'hwid_mismatch', 'not_found'].includes(status)) clearCache();
      return { status, raw: res.error };
    }

    // Проверяем подпись ответа
    if (!verifySignature(res)) {
      clearCache();
      return { status: 'server_error', raw: 'bad_signature' };
    }

    // Обновляем кэш
    const updated = { ...cache, lastCheck: Date.now(), expiresAt: res.expires_at ?? null, maxBots: res.max_bots ?? 5 };
    writeCache(updated);
    return { status: 'ok', key: cache.key, expiresAt: updated.expiresAt, maxBots: updated.maxBots };

  } catch (_) {
    // Сервер недоступен — оффлайн-грейс
    const graceSec = GRACE_DAYS * 86400 * 1000;
    const elapsed  = Date.now() - (cache.lastCheck || 0);
    if (elapsed <= graceSec) {
      const daysLeft = Math.ceil((graceSec - elapsed) / 86400000);
      return { status: 'offline_ok', key: cache.key, expiresAt: cache.expiresAt, maxBots: cache.maxBots ?? 5, offlineDaysLeft: daysLeft };
    }
    return { status: 'grace_expired' };
  }
}

/**
 * activate(key) → { ok, status?, expiresAt? }
 * Отправляет запрос активации на сервер и сохраняет кэш при успехе.
 */
async function activate(key) {
  if (BYPASS_LICENSE) return { ok: true, maxBots: 9999, expiresAt: null };

  if (!key || typeof key !== 'string') return { ok: false, status: 'invalid_key' };
  const clean = key.trim().toUpperCase();
  const hwid  = getHwid();

  let res;
  try {
    res = await serverRequest('/api/activate', { key: clean, hwid });
  } catch (_) {
    return { ok: false, status: 'no_connection' };
  }

  if (!res.ok) {
    const map = {
      key_not_found:          'not_found',
      key_revoked:            'revoked',
      key_expired:            'expired',
      key_used_other_device:  'used_other_device',
    };
    return { ok: false, status: map[res.error] || res.error };
  }

  if (!verifySignature(res)) return { ok: false, status: 'bad_signature' };

  writeCache({ key: clean, hwid, lastCheck: Date.now(), expiresAt: res.expires_at ?? null, maxBots: res.max_bots ?? 5 });
  return { ok: true, expiresAt: res.expires_at ?? null, maxBots: res.max_bots ?? 5 };
}

/**
 * deactivate() — стереть локальную лицензию (для поддержки пользователя)
 */
function deactivate() {
  clearCache();
}

/** hwid() — текущий HWID (показывается пользователю для поддержки) */
function hwid() { return getHwid(); }

module.exports = { check, activate, deactivate, hwid };
