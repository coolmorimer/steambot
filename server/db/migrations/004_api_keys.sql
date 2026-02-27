-- API Keys for external integrations
CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL DEFAULT 'Default',
  key_hash    VARCHAR(128) NOT NULL UNIQUE,
  key_prefix  VARCHAR(12)  NOT NULL,           -- first 8 chars for display: "spb_xxxx..."
  permissions JSONB        NOT NULL DEFAULT '["read"]',  -- ["read","write","delete"]
  last_used_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user    ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash    ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active  ON api_keys (is_active) WHERE is_active = TRUE;
