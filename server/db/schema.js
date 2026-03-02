'use strict';

/**
 * server/db/schema.js
 *
 * Создаёт полную многопользовательскую схему SQLite.
 * Каждая таблица содержит user_id для tenant-изоляции.
 *
 * @param {import('better-sqlite3').Database} db
 */
module.exports = function createSchema(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ════════════════════════════════════════════════════════════════════════
  //  SUBSCRIPTION PLANS (глобальные, управляются admin)
  // ════════════════════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscription_plans (
      id                      TEXT PRIMARY KEY,
      name                    TEXT NOT NULL,
      description             TEXT NOT NULL DEFAULT '',
      price_monthly           REAL NOT NULL DEFAULT 0,
      price_yearly            REAL NOT NULL DEFAULT 0,
      max_steam_accounts      INTEGER NOT NULL DEFAULT 1,   -- -1 = безлимит
      max_campaigns           INTEGER NOT NULL DEFAULT 1,   -- -1 = безлимит
      max_jobs_per_day        INTEGER NOT NULL DEFAULT 10,  -- -1 = безлимит
      max_telegram_bots       INTEGER NOT NULL DEFAULT 0,
      max_steam_groups        INTEGER NOT NULL DEFAULT 0,
      has_mini_app            INTEGER NOT NULL DEFAULT 0,
      has_ai_templates        INTEGER NOT NULL DEFAULT 0,
      has_analytics           INTEGER NOT NULL DEFAULT 0,
      has_priority_support    INTEGER NOT NULL DEFAULT 0,
      has_api_access          INTEGER NOT NULL DEFAULT 0,
      features                TEXT    NOT NULL DEFAULT '[]',  -- JSON array
      stripe_monthly_price_id TEXT,
      stripe_yearly_price_id  TEXT,
      is_active               INTEGER NOT NULL DEFAULT 1,
      sort_order              INTEGER NOT NULL DEFAULT 0,
      created_at              TEXT    NOT NULL
    );
  `);

  // ════════════════════════════════════════════════════════════════════════
  //  USERS
  // ════════════════════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id              TEXT PRIMARY KEY,
      email           TEXT UNIQUE NOT NULL,
      password_hash   TEXT NOT NULL,
      name            TEXT NOT NULL DEFAULT '',
      role            TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'admin'
      email_verified  INTEGER NOT NULL DEFAULT 0,
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      last_login_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);
  `);

  // ════════════════════════════════════════════════════════════════════════
  //  USER SUBSCRIPTIONS
  // ════════════════════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id                      TEXT PRIMARY KEY,
      user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id                 TEXT NOT NULL REFERENCES subscription_plans(id),
      status                  TEXT NOT NULL DEFAULT 'trial',
        -- 'trial' | 'active' | 'expired' | 'cancelled' | 'past_due'
      billing_period          TEXT NOT NULL DEFAULT 'monthly',  -- 'monthly' | 'yearly'
      started_at              TEXT NOT NULL,
      expires_at              TEXT,
      trial_ends_at           TEXT,
      stripe_subscription_id  TEXT,
      stripe_customer_id      TEXT,
      cancelled_at            TEXT,
      cancel_reason           TEXT,
      created_at              TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_subs_user_id ON user_subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subs_status  ON user_subscriptions(status);
    CREATE INDEX IF NOT EXISTS idx_subs_expires ON user_subscriptions(expires_at);
  `);

  // ════════════════════════════════════════════════════════════════════════
  //  USER TELEGRAM BOTS  (один на пользователя для базовых тарифов, 
  //                       несколько для Enterprise)
  // ════════════════════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_telegram_bots (
      id                    TEXT PRIMARY KEY,
      user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label                 TEXT NOT NULL DEFAULT 'Main Bot',
      bot_token             TEXT NOT NULL,
      bot_username          TEXT,
      bot_name              TEXT,
      authorized_chat_ids   TEXT NOT NULL DEFAULT '[]',  -- JSON ["123","456"]
      mini_app_url          TEXT,
      notify_errors         INTEGER NOT NULL DEFAULT 1,
      notify_success        INTEGER NOT NULL DEFAULT 0,
      notify_expired        INTEGER NOT NULL DEFAULT 1,
      notify_bot_state      INTEGER NOT NULL DEFAULT 1,
      is_active             INTEGER NOT NULL DEFAULT 0,
      created_at            TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tg_bots_user ON user_telegram_bots(user_id);
  `);

  // ════════════════════════════════════════════════════════════════════════
  //  STEAM PROFILES (per user)
  // ════════════════════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      cookies     TEXT NOT NULL,       -- JSON [{name,value,domain,...}]
      target_url  TEXT NOT NULL DEFAULT 'https://steamcommunity.com/app/730/tradingforum/',
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
  `);

  // ════════════════════════════════════════════════════════════════════════
  //  CAMPAIGNS (per user)
  // ════════════════════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name              TEXT NOT NULL,
      title_template    TEXT NOT NULL,
      body_template     TEXT NOT NULL,
      schedule_minutes  INTEGER NOT NULL DEFAULT 60,
      schedule_times    TEXT,                            -- JSON ["17:00","21:00"] | null
      window_start      TEXT NOT NULL DEFAULT '00:00',
      window_end        TEXT NOT NULL DEFAULT '23:59',
      profile_ids       TEXT NOT NULL DEFAULT '[]',      -- JSON array
      group_ids         TEXT NOT NULL DEFAULT '[]',      -- JSON array of steam_groups IDs
      target_url        TEXT,
      is_active         INTEGER NOT NULL DEFAULT 1,
      created_at        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
  `);

  // ════════════════════════════════════════════════════════════════════════
  //  JOBS (per user)
  // ════════════════════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id               TEXT PRIMARY KEY,
      user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      campaign_id      TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
      profile_id       TEXT REFERENCES profiles(id)  ON DELETE SET NULL,
      target_group_id  INTEGER,
      scheduled_at     TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'pending',
        -- 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
      title            TEXT NOT NULL,
      body             TEXT NOT NULL,
      topic_url        TEXT,
      error            TEXT,
      created_at       TEXT NOT NULL,
      executed_at      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_user_status  ON jobs(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_jobs_scheduled    ON jobs(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_campaign     ON jobs(campaign_id);
  `);

  // ════════════════════════════════════════════════════════════════════════
  //  USER SETTINGS (key-value per user)
  // ════════════════════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key      TEXT NOT NULL,
      value    TEXT,
      PRIMARY KEY (user_id, key)
    );
  `);

  // ════════════════════════════════════════════════════════════════════════
  //  SERVER SETTINGS (global key-value, no user_id)
  // ════════════════════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS server_settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL DEFAULT '',
      updated_at  TEXT NOT NULL
    );
  `);

  // ════════════════════════════════════════════════════════════════════════
  //  PAYMENT TRANSACTIONS
  // ════════════════════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_transactions (
      id               TEXT PRIMARY KEY,
      user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subscription_id  TEXT REFERENCES user_subscriptions(id),
      amount           REAL NOT NULL,
      currency         TEXT NOT NULL DEFAULT 'RUB',
      status           TEXT NOT NULL,
        -- 'pending' | 'completed' | 'failed' | 'refunded'
      plan_id          TEXT,
      billing_period   TEXT,
      payment_method   TEXT,
      external_id      TEXT,    -- Stripe charge/payment_intent ID
      metadata         TEXT,    -- JSON
      created_at       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payment_transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_payments_ext_id  ON payment_transactions(external_id);
  `);

  // ════════════════════════════════════════════════════════════════════════
  //  REFRESH TOKENS
  // ════════════════════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  TEXT NOT NULL UNIQUE,
      expires_at  TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      ip_address  TEXT,
      user_agent  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_rt_user_id   ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_rt_hash      ON refresh_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_rt_expires   ON refresh_tokens(expires_at);
  `);

  // ════════════════════════════════════════════════════════════════════════
  //  EMAIL VERIFICATIONS
  // ════════════════════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_verifications (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token       TEXT NOT NULL UNIQUE,
      expires_at  TEXT NOT NULL,
      used        INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL
    );
  `);

  // ════════════════════════════════════════════════════════════════════════
  //  PASSWORD RESETS
  // ════════════════════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token       TEXT NOT NULL UNIQUE,
      expires_at  TEXT NOT NULL,
      used        INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL
    );
  `);

  // ════════════════════════════════════════════════════════════════════════
  //  AUDIT LOG
  // ════════════════════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id            TEXT PRIMARY KEY,
      user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
      action        TEXT NOT NULL,
      resource_type TEXT,
      resource_id   TEXT,
      details       TEXT,    -- JSON
      ip_address    TEXT,
      created_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_user_id    ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);
  `);

  // ════════════════════════════════════════════════════════════════════════
  //  STEAM GROUPS (глобальные, предзаданный список)
  // ════════════════════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS steam_groups (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      url         TEXT NOT NULL,
      avatar_url  TEXT,
      members     INTEGER NOT NULL DEFAULT 0,
      is_active   INTEGER NOT NULL DEFAULT 1,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_steam_groups_active ON steam_groups(is_active);
  `);
};
