-- 011_trade_proposals.sql
-- Предложения обмена: пользователь предлагает свои предметы на трейд

CREATE TABLE IF NOT EXISTS trade_proposals (
  id              SERIAL PRIMARY KEY,
  trade_offer_id  INTEGER NOT NULL REFERENCES trade_offers(id) ON DELETE CASCADE,
  proposer_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  items           JSONB NOT NULL DEFAULT '[]',
  message         TEXT DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending',
  decline_reason  TEXT DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_proposals_offer    ON trade_proposals(trade_offer_id);
CREATE INDEX IF NOT EXISTS idx_trade_proposals_proposer ON trade_proposals(proposer_id);
CREATE INDEX IF NOT EXISTS idx_trade_proposals_status   ON trade_proposals(status);
