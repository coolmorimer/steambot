'use strict';

/**
 * server/utils/crypto.js
 *
 * Утилиты шифрования для защиты чувствительных данных в БД.
 * Использует AES-256-GCM с ключом из переменной окружения ENCRYPTION_KEY.
 *
 * Формат зашифрованного значения: "enc:iv_hex:tag_hex:ciphertext_hex"
 */

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:';

function _getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) return null; // 32 bytes = 64 hex chars
  return Buffer.from(hex, 'hex');
}

/**
 * Зашифровать строку. Если ENCRYPTION_KEY не задан — возвращает plaintext без изменений.
 */
function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const key = _getKey();
  if (!key) return plaintext; // graceful fallback — не ломаем если ключ не настроен

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  let enc = cipher.update(plaintext, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${PREFIX}${iv.toString('hex')}:${tag}:${enc}`;
}

/**
 * Расшифровать строку. Если значение не зашифровано (нет префикса) — возвращает as-is.
 */
function decrypt(data) {
  if (!data || !data.startsWith(PREFIX)) return data; // plaintext или null

  const key = _getKey();
  if (!key) throw new Error('ENCRYPTION_KEY not set but encrypted data found');

  const parts = data.slice(PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted data format');

  const [ivHex, tagHex, enc] = parts;
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let dec = decipher.update(enc, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

/**
 * Проверить, зашифровано ли значение.
 */
function isEncrypted(data) {
  return typeof data === 'string' && data.startsWith(PREFIX);
}

module.exports = { encrypt, decrypt, isEncrypted };
