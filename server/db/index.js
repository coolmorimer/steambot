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
 */
const db = new Proxy(impl, {
  get(target, prop) {
    const val = Reflect.get(target, prop);
    if (typeof val !== 'function') return val;
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
