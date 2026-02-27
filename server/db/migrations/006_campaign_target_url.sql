-- 006: Добавляем target_url в кампании (раздел Steam-форума)
-- Приоритет: campaign.target_url > profile.target_url > дефолт CS2 Trading

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS target_url TEXT;
