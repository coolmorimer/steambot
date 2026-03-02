'use strict';

/**
 * server/db/sqlite.js
 *
 * Синхронная реализация DAL поверх better-sqlite3.
 * Функции возвращают значения напрямую (не Promise).
 * db/index.js автоматически оборачивает их в Promise.resolve().
 */

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');
const { v4: uuidv4 } = require('uuid');
const config   = require('../config');
const createSchema = require('./schema');

// ── Подключение ──────────────────────────────────────────────────────────────
const dbDir = path.dirname(
  path.isAbsolute(config.db.sqlite.path)
    ? config.db.sqlite.path
    : path.join(__dirname, '..', config.db.sqlite.path)
);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const dbPath = path.isAbsolute(config.db.sqlite.path)
  ? config.db.sqlite.path
  : path.join(__dirname, '..', config.db.sqlite.path);

const _db = new Database(dbPath);
createSchema(_db);

function now() { return new Date().toISOString(); }

// ═══════════════════════════════════════════════════════════════════════════
//  SUBSCRIPTION PLANS
// ═══════════════════════════════════════════════════════════════════════════

function getPlans(activeOnly = true) {
  const sql = activeOnly
    ? 'SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY sort_order'
    : 'SELECT * FROM subscription_plans ORDER BY sort_order';
  return _db.prepare(sql).all().map(parsePlan);
}

function getPlan(id) {
  const row = _db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(id);
  return row ? parsePlan(row) : null;
}

function upsertPlan(plan) {
  const n = now();
  _db.prepare(`
    INSERT INTO subscription_plans
      (id,name,description,price_monthly,price_yearly,
       max_steam_accounts,max_campaigns,max_jobs_per_day,max_telegram_bots,max_steam_groups,
       has_mini_app,has_ai_templates,has_analytics,has_priority_support,has_api_access,
       features,stripe_monthly_price_id,stripe_yearly_price_id,is_active,sort_order,created_at)
    VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,description=excluded.description,
      price_monthly=excluded.price_monthly,price_yearly=excluded.price_yearly,
      max_steam_accounts=excluded.max_steam_accounts,max_campaigns=excluded.max_campaigns,
      max_jobs_per_day=excluded.max_jobs_per_day,max_telegram_bots=excluded.max_telegram_bots,
      max_steam_groups=excluded.max_steam_groups,
      has_mini_app=excluded.has_mini_app,has_ai_templates=excluded.has_ai_templates,
      has_analytics=excluded.has_analytics,has_priority_support=excluded.has_priority_support,
      has_api_access=excluded.has_api_access,features=excluded.features,
      stripe_monthly_price_id=excluded.stripe_monthly_price_id,
      stripe_yearly_price_id=excluded.stripe_yearly_price_id,
      is_active=excluded.is_active,sort_order=excluded.sort_order
  `).run(
    plan.id, plan.name, plan.description || '',
    plan.price_monthly ?? 0, plan.price_yearly ?? 0,
    plan.max_steam_accounts ?? 1, plan.max_campaigns ?? 1,
    plan.max_jobs_per_day ?? 10, plan.max_telegram_bots ?? 0,
    plan.max_steam_groups ?? 0,
    plan.has_mini_app ? 1 : 0, plan.has_ai_templates ? 1 : 0,
    plan.has_analytics ? 1 : 0, plan.has_priority_support ? 1 : 0,
    plan.has_api_access ? 1 : 0,
    JSON.stringify(plan.features || []),
    plan.stripe_monthly_price_id || null,
    plan.stripe_yearly_price_id  || null,
    plan.is_active !== false ? 1 : 0,
    plan.sort_order ?? 0, n
  );
}

