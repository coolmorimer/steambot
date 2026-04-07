'use strict';

/**
 * server/db/index.js  Universal DAL loader
 *
 * DB_TYPE=postgresql  ->  async PostgreSQL adapter (db/pg.js)
 * DB_TYPE=sqlite      ->  sync SQLite adapter (db/sqlite.js), auto-promisified
 *
 * All exported functions return Promise regardless of backend.
 */

const config = require('../config');
const dbType = (process.env.DB_TYPE || config.db && config.db.type || 'sqlite').toLowerCase();

let impl;
if (dbType === 'postgresql' || dbType === 'postgres') {
  impl = require('./pg');
  console.log('[db] Using PostgreSQL backend');
} else {
  impl = require('./sqlite');
  console.log('[db] Using SQLite backend');
}

/**
 * Proxy: wrap every synchronous function in Promise.resolve()
 * so all callers can use await uniformly.
 *
 * Adds TTL-based in-memory cache for getServerSetting (30s).
 */
const _settingsCache = new Map();
const SETTINGS_CACHE_TTL = 30_000; // 30 seconds

const db = new Proxy(impl, {
  get(target, prop) {
    const val = Reflect.get(target, prop);
    if (typeof val !== 'function') return val;

    // Cache wrapper for getServerSetting
    if (prop === 'getServerSetting') {
      return async function (key, defaultValue = null) {
        const cached = _settingsCache.get(key);
        if (cached && Date.now() - cached.ts < SETTINGS_CACHE_TTL) return cached.value;
        const result = val.apply(target, [key, defaultValue]);
        const value = result instanceof Promise ? await result : result;
        _settingsCache.set(key, { value, ts: Date.now() });
        return value;
      };
    }

    // Invalidate cache on settings write
    if (prop === 'setServerSetting') {
      return async function (key, value) {
        _settingsCache.delete(key);
        const result = val.apply(target, [key, value]);
        return result instanceof Promise ? result : Promise.resolve(result);
      };
    }
    if (prop === 'bulkSetServerSettings') {
      return async function (kvMap) {
        for (const k of Object.keys(kvMap)) _settingsCache.delete(k);
        const result = val.apply(target, [kvMap]);
        return result instanceof Promise ? result : Promise.resolve(result);
      };
    }

    return function (...args) {
      try {
        const result = val.apply(target, args);
        return result instanceof Promise ? result : Promise.resolve(result);
      } catch (err) {
        return Promise.reject(err);
      }
    };
  },
});

module.exports = db;
