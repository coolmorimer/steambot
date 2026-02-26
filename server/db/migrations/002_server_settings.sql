-- ═══════════════════════════════════════════════════════
--  server_settings  (global key-value, no user_id)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS server_settings (
  key         TEXT        PRIMARY KEY,
  value       TEXT        NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
