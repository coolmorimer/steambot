-- Two-Factor Authentication tables

CREATE TABLE IF NOT EXISTS two_factor_settings (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  method     TEXT NOT NULL DEFAULT 'email',
  is_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS two_factor_codes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  used       INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_2fa_codes_user ON two_factor_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_2fa_codes_expires ON two_factor_codes(expires_at);
