-- ═══════════════════════════════════════════════════════
--  005: Уникальный частичный индекс для pending-джобов
--  Предотвращает дублирование pending-джобов для одной
--  кампании + профиля (важно для K8s multi-replica)
-- ═══════════════════════════════════════════════════════

-- Сначала удаляем существующие дубликаты
-- (оставляем только самый ранний pending-джоб)
DELETE FROM jobs a
USING jobs b
WHERE a.user_id = b.user_id
  AND a.campaign_id = b.campaign_id
  AND a.profile_id = b.profile_id
  AND a.status = 'pending'
  AND b.status = 'pending'
  AND a.created_at > b.created_at;

-- Уникальный индекс: максимум один pending-джоб для каждой комбинации
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_unique_pending
  ON jobs (user_id, campaign_id, profile_id)
  WHERE status = 'pending';
