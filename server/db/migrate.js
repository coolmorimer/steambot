#!/usr/bin/env node
'use strict';

/**
 * server/db/migrate.js
 *
 * Запускает SQL-миграции для PostgreSQL.
 * Использование: node server/db/migrate.js
 *
 * Также экспортирует runMigrations() для вызова из app.js при старте.
 */

const path = require('path');
const fs   = require('fs');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations(pool) {
  const ownPool = !pool;
  if (ownPool) {
    pool = new Pool({
      host:     process.env.DB_HOST     || 'localhost',
      port:     Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME     || 'steambot',
      user:     process.env.DB_USER     || 'steambot',
      password: process.env.DB_PASSWORD || '',
      ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });
  }

  const client = await pool.connect();
  try {
    // Создаём таблицу миграций если нет
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL PRIMARY KEY,
        filename   TEXT   NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Получаем список применённых миграций
    const { rows: applied } = await client.query('SELECT filename FROM _migrations');
    const appliedSet = new Set(applied.map(r => r.filename));

    // Читаем файлы миграций в алфавитном порядке
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[migrate] skip  ${file}`);
        continue;
      }
      console.log(`[migrate] apply ${file} ...`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[migrate] done  ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }

    console.log('[migrate] All migrations applied.');
  } finally {
    client.release();
    if (ownPool) await pool.end();
  }
}

// Если запускается напрямую
if (require.main === module) {
  runMigrations().then(() => process.exit(0)).catch(err => {
    console.error('[migrate] ERROR:', err.message);
    process.exit(1);
  });
}

module.exports = { runMigrations };
