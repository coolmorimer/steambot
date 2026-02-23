'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// ── Директория и подключение ───────────────────────────────────────────────
// В упакованном .exe __dirname указывает внутрь .asar — туда нельзя писать.
// electron/main.js заранее устанавливает APP_USER_DATA = app.getPath('userData').
const DATA_DIR = process.env.APP_USER_DATA
  ? path.join(process.env.APP_USER_DATA, 'data')
  : path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, 'bot.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Инициализация схемы ────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    cookies    TEXT NOT NULL,           -- JSON: [{name, value, domain, path, ...}]
    target_url TEXT NOT NULL DEFAULT 'https://steamcommunity.com/app/730/tradingforum/',
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    title_template   TEXT NOT NULL,
    body_template    TEXT NOT NULL,
    schedule_minutes INTEGER NOT NULL,
    window_start     TEXT NOT NULL DEFAULT '00:00',
    window_end       TEXT NOT NULL DEFAULT '23:59',
    profile_ids      TEXT NOT NULL,    -- JSON array: ["id1", "id2"]
    is_active        INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id           TEXT PRIMARY KEY,
    campaign_id  TEXT NOT NULL,
    profile_id   TEXT NOT NULL,
    scheduled_at TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | failed
    title        TEXT NOT NULL,
    body         TEXT NOT NULL,
    topic_url    TEXT,
    error        TEXT,
    created_at   TEXT NOT NULL,
    executed_at  TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_status_scheduled ON jobs(status, scheduled_at);
  CREATE INDEX IF NOT EXISTS idx_jobs_campaign_profile ON jobs(campaign_id, profile_id);
`);

// Миграции — добавляем колонку schedule_times если её нет
try { db.exec("ALTER TABLE campaigns ADD COLUMN schedule_times TEXT"); } catch (_) {}

// Таблица настроек (key-value)
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ═══════════════════════════════════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

function getSetting(key, defaultValue = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const result = {};
  for (const r of rows) result[r.key] = r.value;
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROFILES
// ═══════════════════════════════════════════════════════════════════════════

function addProfile(name, cookies, targetUrl) {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO profiles (id, name, cookies, target_url, is_active, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(id, name, JSON.stringify(cookies), targetUrl || 'https://steamcommunity.com/app/730/tradingforum/', now);
  return id;
}

function getProfiles() {
  return db.prepare('SELECT * FROM profiles ORDER BY created_at DESC').all()
    .map(row => ({ ...row, cookies: JSON.parse(row.cookies) }));
}

function getProfile(id) {
  const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
  if (!row) return null;
  return { ...row, cookies: JSON.parse(row.cookies) };
}

function deleteProfile(id) {
  db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
}

function setProfileActive(id, active) {
  db.prepare('UPDATE profiles SET is_active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

// ═══════════════════════════════════════════════════════════════════════════
//  CAMPAIGNS
// ═══════════════════════════════════════════════════════════════════════════

function addCampaign({ name, titleTemplate, bodyTemplate, scheduleMinutes, scheduleTimes, windowStart, windowEnd, profileIds }) {
  const id = uuidv4();
  const now = new Date().toISOString();
  // Если переданы точные времена — schedule_minutes = 0
  const mins = (scheduleTimes && scheduleTimes.length > 0) ? 0 : (scheduleMinutes || 60);
  db.prepare(`
    INSERT INTO campaigns
      (id, name, title_template, body_template, schedule_minutes, schedule_times, window_start, window_end, profile_ids, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(id, name, titleTemplate, bodyTemplate, mins,
    scheduleTimes ? JSON.stringify(scheduleTimes) : null,
    windowStart || '00:00', windowEnd || '23:59',
    JSON.stringify(profileIds), now);
  return id;
}

function parseCampaign(row) {
  if (!row) return null;
  return {
    ...row,
    profile_ids:    JSON.parse(row.profile_ids),
    schedule_times: row.schedule_times ? JSON.parse(row.schedule_times) : null,
  };
}

function getCampaigns() {
  return db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all().map(parseCampaign);
}

function getCampaign(id) {
  return parseCampaign(db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id));
}

function toggleCampaign(id, enabled) {
  db.prepare('UPDATE campaigns SET is_active = ? WHERE id = ?').run(enabled ? 1 : 0, id);
}

function deleteCampaign(id) {
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
}

// ═══════════════════════════════════════════════════════════════════════════
//  JOBS
// ═══════════════════════════════════════════════════════════════════════════

