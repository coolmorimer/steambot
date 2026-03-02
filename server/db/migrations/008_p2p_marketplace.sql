-- 008_p2p_marketplace.sql
-- P2P маркетплейс: OAuth (Steam/Google), баланс, листинги, трейды, выводы

-- ══ Расширение таблицы users ══
ALTER TABLE users ADD COLUMN IF NOT EXISTS steam_id       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS steam_username  TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS steam_avatar    TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trade_url       TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS balance         INTEGER NOT NULL DEFAULT 0; -- копейки

-- Уникальные индексы для OAuth
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_steam_id  ON users(steam_id)  WHERE steam_id  IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;

-- ══ Маркет-листинги (продажа скинов) ══
CREATE TABLE IF NOT EXISTS market_listings (
  id             SERIAL PRIMARY KEY,
  seller_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_name      TEXT NOT NULL,
  item_image     TEXT DEFAULT '',
  item_exterior  TEXT DEFAULT '',
  item_type      TEXT DEFAULT '',
  item_rarity    TEXT DEFAULT '',
  steam_asset_id TEXT DEFAULT '',
  float_value    DOUBLE PRECISION,
  price          INTEGER NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'RUB',
  status         TEXT NOT NULL DEFAULT 'active',
  buyer_id       TEXT REFERENCES users(id),
  sold_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_listings_seller  ON market_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_status  ON market_listings(status);
CREATE INDEX IF NOT EXISTS idx_market_listings_item    ON market_listings(item_name);

-- ══ Trade offers (P2P обмены) ══
CREATE TABLE IF NOT EXISTS trade_offers (
  id              SERIAL PRIMARY KEY,
  creator_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT DEFAULT '',
  description     TEXT DEFAULT '',
  offering_items  JSONB NOT NULL DEFAULT '[]',
  wanted_items    JSONB NOT NULL DEFAULT '[]',
  wanted_tags     TEXT[] DEFAULT '{}',
  total_value     INTEGER DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active',
  accepted_by     TEXT REFERENCES users(id),
  completed_at    TIMESTAMPTZ,
  bumped_at       TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_offers_creator ON trade_offers(creator_id);
CREATE INDEX IF NOT EXISTS idx_trade_offers_status  ON trade_offers(status);
CREATE INDEX IF NOT EXISTS idx_trade_offers_bumped  ON trade_offers(bumped_at DESC);

-- ══ Транзакции баланса ══
CREATE TABLE IF NOT EXISTS balance_transactions (
  id             SERIAL PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type           TEXT NOT NULL,
  amount         INTEGER NOT NULL,
  balance_after  INTEGER NOT NULL DEFAULT 0,
  description    TEXT DEFAULT '',
  reference_type TEXT DEFAULT '',
  reference_id   TEXT DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'completed',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_balance_tx_user ON balance_transactions(user_id);

-- ══ Запросы на вывод ══
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL,
  method        TEXT NOT NULL DEFAULT 'card',
  details       JSONB DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending',
  admin_note    TEXT DEFAULT '',
  processed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_user   ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_status ON withdrawal_requests(status);
