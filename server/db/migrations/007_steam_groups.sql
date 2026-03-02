-- 007: Steam-группы — таблица групп, group_ids в кампаниях, max_steam_groups в тарифах
-- Позволяет пользователю выбирать группы для постинга с ограничением по подписке

-- ═══════════════════════════════════════════════════════
--  steam_groups — предзаданный список торговых групп Steam
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS steam_groups (
  id          SERIAL      PRIMARY KEY,
  slug        TEXT        NOT NULL UNIQUE,
  name        TEXT        NOT NULL,
  url         TEXT        NOT NULL,
  avatar_url  TEXT,
  members     INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_steam_groups_active ON steam_groups (is_active);

-- ═══════════════════════════════════════════════════════
--  campaigns.group_ids — массив ID групп для постинга
-- ═══════════════════════════════════════════════════════
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS group_ids JSONB NOT NULL DEFAULT '[]';

-- ═══════════════════════════════════════════════════════
--  jobs.target_group_id — в какую группу постить этот job
-- ═══════════════════════════════════════════════════════
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS target_group_id INTEGER REFERENCES steam_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_target_group ON jobs (target_group_id);

-- ═══════════════════════════════════════════════════════
--  subscription_plans.max_steam_groups — лимит групп
-- ═══════════════════════════════════════════════════════
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS max_steam_groups INTEGER NOT NULL DEFAULT 0;

-- Обновим текущие планы
UPDATE subscription_plans SET max_steam_groups = 3  WHERE id = 'free';
UPDATE subscription_plans SET max_steam_groups = 10 WHERE id = 'starter';
UPDATE subscription_plans SET max_steam_groups = 25 WHERE id = 'pro';
UPDATE subscription_plans SET max_steam_groups = 36 WHERE id = 'enterprise';

-- ═══════════════════════════════════════════════════════
--  Seed: 36 торговых Steam-групп
-- ═══════════════════════════════════════════════════════
INSERT INTO steam_groups (slug, name, url, members, sort_order) VALUES
  ('HLTV',                      'HLTV',                       'https://steamcommunity.com/groups/HLTV/discussions/10/',                      0, 1),
  ('tradingcommunity',          'Trading Community',          'https://steamcommunity.com/groups/tradingcommunity/discussions/0/',            0, 2),
  ('steamtrades',               'Steam Trades',               'https://steamcommunity.com/groups/steamtrades/discussions/0/',                0, 3),
  ('otrade',                    'OTrade',                     'https://steamcommunity.com/groups/otrade/discussions/0/',                     0, 4),
  ('cs-go-fr',                  'CS GO FR',                   'https://steamcommunity.com/groups/cs-go-fr/discussions/0/',                   0, 5),
  ('CCSGO',                     'CCSGO',                      'https://steamcommunity.com/groups/CCSGO/discussions/0/',                      0, 6),
  ('iTraders',                  'iTraders',                   'https://steamcommunity.com/groups/iTraders/discussions/0/',                   0, 7),
  ('TheTradeCenter',            'The Trade Center',           'https://steamcommunity.com/groups/TheTradeCenter/discussions/0/',             0, 8),
  ('tradecenter2016',           'Trade Center 2016',          'https://steamcommunity.com/groups/tradecenter2016/discussions/0/',            0, 9),
  ('community_market',          'Community Market',           'https://steamcommunity.com/groups/community_market/discussions/0/',           0, 10),
  ('tradingcards',              'Trading Cards',              'https://steamcommunity.com/groups/tradingcards/discussions/0/',               0, 11),
  ('FACEITcom',                 'FACEIT',                     'https://steamcommunity.com/groups/FACEITcom/discussions/0/',                  0, 12),
  ('tradecsgo',                 'Trade CSGO',                 'https://steamcommunity.com/groups/tradecsgo/discussions/0/',                  0, 13),
  ('titan',                     'Titan',                      'https://steamcommunity.com/groups/titan/discussions/0/',                      0, 14),
  ('steamanalyst',              'Steam Analyst',              'https://steamcommunity.com/groups/steamanalyst/discussions/0/',               0, 15),
  ('c4rsonline',                'C4RS Online',                'https://steamcommunity.com/groups/c4rsonline/discussions/0/',                 0, 16),
  ('1BUYPOWER',                 'iBUYPOWER',                  'https://steamcommunity.com/groups/1BUYPOWER/discussions/0/',                  0, 17),
  ('SteamInventoryHelper',      'Steam Inventory Helper',     'https://steamcommunity.com/groups/SteamInventoryHelper/discussions/0/',       0, 18),
  ('Original_Traders_Group',    'Original Traders Group',     'https://steamcommunity.com/groups/Original_Traders_Group/discussions/0/',     0, 19),
  ('1TapElite',                 '1Tap Elite',                 'https://steamcommunity.com/groups/1TapElite/discussions/0/',                  0, 20),
  ('csgotradebot',              'CSGO Trade Bot',             'https://steamcommunity.com/groups/csgotradebot/discussions/0/',               0, 21),
  ('SGTTB',                     'SGTTB',                      'https://steamcommunity.com/groups/SGTTB/discussions/0/',                      0, 22),
  ('csgoswap',                  'CSGO Swap',                  'https://steamcommunity.com/groups/csgoswap/discussions/0/',                   0, 23),
  ('LitNetwork',                'Lit Network',                'https://steamcommunity.com/groups/LitNetwork/discussions/0/',                 0, 24),
  ('LitTrading',                'Lit Trading',                'https://steamcommunity.com/groups/LitTrading/discussions/0/',                 0, 25),
  ('focus_csgo',                'Focus CSGO',                 'https://steamcommunity.com/groups/focus_csgo/discussions/0/',                 0, 26),
  ('cs2tradingg',               'CS2 Trading',                'https://steamcommunity.com/groups/cs2tradingg/discussions/0/',                0, 27),
  ('CSGOTRADEme',               'CSGO TRADE Me',              'https://steamcommunity.com/groups/CSGOTRADEme/discussions/0/',                0, 28),
  ('CsDealsOfficial',           'CS Deals Official',          'https://steamcommunity.com/groups/CsDealsOfficial/discussions/0/',            0, 29),
  ('cs__trade',                 'CS Trade',                   'https://steamcommunity.com/groups/cs__trade/discussions/0/',                  0, 30),
  ('BabyGroot_LEVEL_UP_SERVICE','BabyGroot Level Up Service', 'https://steamcommunity.com/groups/BabyGroot_LEVEL_UP_SERVICE/discussions/0/', 0, 31),
  ('CSGOTrader',                'CSGO Trader',                'https://steamcommunity.com/groups/CSGOTrader/discussions/0/',                 0, 32),
  ('SkinsAndMore',              'Skins And More',             'https://steamcommunity.com/groups/SkinsAndMore/discussions/0/',               0, 33),
  ('ohnePixel',                 'ohnePixel',                  'https://steamcommunity.com/groups/ohnePixel/discussions/0/',                  0, 34),
  ('Trading-Lounge',            'Trading Lounge',             'https://steamcommunity.com/groups/Trading-Lounge/discussions/0/',             0, 35),
  ('ChezTrades',                'Chez Trades',                'https://steamcommunity.com/groups/ChezTrades/discussions/0/',                 0, 36)
ON CONFLICT (slug) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  Обновить уникальный индекс pending-джобов
--  Теперь допускаем несколько pending per campaign+profile (по одному на группу)
-- ═══════════════════════════════════════════════════════
DROP INDEX IF EXISTS idx_jobs_unique_pending;
CREATE UNIQUE INDEX idx_jobs_unique_pending
  ON jobs (user_id, campaign_id, profile_id, COALESCE(target_group_id, -1))
  WHERE status = 'pending';
