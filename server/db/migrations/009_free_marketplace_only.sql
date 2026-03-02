-- Migration 009: Free plan → только маркет и трейды
-- Обнуляем лимиты постинга для Free, оставляем только маркетплейс/обмен

UPDATE subscription_plans SET
  description         = 'P2P маркет и обмен предметами. Без постинга.',
  max_steam_accounts  = 0,
  max_campaigns       = 0,
  max_jobs_per_day    = 0,
  max_telegram_bots   = 0,
  max_steam_groups    = 0,
  has_mini_app        = FALSE,
  has_ai_templates    = FALSE,
  has_analytics       = FALSE,
  has_priority_support = FALSE,
  has_api_access      = FALSE,
  is_active           = TRUE,
  features            = '["P2P маркет","P2P обмен предметами","Баланс и вывод средств"]'
WHERE id = 'free';
