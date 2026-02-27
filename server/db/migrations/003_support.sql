-- 003_support.sql — Чат поддержки + баг-репорты

CREATE TABLE IF NOT EXISTS support_messages (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction   VARCHAR(4)  NOT NULL DEFAULT 'in',   -- 'in' (user→admin) / 'out' (admin→user)
  body        TEXT        NOT NULL,
  read        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_user ON support_messages(user_id, created_at);

CREATE TABLE IF NOT EXISTS bug_reports (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject     VARCHAR(255) NOT NULL,
  body        TEXT        NOT NULL,
  screenshot  TEXT,          -- base64 data-url
  status      VARCHAR(20) NOT NULL DEFAULT 'open',  -- open / in_progress / closed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bug_reports_user ON bug_reports(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status);
