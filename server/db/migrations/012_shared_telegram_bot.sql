-- 012_shared_telegram_bot.sql
-- Shared Telegram bot: per-user linking instead of per-user bots.
-- Bot token + config stored in server_settings (admin configures).
-- Users link via telegram_chat_id + notification preferences.

-- ══ Add Telegram columns to users table ══
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tg_notify_errors   INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tg_notify_success  INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tg_notify_expired  INTEGER NOT NULL DEFAULT 1;

-- Index for quick chat_id lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

-- ══ Link codes (temporary, for deep-link flow) ══
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code       TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Migrate existing user_telegram_bots data into users table
-- (copy chat_id + prefs from existing bots to their owners)
UPDATE users SET
  telegram_chat_id = (
    SELECT CASE
      WHEN authorized_chat_ids IS NOT NULL AND authorized_chat_ids != '[]'::jsonb
      THEN TRIM(BOTH '"' FROM
        REPLACE(REPLACE(REPLACE(authorized_chat_ids::text, '[', ''), ']', ''), ' ', '')
      )
      ELSE NULL
    END
    FROM user_telegram_bots
    WHERE user_telegram_bots.user_id = users.id
    ORDER BY created_at LIMIT 1
  ),
  tg_notify_errors  = COALESCE((SELECT CASE WHEN notify_errors  THEN 1 ELSE 0 END FROM user_telegram_bots WHERE user_telegram_bots.user_id = users.id ORDER BY created_at LIMIT 1), 1),
  tg_notify_success = COALESCE((SELECT CASE WHEN notify_success THEN 1 ELSE 0 END FROM user_telegram_bots WHERE user_telegram_bots.user_id = users.id ORDER BY created_at LIMIT 1), 1),
  tg_notify_expired = COALESCE((SELECT CASE WHEN notify_expired THEN 1 ELSE 0 END FROM user_telegram_bots WHERE user_telegram_bots.user_id = users.id ORDER BY created_at LIMIT 1), 1)
WHERE EXISTS (SELECT 1 FROM user_telegram_bots WHERE user_telegram_bots.user_id = users.id);
