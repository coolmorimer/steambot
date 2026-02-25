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
       max_steam_accounts,max_campaigns,max_jobs_per_day,max_telegram_bots,
       has_mini_app,has_ai_templates,has_analytics,has_priority_support,has_api_access,
       features,stripe_monthly_price_id,stripe_yearly_price_id,is_active,sort_order,created_at)
    VALUES (?,?,?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,description=excluded.description,
      price_monthly=excluded.price_monthly,price_yearly=excluded.price_yearly,
      max_steam_accounts=excluded.max_steam_accounts,max_campaigns=excluded.max_campaigns,
      max_jobs_per_day=excluded.max_jobs_per_day,max_telegram_bots=excluded.max_telegram_bots,
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

function createUser({ email, passwordHash, name, role = 'user' }) {
  const id = uuidv4();
  const n  = now();
  _db.prepare(`
    INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, email.toLowerCase().trim(), passwordHash, name || '', role, n, n);
  return id;
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
  const allowed = ['name', 'email', 'role', 'is_active', 'email_verified', 'password_hash'];
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
           p.max_telegram_bots, p.has_mini_app, p.has_ai_templates,
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
  for (const bot of bots) {
    try {
      const ids = JSON.parse(bot.authorized_chat_ids || '[]');
      if (!ids.length || ids.includes(chatId) || ids.includes(String(chatId))) return bot;
    } catch {}
  }
  return null;
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
                               scheduleTimes, windowStart, windowEnd, profileIds }) {
  const id   = uuidv4();
  const mins = (scheduleTimes && scheduleTimes.length > 0) ? 0 : (scheduleMinutes || 60);
  _db.prepare(`
    INSERT INTO campaigns
      (id, user_id, name, title_template, body_template, schedule_minutes,
       schedule_times, window_start, window_end, profile_ids, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(id, userId, name, titleTemplate, bodyTemplate, mins,
    scheduleTimes ? JSON.stringify(scheduleTimes) : null,
    windowStart || '00:00', windowEnd || '23:59',
    JSON.stringify(profileIds || []), now());
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
                   'schedule_times','window_start','window_end','profile_ids','is_active'];
  const updates = [], values = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) {
      updates.push(`${k} = ?`);
      const serialized = ['schedule_times','profile_ids'].includes(k) && typeof v !== 'string'
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
    schedule_times: row.schedule_times ? JSON.parse(row.schedule_times) : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  JOBS
// ═══════════════════════════════════════════════════════════════════════════

function addJob(userId, { campaignId, profileId, scheduledAt, title, body }) {
  const id = uuidv4();
  _db.prepare(`
    INSERT INTO jobs (id, user_id, campaign_id, profile_id, scheduled_at, status, title, body, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(id, userId, campaignId, profileId, scheduledAt, title, body, now());
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

function getLastJobForCampaignProfile(userId, campaignId, profileId) {
  return _db.prepare(`
    SELECT * FROM jobs WHERE user_id = ? AND campaign_id = ? AND profile_id = ?
    ORDER BY scheduled_at DESC LIMIT 1
  `).get(userId, campaignId, profileId);
}

function getPendingJobForCampaignProfile(userId, campaignId, profileId) {
  return _db.prepare(`
    SELECT id FROM jobs
    WHERE user_id = ? AND campaign_id = ? AND profile_id = ? AND status = 'pending' LIMIT 1
  `).get(userId, campaignId, profileId);
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

function createTransaction({ userId, subscriptionId, amount, currency = 'USD', status,
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
  return {
    total_users:          _db.prepare('SELECT COUNT(*) as n FROM users').get().n,
    active_users:         _db.prepare("SELECT COUNT(*) as n FROM users WHERE is_active = 1").get().n,
    trial_subscriptions:  _db.prepare("SELECT COUNT(*) as n FROM user_subscriptions WHERE status = 'trial'").get().n,
    active_subscriptions: _db.prepare("SELECT COUNT(*) as n FROM user_subscriptions WHERE status = 'active'").get().n,
    total_profiles:       _db.prepare('SELECT COUNT(*) as n FROM profiles').get().n,
    total_campaigns:      _db.prepare('SELECT COUNT(*) as n FROM campaigns WHERE is_active = 1').get().n,
    jobs_today:           _db.prepare("SELECT COUNT(*) as n FROM jobs WHERE status='done' AND date(executed_at)=?").get(today).n,
    revenue_total:        _db.prepare("SELECT COALESCE(SUM(amount),0) as n FROM payment_transactions WHERE status='completed'").get().n,
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
//  EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  getPlans, getPlan, upsertPlan,
  createUser, getUserById, getUserByEmail, getAllUsers, countUsers,
  updateUser, updateLastLogin, deleteUser,
  createSubscription, getActiveSubscription, getSubscriptionHistory,
  updateSubscription, getSubscriptionByStripeId, getUserByStripeCustomer,
  getTelegramBot, getTelegramBots, getTelegramBotByAuthorizedChatId,
  upsertTelegramBot, deleteTelegramBot, getActiveTelegramBotUsers,
  addProfile, getProfiles, getProfile, updateProfile, deleteProfile, countProfiles,
  addCampaign, getCampaigns, getCampaign, updateCampaign, deleteCampaign, countCampaigns,
  addJob, getDueJobs, getRecentJobs, getJobsPaged, getJobStats, countJobsToday,
  updateJobStatus, resetRunningJobs, cancelOverduePendingJobs, deleteJob,
  deletePendingJobsByCampaign, getLastJobForCampaignProfile, getPendingJobForCampaignProfile,
  getSetting, setSetting, getAllSettings, bulkSetSettings,
  createRefreshToken, getRefreshToken, deleteRefreshToken,
  deleteUserRefreshTokens, cleanExpiredTokens, expireTrialSubscriptions, expireActiveSubscriptions,
  createPasswordReset, getPasswordReset, markPasswordResetUsed,
  createTransaction, getTransactions, updateTransactionStatus,
  getAdminStats, getAdminUserList, auditLog,
  _db,
};
