-- 010_referrals.sql
-- Реферальная программа: обычные пользователи + партнёры (ютуберы)

-- ══ Расширение таблицы users ══
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code  TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by    TEXT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code) WHERE referral_code IS NOT NULL;

-- ══ Партнёрские реферальные программы (ютуберы) ══
CREATE TABLE IF NOT EXISTS partner_referrals (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code               TEXT NOT NULL UNIQUE,
  label              TEXT DEFAULT '',
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  total_referrals    INTEGER NOT NULL DEFAULT 0,
  total_earnings     INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
  updated_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_partner_referrals_user ON partner_referrals(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_referrals_code ON partner_referrals(code);

-- ══ Использования рефералок ══
CREATE TABLE IF NOT EXISTS referral_uses (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  referrer_id          TEXT NOT NULL REFERENCES users(id),
  referred_id          TEXT NOT NULL REFERENCES users(id),
  referral_type        TEXT NOT NULL DEFAULT 'user',
  partner_referral_id  TEXT REFERENCES partner_referrals(id),
  reward_given         BOOLEAN NOT NULL DEFAULT false,
  reward_type          TEXT,
  reward_amount        INTEGER DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_referral_uses_referrer ON referral_uses(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_uses_referred ON referral_uses(referred_id);

-- ══ Партнёрские начисления (% от оплат рефералов) ══
CREATE TABLE IF NOT EXISTS referral_earnings (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  partner_referral_id  TEXT NOT NULL REFERENCES partner_referrals(id),
  referral_use_id      TEXT NOT NULL REFERENCES referral_uses(id),
  payment_id           TEXT,
  amount               INTEGER NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'pending',
  created_at           TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_referral_earnings_partner ON referral_earnings(partner_referral_id);