function parsePlan(row) {
  return {
    ...row,
    has_mini_app:        !!row.has_mini_app,
    has_ai_templates:    !!row.has_ai_templates,
    has_analytics:       !!row.has_analytics,
    has_priority_support:!!row.has_priority_support,
    has_api_access:      !!row.has_api_access,
    is_active:           !!row.is_active,
    features:            JSON.parse(row.features || '[]'),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  USERS
// ═══════════════════════════════════════════════════════════════════════════

function createUser({ email, passwordHash, name, role = 'user', steamId, steamUsername, steamAvatar, googleId, tradeUrl }) {
  const id = uuidv4();
  const n  = now();
  _db.prepare(`
    INSERT INTO users (id, email, password_hash, name, role, steam_id, steam_username, steam_avatar, google_id, trade_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, (email || '').toLowerCase().trim(), passwordHash, name || '', role,
    steamId || null, steamUsername || '', steamAvatar || '', googleId || null, tradeUrl || '', n, n);
  return id;
}

function getUserBySteamId(steamId) {
  const row = _db.prepare('SELECT * FROM users WHERE steam_id = ?').get(steamId);
  return row ? parseUser(row) : null;
}

function getUserByGoogleId(googleId) {
  const row = _db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
  return row ? parseUser(row) : null;
}

function getUserById(id) {
  const row = _db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return row ? parseUser(row) : null;
}

function getUserByEmail(email) {
  const row = _db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  return row ? parseUser(row) : null;
}

function getAllUsers({ limit = 50, offset = 0, search = '' } = {}) {
  const like = `%${search}%`;
  return _db.prepare(`
    SELECT * FROM users WHERE (name LIKE ? OR email LIKE ?)
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(like, like, limit, offset).map(parseUser);
}

function countUsers() {
  return _db.prepare('SELECT COUNT(*) as n FROM users').get().n;
}

function updateUser(id, fields) {
  const allowed = ['name', 'email', 'role', 'is_active', 'email_verified', 'password_hash',
    'steam_id', 'steam_username', 'steam_avatar', 'google_id', 'trade_url', 'balance'];
  const updates = [], values = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { updates.push(`${k} = ?`); values.push(v); }
  }
  if (!updates.length) return;
  updates.push('updated_at = ?');
  values.push(now(), id);
  _db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

function updateLastLogin(id) {
  _db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), id);
}

function deleteUser(id) {
  _db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

function parseUser(row) {
  const { password_hash, ...rest } = row;
  return { ...rest, email_verified: !!row.email_verified, is_active: !!row.is_active, _password_hash: password_hash };
}

// ═══════════════════════════════════════════════════════════════════════════
//  SUBSCRIPTIONS
// ═══════════════════════════════════════════════════════════════════════════

function createSubscription({ userId, planId, billingPeriod = 'monthly', status = 'trial', trialDays }) {
  const id = uuidv4();
  const n  = now();
  const trialEnd = trialDays ? new Date(Date.now() + trialDays * 86400000).toISOString() : null;
  _db.prepare(`
    INSERT INTO user_subscriptions
      (id, user_id, plan_id, status, billing_period, started_at, trial_ends_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, planId, status, billingPeriod, n, trialEnd, n);
  return id;
}

function getActiveSubscription(userId) {
  return _db.prepare(`
    SELECT s.*, p.max_steam_accounts, p.max_campaigns, p.max_jobs_per_day,
           p.max_telegram_bots, p.max_steam_groups,
           p.has_mini_app, p.has_ai_templates,
           p.has_analytics, p.has_priority_support, p.has_api_access,
           p.name as plan_name, p.features
    FROM user_subscriptions s
    JOIN subscription_plans p ON s.plan_id = p.id
    WHERE s.user_id = ? AND s.status IN ('trial', 'active')
    ORDER BY s.created_at DESC LIMIT 1
  `).get(userId);
}

function getSubscriptionHistory(userId) {
  return _db.prepare(`
    SELECT s.*, p.name as plan_name FROM user_subscriptions s
    JOIN subscription_plans p ON s.plan_id = p.id
    WHERE s.user_id = ? ORDER BY s.created_at DESC
  `).all(userId);
}

function updateSubscription(id, fields) {
  const allowed = ['status','billing_period','expires_at','trial_ends_at',
                   'stripe_subscription_id','stripe_customer_id','cancelled_at','cancel_reason'];
  const updates = [], values = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { updates.push(`${k} = ?`); values.push(v); }
  }
  if (!updates.length) return;
  values.push(id);
  _db.prepare(`UPDATE user_subscriptions SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

function getSubscriptionByStripeId(stripeSubId) {
  return _db.prepare('SELECT * FROM user_subscriptions WHERE stripe_subscription_id = ?').get(stripeSubId);
}

function getUserByStripeCustomer(stripeCustomerId) {
  const sub = _db.prepare('SELECT user_id FROM user_subscriptions WHERE stripe_customer_id = ? LIMIT 1').get(stripeCustomerId);
  return sub ? getUserById(sub.user_id) : null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  TELEGRAM BOTS
// ═══════════════════════════════════════════════════════════════════════════

function getTelegramBot(userId) {
  return _db.prepare('SELECT * FROM user_telegram_bots WHERE user_id = ? ORDER BY created_at LIMIT 1').get(userId);
}

function getTelegramBots(userId) {
  return _db.prepare('SELECT * FROM user_telegram_bots WHERE user_id = ? ORDER BY created_at').all(userId);
}

function getTelegramBotByAuthorizedChatId(chatId) {
  const bots = _db.prepare('SELECT * FROM user_telegram_bots WHERE is_active = 1').all();
  const cid = String(chatId);
  for (const bot of bots) {
    try {
      const ids = JSON.parse(bot.authorized_chat_ids || '[]');
      if (ids.length && (ids.includes(chatId) || ids.includes(cid))) return bot;
    } catch {}
  }
  return null;
}

function getAllTelegramBotsByAuthorizedChatId(chatId) {
  const bots = _db.prepare('SELECT * FROM user_telegram_bots WHERE is_active = 1').all();
  const cid = String(chatId);
  const result = [];
  for (const bot of bots) {
    try {
      const ids = JSON.parse(bot.authorized_chat_ids || '[]');
      if (ids.length && (ids.includes(chatId) || ids.includes(cid))) result.push(bot);
    } catch {}
  }
  return result;
}

function upsertTelegramBot(userId, data) {
  const existing = getTelegramBot(userId);
  if (existing) {
    _db.prepare(`
      UPDATE user_telegram_bots SET
        label=?,bot_token=?,bot_username=?,authorized_chat_ids=?,
        mini_app_url=?,notify_errors=?,notify_success=?,notify_expired=?,
        notify_bot_state=?,is_active=?
      WHERE id=?
    `).run(
      data.label || existing.label, data.bot_token,
      data.bot_username || existing.bot_username,
      JSON.stringify(data.authorized_chat_ids || JSON.parse(existing.authorized_chat_ids)),
      data.mini_app_url || existing.mini_app_url,
      data.notify_errors   !== undefined ? (data.notify_errors   ? 1 : 0) : existing.notify_errors,
      data.notify_success  !== undefined ? (data.notify_success  ? 1 : 0) : existing.notify_success,
      data.notify_expired  !== undefined ? (data.notify_expired  ? 1 : 0) : existing.notify_expired,
      data.notify_bot_state !== undefined ? (data.notify_bot_state ? 1 : 0) : existing.notify_bot_state,
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : existing.is_active,
      existing.id
    );
    return existing.id;
  } else {
    const id = uuidv4();
    _db.prepare(`
      INSERT INTO user_telegram_bots
        (id,user_id,label,bot_token,bot_username,authorized_chat_ids,
         mini_app_url,notify_errors,notify_success,notify_expired,notify_bot_state,is_active,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id, userId, data.label || 'Main Bot', data.bot_token,
      data.bot_username || null,
      JSON.stringify(data.authorized_chat_ids || []),
      data.mini_app_url || null,
      data.notify_errors   !== false ? 1 : 0,
      data.notify_success  ? 1 : 0,
      data.notify_expired  !== false ? 1 : 0,
      data.notify_bot_state !== false ? 1 : 0,
      data.is_active ? 1 : 0, now()
    );
    return id;
  }
}

function deleteTelegramBot(id, userId) {
  _db.prepare('DELETE FROM user_telegram_bots WHERE id = ? AND user_id = ?').run(id, userId);
}

function getActiveTelegramBotUsers() {
  return _db.prepare(`
    SELECT t.*, u.id as user_id
    FROM user_telegram_bots t
    JOIN users u ON u.id = t.user_id
    WHERE t.is_active = 1 AND u.is_active = 1
  `).all();
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROFILES
// ═══════════════════════════════════════════════════════════════════════════

function addProfile(userId, { name, cookies, targetUrl }) {
  const id = uuidv4();
  _db.prepare(`
    INSERT INTO profiles (id, user_id, name, cookies, target_url, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `).run(id, userId, name, JSON.stringify(cookies),
    targetUrl || 'https://steamcommunity.com/app/730/tradingforum/', now());
  return id;
}

function getProfiles(userId) {
  return _db.prepare('SELECT * FROM profiles WHERE user_id = ? ORDER BY created_at DESC').all(userId)
    .map(r => ({ ...r, cookies: JSON.parse(r.cookies), is_active: !!r.is_active }));
}

function getProfile(id, userId) {
  const row = _db.prepare('SELECT * FROM profiles WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) return null;
  return { ...row, cookies: JSON.parse(row.cookies), is_active: !!row.is_active };
}

function updateProfile(id, userId, fields) {
  const allowed = ['name', 'cookies', 'target_url', 'is_active'];
  const updates = [], values = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) {
      updates.push(`${k} = ?`);
      values.push(k === 'cookies' ? JSON.stringify(v) : v);
    }
  }
  if (!updates.length) return;
  values.push(id, userId);
  _db.prepare(`UPDATE profiles SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
}

function deleteProfile(id, userId) {
  _db.prepare('DELETE FROM profiles WHERE id = ? AND user_id = ?').run(id, userId);
}

function countProfiles(userId) {
  return _db.prepare('SELECT COUNT(*) as n FROM profiles WHERE user_id = ?').get(userId).n;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CAMPAIGNS
// ═══════════════════════════════════════════════════════════════════════════

function addCampaign(userId, { name, titleTemplate, bodyTemplate, scheduleMinutes,
                               scheduleTimes, windowStart, windowEnd, profileIds, targetUrl, groupIds }) {
  const id   = uuidv4();
  const mins = (scheduleTimes && scheduleTimes.length > 0) ? 0 : (scheduleMinutes || 60);
  _db.prepare(`
    INSERT INTO campaigns
      (id, user_id, name, title_template, body_template, schedule_minutes,
       schedule_times, window_start, window_end, profile_ids, is_active, created_at, target_url, group_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(id, userId, name, titleTemplate, bodyTemplate, mins,
    scheduleTimes ? JSON.stringify(scheduleTimes) : null,
    windowStart || '00:00', windowEnd || '23:59',
    JSON.stringify(profileIds || []), now(),
    targetUrl || null,
    JSON.stringify(groupIds || []));
  return id;
}

function getCampaigns(userId) {
  return _db.prepare('SELECT * FROM campaigns WHERE user_id = ? ORDER BY created_at DESC').all(userId)
    .map(parseCampaign);
}

function getCampaign(id, userId) {
  const row = _db.prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?').get(id, userId);
  return row ? parseCampaign(row) : null;
}

function updateCampaign(id, userId, fields) {
  const allowed = ['name','title_template','body_template','schedule_minutes',
                   'schedule_times','window_start','window_end','profile_ids','is_active','target_url','group_ids'];
  const updates = [], values = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) {
      updates.push(`${k} = ?`);
      const serialized = ['schedule_times','profile_ids','group_ids'].includes(k) && typeof v !== 'string'
        ? JSON.stringify(v) : v;
      values.push(serialized);
    }
  }
  if (!updates.length) return;
  values.push(id, userId);
  _db.prepare(`UPDATE campaigns SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
}

function deleteCampaign(id, userId) {
  _db.prepare('DELETE FROM campaigns WHERE id = ? AND user_id = ?').run(id, userId);
}

function countCampaigns(userId) {
  return _db.prepare('SELECT COUNT(*) as n FROM campaigns WHERE user_id = ?').get(userId).n;
}

function parseCampaign(row) {
  return {
    ...row,
    is_active:      !!row.is_active,
    profile_ids:    JSON.parse(row.profile_ids  || '[]'),
    group_ids:      JSON.parse(row.group_ids    || '[]'),
    schedule_times: row.schedule_times ? JSON.parse(row.schedule_times) : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  JOBS
// ═══════════════════════════════════════════════════════════════════════════

function addJob(userId, { campaignId, profileId, scheduledAt, title, body, targetGroupId }) {
  const id = uuidv4();
  _db.prepare(`
    INSERT INTO jobs (id, user_id, campaign_id, profile_id, scheduled_at, status, title, body, created_at, target_group_id)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `).run(id, userId, campaignId, profileId, scheduledAt, title, body, now(), targetGroupId || null);
  return id;
}

function getDueJobs(userId) {
  const ts = new Date().toISOString();
  return _db.prepare(`
    SELECT * FROM jobs
    WHERE user_id = ? AND status = 'pending' AND scheduled_at <= ?
    ORDER BY scheduled_at LIMIT 50
  `).all(userId, ts);
}

function getRecentJobs(userId, limit = 50) {
  return _db.prepare(`
    SELECT j.*, p.name as profile_name, c.name as campaign_name
    FROM jobs j
    LEFT JOIN profiles  p ON j.profile_id  = p.id
    LEFT JOIN campaigns c ON j.campaign_id = c.id
    WHERE j.user_id = ? ORDER BY j.created_at DESC LIMIT ?
  `).all(userId, limit);
}

function getJobsPaged(userId, { limit = 20, offset = 0, status = null } = {}) {
  const where = status && status !== 'all' ? 'WHERE j.user_id = ? AND j.status = ?' : 'WHERE j.user_id = ?';
  const params = status && status !== 'all' ? [userId, status] : [userId];
  const total = _db.prepare(`SELECT COUNT(*) as n FROM jobs j ${where}`).get(...params).n;
  const jobs  = _db.prepare(`
    SELECT j.*, p.name as profile_name, c.name as campaign_name
    FROM jobs j
    LEFT JOIN profiles  p ON j.profile_id  = p.id
    LEFT JOIN campaigns c ON j.campaign_id = c.id
    ${where} ORDER BY j.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  return { jobs, total };
}

function getJobStats(userId) {
  return _db.prepare('SELECT status, COUNT(*) as count FROM jobs WHERE user_id = ? GROUP BY status').all(userId);
}

function countJobsToday(userId) {
  const today = new Date().toISOString().split('T')[0];
  return _db.prepare(`
    SELECT COUNT(*) as n FROM jobs WHERE user_id = ? AND status = 'done' AND date(executed_at) = ?
  `).get(userId, today).n;
}

function updateJobStatus(id, userId, status, extra = {}) {
  const fields = { status, ...extra };
  if (['running','done','failed'].includes(status)) fields.executed_at = now();
  const updates = Object.keys(fields).map(k => `${k} = ?`);
  _db.prepare(`UPDATE jobs SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`)
    .run(...Object.values(fields), id, userId);
}

function resetRunningJobs(userId) {
  _db.prepare(`UPDATE jobs SET status = 'pending' WHERE user_id = ? AND status = 'running'`).run(userId);
}

function cancelOverduePendingJobs(userId) {
  const limit = new Date(Date.now() - 2 * 3600000).toISOString();
  const info = _db.prepare(`
    UPDATE jobs SET status = 'cancelled' WHERE user_id = ? AND status = 'pending' AND scheduled_at < ?
  `).run(userId, limit);
  return info.changes;
}

function deleteJob(id, userId) {
  _db.prepare('DELETE FROM jobs WHERE id = ? AND user_id = ?').run(id, userId);
}

function deletePendingJobsByCampaign(campaignId, userId) {
  _db.prepare(`DELETE FROM jobs WHERE campaign_id = ? AND user_id = ? AND status = 'pending'`).run(campaignId, userId);
}

// ─── Хелперы для SteamBotManager ─────────────────────────────────────────────

function getLastJobForCampaignProfile(userId, campaignId, profileId, targetGroupId = null) {
  if (targetGroupId) {
    return _db.prepare(`
      SELECT * FROM jobs WHERE user_id = ? AND campaign_id = ? AND profile_id = ? AND target_group_id = ?
      ORDER BY scheduled_at DESC LIMIT 1
    `).get(userId, campaignId, profileId, targetGroupId);
  }
  return _db.prepare(`
    SELECT * FROM jobs WHERE user_id = ? AND campaign_id = ? AND profile_id = ? AND target_group_id IS NULL
    ORDER BY scheduled_at DESC LIMIT 1
  `).get(userId, campaignId, profileId);
}

function getPendingJobForCampaignProfile(userId, campaignId, profileId, targetGroupId = null) {
  if (targetGroupId) {
    return _db.prepare(`
      SELECT id FROM jobs
      WHERE user_id = ? AND campaign_id = ? AND profile_id = ? AND target_group_id = ? AND status = 'pending' LIMIT 1
    `).get(userId, campaignId, profileId, targetGroupId);
  }
  return _db.prepare(`
    SELECT id FROM jobs
    WHERE user_id = ? AND campaign_id = ? AND profile_id = ? AND target_group_id IS NULL AND status = 'pending' LIMIT 1
  `).get(userId, campaignId, profileId);
}

// ═══════════════════════════════════════════════════════════════════════════
//  STEAM GROUPS
// ═══════════════════════════════════════════════════════════════════════════

function getSteamGroups(activeOnly = true) {
  return activeOnly
    ? _db.prepare('SELECT * FROM steam_groups WHERE is_active = 1 ORDER BY sort_order').all()
    : _db.prepare('SELECT * FROM steam_groups ORDER BY sort_order').all();
}

function getSteamGroup(id) {
  return _db.prepare('SELECT * FROM steam_groups WHERE id = ?').get(id) || null;
}

function getSteamGroupsByIds(ids) {
  if (!ids || !ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return _db.prepare(`SELECT * FROM steam_groups WHERE id IN (${placeholders}) ORDER BY sort_order`).all(...ids);
}

// ═══════════════════════════════════════════════════════════════════════════
//  USER SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

function getSetting(userId, key, defaultValue = null) {
  const row = _db.prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?').get(userId, key);
  return row ? row.value : defaultValue;
}

function setSetting(userId, key, value) {
  _db.prepare('INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)').run(userId, key, value);
}

function getAllSettings(userId) {
  const rows = _db.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').all(userId);
  const result = {};
  for (const r of rows) result[r.key] = r.value;
  return result;
}

function bulkSetSettings(userId, kvMap) {
  const stmt = _db.prepare('INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)');
  _db.transaction(() => { for (const [k, v] of Object.entries(kvMap)) stmt.run(userId, k, v); })();
}

// ═══════════════════════════════════════════════════════════════════════════
//  SERVER SETTINGS (global key-value)
// ═══════════════════════════════════════════════════════════════════════════

function getServerSetting(key, defaultValue = null) {
  const row = _db.prepare('SELECT value FROM server_settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

function setServerSetting(key, value) {
  const now = new Date().toISOString();
  _db.prepare('INSERT OR REPLACE INTO server_settings (key, value, updated_at) VALUES (?, ?, ?)').run(key, value, now);
}

function getAllServerSettings() {
  const rows = _db.prepare('SELECT key, value, updated_at FROM server_settings').all();
  const result = {};
  for (const r of rows) result[r.key] = r.value;
  return result;
}

function bulkSetServerSettings(kvMap) {
  const now = new Date().toISOString();
  const stmt = _db.prepare('INSERT OR REPLACE INTO server_settings (key, value, updated_at) VALUES (?, ?, ?)');
  _db.transaction(() => { for (const [k, v] of Object.entries(kvMap)) stmt.run(k, String(v), now); })();
}

// ═══════════════════════════════════════════════════════════════════════════
//  REFRESH TOKENS
// ═══════════════════════════════════════════════════════════════════════════

function createRefreshToken(userId, tokenHash, expiresAt, { ip, ua } = {}) {
  const id = uuidv4();
  _db.prepare(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, tokenHash, expiresAt, now(), ip || null, ua || null);
  return id;
}

function getRefreshToken(tokenHash) {
  return _db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(tokenHash);
}

function deleteRefreshToken(tokenHash) {
  _db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(tokenHash);
}

function deleteUserRefreshTokens(userId) {
  _db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
}

function expireTrialSubscriptions(now) {
  _db.prepare(`UPDATE user_subscriptions SET status='expired'
    WHERE status='trial' AND trial_ends_at IS NOT NULL AND trial_ends_at < ?`).run(now);
}

function expireActiveSubscriptions(now) {
  _db.prepare(`UPDATE user_subscriptions SET status='expired'
    WHERE status='active' AND expires_at IS NOT NULL AND expires_at < ?`).run(now);
}

function cleanExpiredTokens() {
  _db.prepare('DELETE FROM refresh_tokens WHERE expires_at < ?').run(now());
}

// ═══════════════════════════════════════════════════════════════════════════
//  PASSWORD RESETS
// ═══════════════════════════════════════════════════════════════════════════

function createPasswordReset(userId, token, expiresAt) {
  _db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
  _db.prepare(`
    INSERT INTO password_resets (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)
  `).run(uuidv4(), userId, token, expiresAt, now());
}

function getPasswordReset(token) {
  return _db.prepare('SELECT * FROM password_resets WHERE token = ? AND used = 0').get(token);
}

function markPasswordResetUsed(id) {
  _db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(id);
}

// ═══════════════════════════════════════════════════════════════════════════
//  PAYMENT TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════

function createTransaction({ userId, subscriptionId, amount, currency = 'RUB', status,
                              planId, billingPeriod, paymentMethod, externalId, metadata }) {
  const id = uuidv4();
  _db.prepare(`
    INSERT INTO payment_transactions
      (id, user_id, subscription_id, amount, currency, status,
       plan_id, billing_period, payment_method, external_id, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, subscriptionId || null, amount, currency, status,
    planId || null, billingPeriod || null, paymentMethod || null,
    externalId || null, metadata ? JSON.stringify(metadata) : null, now());
  return id;
}

function getTransactions(userId, limit = 20) {
  return _db.prepare(`
    SELECT * FROM payment_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(userId, limit);
}

function updateTransactionStatus(externalId, status) {
  _db.prepare('UPDATE payment_transactions SET status = ? WHERE external_id = ?').run(status, externalId);
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN STATS
// ═══════════════════════════════════════════════════════════════════════════

function getAdminStats() {
  const today = new Date().toISOString().split('T')[0];
  const month30 = new Date(Date.now() - 30 * 86400000).toISOString();

  const tu = _db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  const au = _db.prepare("SELECT COUNT(*) as n FROM users WHERE is_active = 1").get().n;
  const tr = _db.prepare("SELECT COUNT(*) as n FROM user_subscriptions WHERE status = 'trial'").get().n;
  const ac = _db.prepare("SELECT COUNT(*) as n FROM user_subscriptions WHERE status = 'active'").get().n;
  const tp = _db.prepare('SELECT COUNT(*) as n FROM profiles').get().n;
  const tc = _db.prepare('SELECT COUNT(*) as n FROM campaigns WHERE is_active = 1').get().n;
  const jt = _db.prepare("SELECT COUNT(*) as n FROM jobs WHERE status='done' AND date(executed_at)=?").get(today).n;
  const rev = _db.prepare("SELECT COALESCE(SUM(amount),0) as n FROM payment_transactions WHERE status='completed' AND payment_method != 'manual'").get().n;
  const rev30 = _db.prepare("SELECT COALESCE(SUM(amount),0) as n FROM payment_transactions WHERE status='completed' AND payment_method != 'manual' AND created_at >= ?").get(month30).n;
  const txCount = _db.prepare('SELECT COUNT(*) as n FROM payment_transactions').get().n;
  const txPending = _db.prepare("SELECT COUNT(*) as n FROM payment_transactions WHERE status='pending'").get().n;
  const mrrVal = _db.prepare(`
    SELECT COALESCE(SUM(p.price_monthly),0) as mrr
    FROM user_subscriptions s
    JOIN subscription_plans p ON p.id = s.plan_id
    WHERE s.status = 'active'
      AND EXISTS (
        SELECT 1 FROM payment_transactions t
        WHERE t.subscription_id = s.id
          AND t.status = 'completed'
          AND t.payment_method != 'manual'
      )
  `).get().mrr;
  const recentTx = _db.prepare(`
    SELECT t.*, u.email as user_email, u.name as user_name
    FROM payment_transactions t
    LEFT JOIN users u ON u.id = t.user_id
    ORDER BY t.created_at DESC LIMIT 5
  `).all();
  const planDist = _db.prepare(`
    SELECT s.plan_id, p.name as plan_name, COUNT(*) as count
    FROM user_subscriptions s
    LEFT JOIN subscription_plans p ON p.id = s.plan_id
    WHERE s.status IN ('active','trial')
    GROUP BY s.plan_id, p.name
    ORDER BY count DESC
  `).all();

  return {
    users: { total: tu, active: au },
    subscriptions: { active: ac, trial: tr },
    jobs: { today: jt },
    revenue: { total: rev, last30d: rev30, mrr: mrrVal },
    payments: { total: txCount, pending: txPending },
    total_profiles: tp,
    total_campaigns: tc,
    recent_transactions: recentTx,
    plan_distribution: planDist,
    total_users: tu, active_users: au,
    trial_subscriptions: tr, active_subscriptions: ac,
    jobs_today: jt, revenue_total: rev,
  };
}

function getAdminUserList({ limit = 50, offset = 0, search = '' } = {}) {
  const like = `%${search}%`;
  return _db.prepare(`
    SELECT u.*,
      s.plan_id, s.status as sub_status, s.expires_at, s.trial_ends_at,
      p.name as plan_name,
      (SELECT COUNT(*) FROM profiles pr WHERE pr.user_id = u.id)  as profiles_count,
      (SELECT COUNT(*) FROM campaigns c WHERE c.user_id = u.id)   as campaigns_count,
      (SELECT COUNT(*) FROM jobs j WHERE j.user_id = u.id AND j.status = 'done') as jobs_done
    FROM users u
    LEFT JOIN user_subscriptions s ON s.user_id = u.id AND s.status IN ('trial','active')
    LEFT JOIN subscription_plans p ON p.id = s.plan_id
    WHERE u.name LIKE ? OR u.email LIKE ?
    ORDER BY u.created_at DESC LIMIT ? OFFSET ?
  `).all(like, like, limit, offset);
}

function getAdminTransactions({ limit = 50, offset = 0, status, method, search } = {}) {
  let where = 'WHERE 1=1';
  const params = [];
  if (status) { where += ' AND t.status = ?'; params.push(status); }
  if (method) { where += ' AND t.payment_method = ?'; params.push(method); }
  if (search) { where += ' AND (u.email LIKE ? OR u.name LIKE ? OR t.external_id LIKE ?)'; params.push(`%${search}%`,`%${search}%`,`%${search}%`); }
  const total = _db.prepare(`SELECT COUNT(*) as n FROM payment_transactions t LEFT JOIN users u ON u.id = t.user_id ${where}`).get(...params).n;
  params.push(limit, offset);
  const transactions = _db.prepare(`
    SELECT t.*, u.email as user_email, u.name as user_name, p.name as plan_name
    FROM payment_transactions t
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN subscription_plans p ON p.id = t.plan_id
    ${where}
    ORDER BY t.created_at DESC LIMIT ? OFFSET ?
  `).all(...params);
  return { transactions, total };
}

function getTransactionById(id) {
  return _db.prepare(`
    SELECT t.*, u.email as user_email, u.name as user_name, p.name as plan_name
    FROM payment_transactions t LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN subscription_plans p ON p.id = t.plan_id WHERE t.id = ?
  `).get(id);
}

function getTransactionByExternalId(externalId) {
  return _db.prepare(`
    SELECT t.*, u.email as user_email, u.name as user_name, p.name as plan_name
    FROM payment_transactions t LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN subscription_plans p ON p.id = t.plan_id WHERE t.external_id = ?
  `).get(externalId);
}

function updateTransaction(id, updates) {
  const sets = []; const vals = [];
  for (const [k, v] of Object.entries(updates)) { sets.push(`${k} = ?`); vals.push(v); }
  if (sets.length === 0) return;
  vals.push(id);
  _db.prepare(`UPDATE payment_transactions SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

function getPaymentStats() {
  const month30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const week7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const today = new Date().toISOString().split('T')[0];
  return {
    counts: {
      total: _db.prepare('SELECT COUNT(*) as n FROM payment_transactions').get().n,
      completed: _db.prepare("SELECT COUNT(*) as n FROM payment_transactions WHERE status='completed'").get().n,
      pending: _db.prepare("SELECT COUNT(*) as n FROM payment_transactions WHERE status='pending'").get().n,
      failed: _db.prepare("SELECT COUNT(*) as n FROM payment_transactions WHERE status='failed'").get().n,
      refunded: _db.prepare("SELECT COUNT(*) as n FROM payment_transactions WHERE status='refunded'").get().n,
    },
    revenue: {
      total: _db.prepare("SELECT COALESCE(SUM(amount),0) as n FROM payment_transactions WHERE status='completed' AND payment_method != 'manual'").get().n,
      last30d: _db.prepare("SELECT COALESCE(SUM(amount),0) as n FROM payment_transactions WHERE status='completed' AND payment_method != 'manual' AND created_at >= ?").get(month30).n,
      last7d: _db.prepare("SELECT COALESCE(SUM(amount),0) as n FROM payment_transactions WHERE status='completed' AND payment_method != 'manual' AND created_at >= ?").get(week7).n,
      today: _db.prepare("SELECT COALESCE(SUM(amount),0) as n FROM payment_transactions WHERE status='completed' AND payment_method != 'manual' AND date(created_at) = ?").get(today).n,
    },
    byMethod: _db.prepare(`SELECT payment_method as method, COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM payment_transactions WHERE status='completed' AND payment_method != 'manual' GROUP BY payment_method`).all(),
    byPlan: _db.prepare(`SELECT t.plan_id, p.name as plan_name, COUNT(*) as count, COALESCE(SUM(t.amount),0) as total FROM payment_transactions t LEFT JOIN subscription_plans p ON p.id = t.plan_id WHERE t.status='completed' AND t.payment_method != 'manual' GROUP BY t.plan_id, p.name`).all(),
    dailyRevenue: _db.prepare(`SELECT date(created_at) as date, COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM payment_transactions WHERE status='completed' AND payment_method != 'manual' AND created_at >= ? GROUP BY date(created_at) ORDER BY date`).all(month30),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════

function auditLog(userId, action, resourceType, resourceId, details, ip) {
  _db.prepare(`
    INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), userId || null, action, resourceType || null, resourceId || null,
    details ? JSON.stringify(details) : null, ip || null, now());
}

// ═══════════════════════════════════════════════════════════════════════════
//  MARKET LISTINGS
// ═══════════════════════════════════════════════════════════════════════════

function createMarketListing({ sellerId, itemName, itemImage, itemExterior, itemType, itemRarity, steamAssetId, floatValue, price, currency }) {
  const n = now();
  const info = _db.prepare(`
    INSERT INTO market_listings (seller_id, item_name, item_image, item_exterior, item_type, item_rarity, steam_asset_id, float_value, price, currency, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(sellerId, itemName, itemImage || '', itemExterior || '', itemType || '', itemRarity || '', steamAssetId || '', floatValue || null, price, currency || 'RUB', n, n);
  return info.lastInsertRowid;
}

function getMarketListings({ status = 'active', search = '', type = '', exterior = '', sort = 'newest', limit = 40, offset = 0 } = {}) {
  let sql = `SELECT ml.*, u.name as seller_name, u.steam_username, u.steam_avatar
    FROM market_listings ml JOIN users u ON ml.seller_id = u.id WHERE ml.status = ?`;
  const params = [status];
  if (search) { sql += ' AND ml.item_name LIKE ?'; params.push(`%${search}%`); }
  if (type) { sql += ' AND ml.item_type = ?'; params.push(type); }
  if (exterior) { sql += ' AND ml.item_exterior = ?'; params.push(exterior); }
  if (sort === 'price_asc') sql += ' ORDER BY ml.price ASC';
  else if (sort === 'price_desc') sql += ' ORDER BY ml.price DESC';
  else sql += ' ORDER BY ml.created_at DESC';
  sql += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return _db.prepare(sql).all(...params);
}

function countMarketListings({ status = 'active', search = '', type = '', exterior = '' } = {}) {
  let sql = 'SELECT COUNT(*) as n FROM market_listings WHERE status = ?';
  const params = [status];
  if (search) { sql += ' AND item_name LIKE ?'; params.push(`%${search}%`); }
  if (type) { sql += ' AND item_type = ?'; params.push(type); }
  if (exterior) { sql += ' AND item_exterior = ?'; params.push(exterior); }
  return _db.prepare(sql).get(...params).n;
}

function getMarketListing(id) {
  return _db.prepare(`SELECT ml.*, u.name as seller_name, u.steam_username, u.steam_avatar, u.trade_url as seller_trade_url
    FROM market_listings ml JOIN users u ON ml.seller_id = u.id WHERE ml.id = ?`).get(id) || null;
}

function getUserMarketListings(userId) {
  return _db.prepare('SELECT * FROM market_listings WHERE seller_id = ? ORDER BY created_at DESC').all(userId);
}

function updateMarketListing(id, fields) {
  const allowed = ['price', 'status', 'buyer_id', 'sold_at'];
  const updates = [], values = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { updates.push(`${k} = ?`); values.push(v); }
  }
  if (!updates.length) return;
  updates.push('updated_at = ?');
  values.push(now(), id);
  _db.prepare(`UPDATE market_listings SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

function deleteMarketListing(id, sellerId) {
  _db.prepare('DELETE FROM market_listings WHERE id = ? AND seller_id = ?').run(id, sellerId);
}

// ═══════════════════════════════════════════════════════════════════════════
//  TRADE OFFERS
// ═══════════════════════════════════════════════════════════════════════════

function createTradeOffer({ creatorId, title, description, offeringItems, wantedItems, wantedTags, totalValue }) {
  const n = now();
  const info = _db.prepare(`
    INSERT INTO trade_offers (creator_id, title, description, offering_items, wanted_items, wanted_tags, total_value, bumped_at, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(creatorId, title || '', description || '',
    JSON.stringify(offeringItems || []), JSON.stringify(wantedItems || []),
    JSON.stringify(wantedTags || []), totalValue || 0, n, n, n);
  return info.lastInsertRowid;
}

function getTradeOffers({ status = 'active', search = '', sort = 'bumped', limit = 20, offset = 0 } = {}) {
  let sql = `SELECT t.*, u.name as creator_name, u.steam_username, u.steam_avatar, u.trade_url as creator_trade_url
    FROM trade_offers t JOIN users u ON t.creator_id = u.id WHERE t.status = ?`;
  const params = [status];
  if (search) { sql += ' AND (t.title LIKE ? OR t.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (sort === 'newest') sql += ' ORDER BY t.created_at DESC';
  else if (sort === 'value_desc') sql += ' ORDER BY t.total_value DESC';
  else sql += ' ORDER BY t.bumped_at DESC';
  sql += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return _db.prepare(sql).all(...params).map(parseTradeOffer);
}

function countTradeOffers({ status = 'active', search = '' } = {}) {
  let sql = 'SELECT COUNT(*) as n FROM trade_offers WHERE status = ?';
  const params = [status];
  if (search) { sql += ' AND (title LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  return _db.prepare(sql).get(...params).n;
}

function getTradeOffer(id) {
  const row = _db.prepare(`SELECT t.*, u.name as creator_name, u.steam_username, u.steam_avatar, u.trade_url as creator_trade_url
    FROM trade_offers t JOIN users u ON t.creator_id = u.id WHERE t.id = ?`).get(id);
  return row ? parseTradeOffer(row) : null;
}

function getUserTradeOffers(userId) {
  return _db.prepare('SELECT * FROM trade_offers WHERE creator_id = ? ORDER BY created_at DESC').all(userId).map(parseTradeOffer);
}

function updateTradeOffer(id, fields) {
  const allowed = ['title', 'description', 'status', 'accepted_by', 'completed_at'];
  const jsonFields = ['offering_items', 'wanted_items'];
  const updates = [], values = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { updates.push(`${k} = ?`); values.push(v); }
    else if (jsonFields.includes(k)) { updates.push(`${k} = ?`); values.push(JSON.stringify(v)); }
    else if (k === 'wanted_tags') { updates.push(`wanted_tags = ?`); values.push(JSON.stringify(v)); }
  }
  if (!updates.length) return;
  updates.push('updated_at = ?');
  values.push(now(), id);
  _db.prepare(`UPDATE trade_offers SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

function bumpTradeOffer(id, creatorId) {
  _db.prepare('UPDATE trade_offers SET bumped_at = ?, updated_at = ? WHERE id = ? AND creator_id = ?').run(now(), now(), id, creatorId);
}

function deleteTradeOffer(id, creatorId) {
  _db.prepare('DELETE FROM trade_offers WHERE id = ? AND creator_id = ?').run(id, creatorId);
}

function parseTradeOffer(row) {
  if (!row) return null;
  try { if (typeof row.offering_items === 'string') row.offering_items = JSON.parse(row.offering_items); } catch { row.offering_items = []; }
  try { if (typeof row.wanted_items === 'string') row.wanted_items = JSON.parse(row.wanted_items); } catch { row.wanted_items = []; }
  try { if (typeof row.wanted_tags === 'string') row.wanted_tags = JSON.parse(row.wanted_tags); } catch { row.wanted_tags = []; }
  return row;
}

// ═══════════════════════════════════════════════════════════════════════════
//  BALANCE TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════

function createBalanceTransaction({ userId, type, amount, balanceAfter, description, referenceType, referenceId, status }) {
  const info = _db.prepare(`
    INSERT INTO balance_transactions (user_id, type, amount, balance_after, description, reference_type, reference_id, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(userId, type, amount, balanceAfter || 0, description || '', referenceType || '', referenceId || '', status || 'completed', now());
  return info.lastInsertRowid;
}

function getBalanceTransactions(userId, limit = 50) {
  return _db.prepare('SELECT * FROM balance_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
}

function updateUserBalance(userId, delta) {
  _db.prepare('UPDATE users SET balance = balance + ?, updated_at = ? WHERE id = ?').run(delta, now(), userId);
  return _db.prepare('SELECT balance FROM users WHERE id = ?').get(userId)?.balance ?? 0;
}

function getUserBalance(userId) {
  return _db.prepare('SELECT balance FROM users WHERE id = ?').get(userId)?.balance ?? 0;
}

// ═══════════════════════════════════════════════════════════════════════════
//  WITHDRAWAL REQUESTS
// ═══════════════════════════════════════════════════════════════════════════

function createWithdrawalRequest({ userId, amount, method, details }) {
  const info = _db.prepare(`
    INSERT INTO withdrawal_requests (user_id, amount, method, details, created_at)
    VALUES (?,?,?,?,?)
  `).run(userId, amount, method || 'card', JSON.stringify(details || {}), now());
  return info.lastInsertRowid;
}

function getWithdrawalRequests(userId) {
  return _db.prepare('SELECT * FROM withdrawal_requests WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

function getAllWithdrawalRequests(status) {
  if (status) return _db.prepare('SELECT w.*, u.name, u.email, u.steam_username FROM withdrawal_requests w JOIN users u ON w.user_id = u.id WHERE w.status = ? ORDER BY w.created_at DESC').all(status);
  return _db.prepare('SELECT w.*, u.name, u.email, u.steam_username FROM withdrawal_requests w JOIN users u ON w.user_id = u.id ORDER BY w.created_at DESC').all();
}

function updateWithdrawalRequest(id, fields) {
  const allowed = ['status', 'admin_note', 'processed_at'];
  const updates = [], values = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { updates.push(`${k} = ?`); values.push(v); }
  }
  if (!updates.length) return;
  values.push(id);
  _db.prepare(`UPDATE withdrawal_requests SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  getPlans, getPlan, upsertPlan,
  createUser, getUserById, getUserByEmail, getUserBySteamId, getUserByGoogleId, getAllUsers, countUsers,
  updateUser, updateLastLogin, deleteUser,
  // Market
  createMarketListing, getMarketListings, countMarketListings, getMarketListing,
  getUserMarketListings, updateMarketListing, deleteMarketListing,
  // Trades
  createTradeOffer, getTradeOffers, countTradeOffers, getTradeOffer,
  getUserTradeOffers, updateTradeOffer, bumpTradeOffer, deleteTradeOffer,
  // Balance
  createBalanceTransaction, getBalanceTransactions, updateUserBalance, getUserBalance,
  // Withdrawals
  createWithdrawalRequest, getWithdrawalRequests, getAllWithdrawalRequests, updateWithdrawalRequest,
  createSubscription, getActiveSubscription, getSubscriptionHistory,
  updateSubscription, getSubscriptionByStripeId, getUserByStripeCustomer,
  getTelegramBot, getTelegramBots, getTelegramBotByAuthorizedChatId, getAllTelegramBotsByAuthorizedChatId,
  upsertTelegramBot, deleteTelegramBot, getActiveTelegramBotUsers,
  addProfile, getProfiles, getProfile, updateProfile, deleteProfile, countProfiles,
  addCampaign, getCampaigns, getCampaign, updateCampaign, deleteCampaign, countCampaigns,
  addJob, getDueJobs, getRecentJobs, getJobsPaged, getJobStats, countJobsToday,
  updateJobStatus, resetRunningJobs, cancelOverduePendingJobs, deleteJob,
  deletePendingJobsByCampaign, getLastJobForCampaignProfile, getPendingJobForCampaignProfile,
  getSteamGroups, getSteamGroup, getSteamGroupsByIds,
  getSetting, setSetting, getAllSettings, bulkSetSettings,
  getServerSetting, setServerSetting, getAllServerSettings, bulkSetServerSettings,
  createRefreshToken, getRefreshToken, deleteRefreshToken,
  deleteUserRefreshTokens, cleanExpiredTokens, expireTrialSubscriptions, expireActiveSubscriptions,
  createPasswordReset, getPasswordReset, markPasswordResetUsed,
  createTransaction, getTransactions, updateTransactionStatus,
  getAdminTransactions, getTransactionById, getTransactionByExternalId, updateTransaction, getPaymentStats,
  getAdminStats, getAdminUserList, auditLog,
  _db,
};
