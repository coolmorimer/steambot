-- server/db/migrations/001_init.sql
-- Инициализация схемы PostgreSQL для Steam Poster Bot

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════
--  subscription_plans
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS subscription_plans (
  id                      TEXT        PRIMARY KEY,
  name                    TEXT        NOT NULL,
  description             TEXT        NOT NULL DEFAULT '',
  price_monthly           NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly            NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_steam_accounts      INTEGER     NOT NULL DEFAULT 1,
  max_campaigns           INTEGER     NOT NULL DEFAULT 1,
  max_jobs_per_day        INTEGER     NOT NULL DEFAULT 10,
  max_telegram_bots       INTEGER     NOT NULL DEFAULT 0,
  has_mini_app            BOOLEAN     NOT NULL DEFAULT FALSE,
  has_ai_templates        BOOLEAN     NOT NULL DEFAULT FALSE,
  has_analytics           BOOLEAN     NOT NULL DEFAULT FALSE,
  has_priority_support    BOOLEAN     NOT NULL DEFAULT FALSE,
  has_api_access          BOOLEAN     NOT NULL DEFAULT FALSE,
  features                JSONB       NOT NULL DEFAULT '[]',
  stripe_monthly_price_id TEXT,
  stripe_yearly_price_id  TEXT,
  is_active               BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order              INTEGER     NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
--  users
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id              TEXT        PRIMARY KEY,
  email           TEXT        NOT NULL UNIQUE,
  password_hash   TEXT        NOT NULL,
  name            TEXT        NOT NULL DEFAULT '',
  role            TEXT        NOT NULL DEFAULT 'user',
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  email_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users (role);

-- ═══════════════════════════════════════════════════════
--  user_subscriptions
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                      TEXT        PRIMARY KEY,
  user_id                 TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id                 TEXT        NOT NULL REFERENCES subscription_plans(id),
  status                  TEXT        NOT NULL DEFAULT 'trial',
  billing_period          TEXT        NOT NULL DEFAULT 'monthly',
  started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at              TIMESTAMPTZ,
  trial_ends_at           TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  cancel_reason           TEXT,
  stripe_subscription_id  TEXT UNIQUE,
  stripe_customer_id      TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subs_user_id ON user_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subs_status  ON user_subscriptions (status);

-- ═══════════════════════════════════════════════════════
--  user_telegram_bots
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_telegram_bots (
  id                  TEXT        PRIMARY KEY,
  user_id             TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label               TEXT        NOT NULL DEFAULT 'Main Bot',
  bot_token           TEXT        NOT NULL,
  bot_username        TEXT,
  authorized_chat_ids JSONB       NOT NULL DEFAULT '[]',
  mini_app_url        TEXT,
  notify_errors       BOOLEAN     NOT NULL DEFAULT TRUE,
  notify_success      BOOLEAN     NOT NULL DEFAULT FALSE,
  notify_expired      BOOLEAN     NOT NULL DEFAULT TRUE,
  notify_bot_state    BOOLEAN     NOT NULL DEFAULT TRUE,
  is_active           BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tbots_user_id  ON user_telegram_bots (user_id);
CREATE INDEX IF NOT EXISTS idx_tbots_active   ON user_telegram_bots (is_active);

-- ═══════════════════════════════════════════════════════
--  profiles
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS profiles (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  cookies     JSONB       NOT NULL DEFAULT '[]',
  target_url  TEXT        NOT NULL DEFAULT 'https://steamcommunity.com/app/730/tradingforum/',
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles (user_id);

-- ═══════════════════════════════════════════════════════
--  campaigns
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS campaigns (
  id              TEXT        PRIMARY KEY,
  user_id         TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  title_template  TEXT        NOT NULL DEFAULT '',
  body_template   TEXT        NOT NULL DEFAULT '',
  schedule_minutes INTEGER    NOT NULL DEFAULT 60,
  schedule_times  JSONB,
  window_start    TEXT        NOT NULL DEFAULT '00:00',
  window_end      TEXT        NOT NULL DEFAULT '23:59',
  profile_ids     JSONB       NOT NULL DEFAULT '[]',
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user_id  ON campaigns (user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_active   ON campaigns (user_id, is_active);

-- ═══════════════════════════════════════════════════════
--  jobs
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT        PRIMARY KEY,
  user_id      TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id  TEXT        REFERENCES campaigns(id) ON DELETE SET NULL,
  profile_id   TEXT        REFERENCES profiles(id)  ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  executed_at  TIMESTAMPTZ,
  status       TEXT        NOT NULL DEFAULT 'pending',
  title        TEXT,
  body         TEXT,
  topic_url    TEXT,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_status   ON jobs (user_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled     ON jobs (user_id, scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_jobs_campaign      ON jobs (campaign_id, profile_id, status);

-- ═══════════════════════════════════════════════════════
--  user_settings
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_settings (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key      TEXT NOT NULL,
  value    TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, key)
);

-- ═══════════════════════════════════════════════════════
--  refresh_tokens
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address  TEXT,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_rtokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_rtokens_hash    ON refresh_tokens (token_hash);

-- ═══════════════════════════════════════════════════════
--  password_resets
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS password_resets (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
--  payment_transactions
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS payment_transactions (
  id               TEXT        PRIMARY KEY,
  user_id          TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id  TEXT,
  amount           NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency         TEXT        NOT NULL DEFAULT 'USD',
  status           TEXT        NOT NULL,
  plan_id          TEXT,
  billing_period   TEXT,
  payment_method   TEXT,
  external_id      TEXT UNIQUE,
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_txn_user_id ON payment_transactions (user_id);

-- ═══════════════════════════════════════════════════════
--  audit_log
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_log (
  id             TEXT        PRIMARY KEY,
  user_id        TEXT,
  action         TEXT        NOT NULL,
  resource_type  TEXT,
  resource_id    TEXT,
  details        JSONB,
  ip_address     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user_id   ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_log (created_at);