function createJob({ campaignId, profileId, scheduledAt, title, body }) {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO jobs (id, campaign_id, profile_id, scheduled_at, status, title, body, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(id, campaignId, profileId, scheduledAt, title, body, now);
  return id;
}

/** Все jobs со статусом pending, время которых уже наступило */
function getDueJobs() {
  const now = new Date().toISOString();
  return db.prepare(`
    SELECT j.*
    FROM jobs j
    WHERE j.status = 'pending' AND j.scheduled_at <= ?
    ORDER BY j.scheduled_at ASC
  `).all(now);
}

/** Есть ли уже незавершённый pending-job для данной пары кампания+профиль */
function hasPendingJob(campaignId, profileId) {
  const row = db.prepare(`
    SELECT id FROM jobs
    WHERE campaign_id = ? AND profile_id = ? AND status = 'pending'
    LIMIT 1
  `).get(campaignId, profileId);
  return !!row;
}

/** Последний job (любого статуса) для пары кампания+профиль */
function getLastJob(campaignId, profileId) {
  return db.prepare(`
    SELECT * FROM jobs
    WHERE campaign_id = ? AND profile_id = ?
    ORDER BY scheduled_at DESC
    LIMIT 1
  `).get(campaignId, profileId);
}

function updateJobStatus(id, status, { topicUrl, error, executedAt } = {}) {
  db.prepare(`
    UPDATE jobs
    SET status      = ?,
        topic_url   = COALESCE(?, topic_url),
        error       = COALESCE(?, error),
        executed_at = COALESCE(?, executed_at)
    WHERE id = ? AND status != 'cancelled'
  `).run(status, topicUrl || null, error || null, executedAt || null, id);
}

/** Получить один джоб по id */
function getJob(id) {
  return db.prepare(`
    SELECT j.*,
           p.name AS profile_name,
           c.name AS campaign_name
    FROM jobs j
    LEFT JOIN profiles  p ON j.profile_id  = p.id
    LEFT JOIN campaigns c ON j.campaign_id = c.id
    WHERE j.id = ?
  `).get(id);
}

/** Отменить джоб (pending или running) */
function cancelJob(id) {
  db.prepare(`
    UPDATE jobs
    SET status = 'cancelled',
        error  = 'Отменено пользователем',
        executed_at = ?
    WHERE id = ? AND status IN ('pending', 'running')
  `).run(new Date().toISOString(), id);
}

/** Удалить джоб из истории */
function deleteJob(id) {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
}

/**
 * Отменяет pending-джобы, время которых просрочено более чем на один
 * интервал кампании. Вызывается при старте бота.
 * @returns {number} количество отменённых джобов
 */
function cancelOverduePendingJobs() {
  const campaigns = db.prepare('SELECT id, schedule_minutes, schedule_times FROM campaigns').all();
  let count = 0;

  for (const campaign of campaigns) {
    // Для кампаний с точным временем — порог 3 часа; иначе — один интервал
    const hasTimes = !!campaign.schedule_times;
    let thresholdMs;
    if (hasTimes) {
      thresholdMs = 3 * 60 * 60 * 1000; // 3 часа
    } else {
      thresholdMs = Math.max(campaign.schedule_minutes * 60 * 1000, 30 * 60 * 1000);
    }
    const threshold = new Date(Date.now() - thresholdMs).toISOString();

    const result = db.prepare(`
      UPDATE jobs
      SET status = 'cancelled',
          error  = 'Просрочено — бот не работал',
          executed_at = ?
      WHERE campaign_id = ? AND status = 'pending' AND scheduled_at < ?
    `).run(new Date().toISOString(), campaign.id, threshold);

    count += result.changes;
  }

  return count;
}

/** Последние N записей с именами профиля и кампании */
function getRecentJobs(limit = 20) {
  return db.prepare(`
    SELECT j.*,
           p.name AS profile_name,
           c.name AS campaign_name
    FROM jobs j
    LEFT JOIN profiles  p ON j.profile_id  = p.id
    LEFT JOIN campaigns c ON j.campaign_id = c.id
    ORDER BY j.created_at DESC
    LIMIT ?
  `).all(limit);
}

/** Общее число успешно выполненных постов профиля (счётчик {num}) */
function getProfilePostCount(profileId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS cnt FROM jobs
    WHERE profile_id = ? AND status = 'done'
  `).get(profileId);
  return row ? row.cnt : 0;
}

/** Сброс «зависших» running-джобов при перезапуске бота */
function resetRunningJobs() {
  db.prepare(`
    UPDATE jobs SET status = 'failed', error = 'Bot restarted while running'
    WHERE status = 'running'
  `).run();
}

module.exports = {
  // profiles
  addProfile, getProfiles, getProfile, deleteProfile, setProfileActive,
  // campaigns
  addCampaign, getCampaigns, getCampaign, toggleCampaign, deleteCampaign,
  // jobs
  createJob, getDueJobs, hasPendingJob, getLastJob,
  updateJobStatus, getRecentJobs, getProfilePostCount, resetRunningJobs,
  getJob, cancelJob, deleteJob, cancelOverduePendingJobs, clearFinishedJobs,
  // settings
  getSetting, setSetting, getAllSettings,
};

/** Удалить все завершённые записи (done | failed | cancelled) */
function clearFinishedJobs() {
  return db.prepare(`
    DELETE FROM jobs WHERE status IN ('done', 'failed', 'cancelled')
  `).run().changes;
}
