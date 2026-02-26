'use strict';

/**
 * server/db/pg.js
 *
 * Асинхронная реализация DAL поверх node-postgres (pg).
 * Экспортирует ИДЕНТИЧНОЕ API с sqlite.js, но все функции возвращают Promise.
 */

const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

const poolCfg = config.db.postgresql || {};
const pool = new Pool({
  host:     process.env.DB_HOST     || poolCfg.host     || 'localhost',
  port:     Number(process.env.DB_PORT || poolCfg.port  || 5432),
  database: process.env.DB_NAME     || poolCfg.database || 'steambot',
  user:     process.env.DB_USER     || poolCfg.user     || 'steambot',
  password: process.env.DB_PASSWORD || poolCfg.password || '',
  ssl: (process.env.DB_SSL === 'true' || poolCfg.ssl)
    ? { rejectUnauthorized: false }
    : false,
  max: Number(process.env.DB_POOL_MAX || poolCfg.max || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', err => console.error('[pg] pool error', err.message));

/** Выполнить параметризованный запрос */
async function query(sql, params = []) {
  return pool.query(sql, params);
}

/** Вернуть первую строку или null */
async function getOne(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}

/** Вернуть массив строк */
async function getAll(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

function now() { return new Date().toISOString(); }

// ═══════════════════════════════════════════════════════════════════════════
//  SUBSCRIPTION PLANS
// ═══════════════════════════════════════════════════════════════════════════

async function getPlans(activeOnly = true) {
  const rows = activeOnly
    ? await getAll('SELECT * FROM subscription_plans WHERE is_active = TRUE ORDER BY sort_order')
    : await getAll('SELECT * FROM subscription_plans ORDER BY sort_order');
  return rows.map(parsePlan);
}

async function getPlan(id) {
  const row = await getOne('SELECT * FROM subscription_plans WHERE id = $1', [id]);
  return row ? parsePlan(row) : null;
}

async function upsertPlan(plan) {
  await query(`
    INSERT INTO subscription_plans
      (id,name,description,price_monthly,price_yearly,
       max_steam_accounts,max_campaigns,max_jobs_per_day,max_telegram_bots,
       has_mini_app,has_ai_templates,has_analytics,has_priority_support,has_api_access,
       features,stripe_monthly_price_id,stripe_yearly_price_id,is_active,sort_order,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    ON CONFLICT(id) DO UPDATE SET
      name=EXCLUDED.name,description=EXCLUDED.description,
      price_monthly=EXCLUDED.price_monthly,price_yearly=EXCLUDED.price_yearly,
      max_steam_accounts=EXCLUDED.max_steam_accounts,max_campaigns=EXCLUDED.max_campaigns,
      max_jobs_per_day=EXCLUDED.max_jobs_per_day,max_telegram_bots=EXCLUDED.max_telegram_bots,
      has_mini_app=EXCLUDED.has_mini_app,has_ai_templates=EXCLUDED.has_ai_templates,
      has_analytics=EXCLUDED.has_analytics,has_priority_support=EXCLUDED.has_priority_support,
      has_api_access=EXCLUDED.has_api_access,features=EXCLUDED.features,
      stripe_monthly_price_id=EXCLUDED.stripe_monthly_price_id,
      stripe_yearly_price_id=EXCLUDED.stripe_yearly_price_id,
      is_active=EXCLUDED.is_active,sort_order=EXCLUDED.sort_order
  `, [
    plan.id, plan.name, plan.description || '',
    plan.price_monthly ?? 0, plan.price_yearly ?? 0,
    plan.max_steam_accounts ?? 1, plan.max_campaigns ?? 1,
    plan.max_jobs_per_day ?? 10, plan.max_telegram_bots ?? 0,
    !!plan.has_mini_app, !!plan.has_ai_templates,
    !!plan.has_analytics, !!plan.has_priority_support, !!plan.has_api_access,
    JSON.stringify(plan.features || []),
    plan.stripe_monthly_price_id || null,
    plan.stripe_yearly_price_id  || null,
    plan.is_active !== false,
    plan.sort_order ?? 0, now(),
  ]);
}

function parsePlan(row) {
  return {
    ...row,
    features: typeof row.features === 'string' ? JSON.parse(row.features) : (row.features || []),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  USERS
// ═══════════════════════════════════════════════════════════════════════════

async function createUser({ email, passwordHash, name, role = 'user' }) {
  const id = uuidv4();
  await query(`
    INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [id, email.toLowerCase().trim(), passwordHash, name || '', role, now(), now()]);
  return id;
}

async function getUserById(id) {
  const row = await getOne('SELECT * FROM users WHERE id = $1', [id]);
  return row ? parseUser(row) : null;
}

async function getUserByEmail(email) {
  const row = await getOne('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  return row ? parseUser(row) : null;
}

async function getAllUsers({ limit = 50, offset = 0, search = '' } = {}) {
  const like = `%${search}%`;
  const rows = await getAll(`
    SELECT * FROM users WHERE name ILIKE $1 OR email ILIKE $2
    ORDER BY created_at DESC LIMIT $3 OFFSET $4
  `, [like, like, limit, offset]);
  return rows.map(parseUser);
}

async function countUsers() {
  const row = await getOne('SELECT COUNT(*) as n FROM users');
  return Number(row.n);
}

async function updateUser(id, fields) {
  const allowed = ['name', 'email', 'role', 'is_active', 'email_verified', 'password_hash'];
  const updates = [], values = [];
  let i = 1;
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { updates.push(`${k} = $${i++}`); values.push(v); }
  }
  if (!updates.length) return;
  updates.push(`updated_at = $${i++}`);
  values.push(now(), id);
  await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`, values);
}

async function updateLastLogin(id) {
  await query('UPDATE users SET last_login_at = $1 WHERE id = $2', [now(), id]);
}

async function deleteUser(id) {
  await query('DELETE FROM users WHERE id = $1', [id]);
}

function parseUser(row) {
  const { password_hash, ...rest } = row;
  return { ...rest, _password_hash: password_hash };
}

// ═══════════════════════════════════════════════════════════════════════════
//  SUBSCRIPTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function createSubscription({ userId, planId, billingPeriod = 'monthly', status = 'trial', trialDays }) {
  const id = uuidv4();
  const trialEnd = trialDays ? new Date(Date.now() + trialDays * 86400000).toISOString() : null;
  await query(`
    INSERT INTO user_subscriptions
      (id,user_id,plan_id,status,billing_period,started_at,trial_ends_at,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
  `, [id, userId, planId, status, billingPeriod, now(), trialEnd, now()]);
  return id;
}

async function getActiveSubscription(userId) {
  return getOne(`
    SELECT s.*, p.max_steam_accounts, p.max_campaigns, p.max_jobs_per_day,
           p.max_telegram_bots, p.has_mini_app, p.has_ai_templates,
           p.has_analytics, p.has_priority_support, p.has_api_access,
           p.name as plan_name, p.features
    FROM user_subscriptions s
    JOIN subscription_plans p ON s.plan_id = p.id
    WHERE s.user_id = $1 AND s.status IN ('trial', 'active')
    ORDER BY s.created_at DESC LIMIT 1
  `, [userId]);
}

async function getSubscriptionHistory(userId) {
  return getAll(`
    SELECT s.*, p.name as plan_name FROM user_subscriptions s
    JOIN subscription_plans p ON s.plan_id = p.id
    WHERE s.user_id = $1 ORDER BY s.created_at DESC
  `, [userId]);
}

async function updateSubscription(id, fields) {
  const allowed = ['status','billing_period','expires_at','trial_ends_at',
                   'stripe_subscription_id','stripe_customer_id','cancelled_at','cancel_reason'];
  const updates = [], values = [];
  let i = 1;
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { updates.push(`${k} = $${i++}`); values.push(v); }
  }
  if (!updates.length) return;
  values.push(id);
  await query(`UPDATE user_subscriptions SET ${updates.join(', ')} WHERE id = $${i}`, values);
}

async function getSubscriptionByStripeId(stripeSubId) {
  return getOne('SELECT * FROM user_subscriptions WHERE stripe_subscription_id = $1', [stripeSubId]);
}

async function getUserByStripeCustomer(stripeCustomerId) {
  const sub = await getOne('SELECT user_id FROM user_subscriptions WHERE stripe_customer_id = $1 LIMIT 1', [stripeCustomerId]);
  return sub ? getUserById(sub.user_id) : null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  TELEGRAM BOTS
// ═══════════════════════════════════════════════════════════════════════════

async function getTelegramBot(userId) {
  return getOne('SELECT * FROM user_telegram_bots WHERE user_id = $1 ORDER BY created_at LIMIT 1', [userId]);
}

async function getTelegramBots(userId) {
  return getAll('SELECT * FROM user_telegram_bots WHERE user_id = $1 ORDER BY created_at', [userId]);
}

async function getTelegramBotByAuthorizedChatId(chatId) {
  const bots = await getAll('SELECT * FROM user_telegram_bots WHERE is_active = TRUE');
  for (const bot of bots) {
    try {
      const ids = typeof bot.authorized_chat_ids === 'string'
        ? JSON.parse(bot.authorized_chat_ids)
        : (bot.authorized_chat_ids || []);
      if (!ids.length || ids.includes(chatId) || ids.includes(String(chatId))) return bot;
    } catch {}
  }
  return null;
}

async function upsertTelegramBot(userId, data) {
  const existing = await getTelegramBot(userId);
  if (existing) {
    await query(`
      UPDATE user_telegram_bots SET
        label=$1,bot_token=$2,bot_username=$3,authorized_chat_ids=$4,
        mini_app_url=$5,notify_errors=$6,notify_success=$7,notify_expired=$8,
        notify_bot_state=$9,is_active=$10
      WHERE id=$11
    `, [
      data.label || existing.label, data.bot_token,
      data.bot_username || existing.bot_username,
      JSON.stringify(data.authorized_chat_ids || (typeof existing.authorized_chat_ids === 'string'
        ? JSON.parse(existing.authorized_chat_ids) : existing.authorized_chat_ids)),
      data.mini_app_url || existing.mini_app_url,
      data.notify_errors   !== undefined ? !!data.notify_errors   : existing.notify_errors,
      data.notify_success  !== undefined ? !!data.notify_success  : existing.notify_success,
      data.notify_expired  !== undefined ? !!data.notify_expired  : existing.notify_expired,
      data.notify_bot_state !== undefined ? !!data.notify_bot_state : existing.notify_bot_state,
      data.is_active !== undefined ? !!data.is_active : existing.is_active,
      existing.id,
    ]);
    return existing.id;
  } else {
    const id = uuidv4();
    await query(`
      INSERT INTO user_telegram_bots
        (id,user_id,label,bot_token,bot_username,authorized_chat_ids,
         mini_app_url,notify_errors,notify_success,notify_expired,notify_bot_state,is_active,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `, [
      id, userId, data.label || 'Main Bot', data.bot_token,
      data.bot_username || null,
      JSON.stringify(data.authorized_chat_ids || []),
      data.mini_app_url || null,
      data.notify_errors   !== false,
      !!data.notify_success,
      data.notify_expired  !== false,
      data.notify_bot_state !== false,
      !!data.is_active, now(),
    ]);
    return id;
  }
}

async function deleteTelegramBot(id, userId) {
  await query('DELETE FROM user_telegram_bots WHERE id = $1 AND user_id = $2', [id, userId]);
}

async function getActiveTelegramBotUsers() {
  return getAll(`
    SELECT t.*, u.id as user_id
    FROM user_telegram_bots t
    JOIN users u ON u.id = t.user_id
    WHERE t.is_active = TRUE AND u.is_active = TRUE
  `);
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROFILES
// ═══════════════════════════════════════════════════════════════════════════

async function addProfile(userId, { name, cookies, targetUrl }) {
  const id = uuidv4();
  await query(`
    INSERT INTO profiles (id, user_id, name, cookies, target_url, is_active, created_at)
    VALUES ($1,$2,$3,$4,$5,TRUE,$6)
  `, [id, userId, name, JSON.stringify(cookies),
    targetUrl || 'https://steamcommunity.com/app/730/tradingforum/', now()]);
  return id;
}

async function getProfiles(userId) {
  const rows = await getAll('SELECT * FROM profiles WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return rows.map(r => ({
    ...r,
    cookies: typeof r.cookies === 'string' ? JSON.parse(r.cookies) : (r.cookies || []),
  }));
}

async function getProfile(id, userId) {
  const row = await getOne('SELECT * FROM profiles WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!row) return null;
  return { ...row, cookies: typeof row.cookies === 'string' ? JSON.parse(row.cookies) : (row.cookies || []) };
}

async function updateProfile(id, userId, fields) {
  const allowed = ['name', 'cookies', 'target_url', 'is_active'];
  const updates = [], values = [];
  let i = 1;
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) {
      updates.push(`${k} = $${i++}`);
      values.push(k === 'cookies' ? JSON.stringify(v) : v);
    }
  }
  if (!updates.length) return;
  values.push(id, userId);
  await query(`UPDATE profiles SET ${updates.join(', ')} WHERE id = $${i} AND user_id = $${i+1}`, values);
}

async function deleteProfile(id, userId) {
  await query('DELETE FROM profiles WHERE id = $1 AND user_id = $2', [id, userId]);
}

async function countProfiles(userId) {
  const row = await getOne('SELECT COUNT(*) as n FROM profiles WHERE user_id = $1', [userId]);
  return Number(row.n);
}

// ═══════════════════════════════════════════════════════════════════════════
//  CAMPAIGNS
// ═══════════════════════════════════════════════════════════════════════════

async function addCampaign(userId, { name, titleTemplate, bodyTemplate, scheduleMinutes,
                                     scheduleTimes, windowStart, windowEnd, profileIds }) {
  const id   = uuidv4();
  const mins = (scheduleTimes && scheduleTimes.length > 0) ? 0 : (scheduleMinutes || 60);
  await query(`
    INSERT INTO campaigns
      (id,user_id,name,title_template,body_template,schedule_minutes,
       schedule_times,window_start,window_end,profile_ids,is_active,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11)
  `, [id, userId, name, titleTemplate, bodyTemplate, mins,
    scheduleTimes ? JSON.stringify(scheduleTimes) : null,
    windowStart || '00:00', windowEnd || '23:59',
    JSON.stringify(profileIds || []), now()]);
  return id;
}

async function getCampaigns(userId) {
  const rows = await getAll('SELECT * FROM campaigns WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return rows.map(parseCampaign);
}

async function getCampaign(id, userId) {
  const row = await getOne('SELECT * FROM campaigns WHERE id = $1 AND user_id = $2', [id, userId]);
  return row ? parseCampaign(row) : null;
}

async function updateCampaign(id, userId, fields) {
  const allowed = ['name','title_template','body_template','schedule_minutes',
                   'schedule_times','window_start','window_end','profile_ids','is_active'];
  const updates = [], values = [];
  let i = 1;
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) {
      updates.push(`${k} = $${i++}`);
      const serialized = ['schedule_times','profile_ids'].includes(k) && typeof v !== 'string'
        ? JSON.stringify(v) : v;
      values.push(serialized);
    }
  }
  if (!updates.length) return;
  values.push(id, userId);
  await query(`UPDATE campaigns SET ${updates.join(', ')} WHERE id = $${i} AND user_id = $${i+1}`, values);
}

async function deleteCampaign(id, userId) {
  await query('DELETE FROM campaigns WHERE id = $1 AND user_id = $2', [id, userId]);
}

async function countCampaigns(userId) {
  const row = await getOne('SELECT COUNT(*) as n FROM campaigns WHERE user_id = $1', [userId]);
  return Number(row.n);
}

function parseCampaign(row) {
  return {
    ...row,
    profile_ids:    typeof row.profile_ids    === 'string' ? JSON.parse(row.profile_ids)    : (row.profile_ids    || []),
    schedule_times: typeof row.schedule_times === 'string' ? JSON.parse(row.schedule_times) : row.schedule_times,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  JOBS
// ═══════════════════════════════════════════════════════════════════════════

async function addJob(userId, { campaignId, profileId, scheduledAt, title, body }) {
  const id = uuidv4();
  await query(`
    INSERT INTO jobs (id,user_id,campaign_id,profile_id,scheduled_at,status,title,body,created_at)
    VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8)
  `, [id, userId, campaignId, profileId, scheduledAt, title, body, now()]);
  return id;
}

async function getDueJobs(userId) {
  return getAll(`
    SELECT * FROM jobs
    WHERE user_id = $1 AND status = 'pending' AND scheduled_at <= $2
    ORDER BY scheduled_at LIMIT 50
  `, [userId, now()]);
}

async function getRecentJobs(userId, limit = 50) {
  return getAll(`
    SELECT j.*, p.name as profile_name, c.name as campaign_name
    FROM jobs j
    LEFT JOIN profiles  p ON j.profile_id  = p.id
    LEFT JOIN campaigns c ON j.campaign_id = c.id
    WHERE j.user_id = $1 ORDER BY j.created_at DESC LIMIT $2
  `, [userId, limit]);
}

async function getJobsPaged(userId, { limit = 20, offset = 0, status = null } = {}) {
  let params, where;
  if (status && status !== 'all') {
    where  = 'WHERE j.user_id = $1 AND j.status = $2';
    params = [userId, status];
  } else {
    where  = 'WHERE j.user_id = $1';
    params = [userId];
  }
  const ci = params.length + 1;
  const co = params.length + 2;
  const countRow = await getOne(`SELECT COUNT(*) as n FROM jobs j ${where}`, params);
  const jobs     = await getAll(`
    SELECT j.*, p.name as profile_name, c.name as campaign_name
    FROM jobs j
    LEFT JOIN profiles  p ON j.profile_id  = p.id
    LEFT JOIN campaigns c ON j.campaign_id = c.id
    ${where} ORDER BY j.created_at DESC LIMIT $${ci} OFFSET $${co}
  `, [...params, limit, offset]);
  return { jobs, total: Number(countRow.n) };
}

async function getJobStats(userId) {
  return getAll('SELECT status, COUNT(*) as count FROM jobs WHERE user_id = $1 GROUP BY status', [userId]);
}

async function countJobsToday(userId) {
  const today = new Date().toISOString().split('T')[0];
  const row = await getOne(`
    SELECT COUNT(*) as n FROM jobs WHERE user_id = $1 AND status = 'done' AND DATE(executed_at) = $2
  `, [userId, today]);
  return Number(row.n);
}

async function updateJobStatus(id, userId, status, extra = {}) {
  const fields = { status, ...extra };
  if (['running','done','failed'].includes(status)) fields.executed_at = now();
  let i = 1;
  const updates = Object.keys(fields).map(k => `${k} = $${i++}`);
  const values  = [...Object.values(fields), id, userId];
  await query(
    `UPDATE jobs SET ${updates.join(', ')} WHERE id = $${i} AND user_id = $${i+1}`,
    values
  );
}

async function resetRunningJobs(userId) {
  await query(`UPDATE jobs SET status = 'pending' WHERE user_id = $1 AND status = 'running'`, [userId]);
}

async function cancelOverduePendingJobs(userId) {
  const limit = new Date(Date.now() - 2 * 3600000).toISOString();
  const { rowCount } = await query(`
    UPDATE jobs SET status = 'cancelled'
    WHERE user_id = $1 AND status = 'pending' AND scheduled_at < $2
  `, [userId, limit]);
  return rowCount;
}

async function deleteJob(id, userId) {
  await query('DELETE FROM jobs WHERE id = $1 AND user_id = $2', [id, userId]);
}

async function deletePendingJobsByCampaign(campaignId, userId) {
  await query(`DELETE FROM jobs WHERE campaign_id = $1 AND user_id = $2 AND status = 'pending'`, [campaignId, userId]);
}

// ─── Хелперы для SteamBotManager ─────────────────────────────────────────────

async function getLastJobForCampaignProfile(userId, campaignId, profileId) {
  return getOne(`
    SELECT * FROM jobs WHERE user_id = $1 AND campaign_id = $2 AND profile_id = $3
    ORDER BY scheduled_at DESC LIMIT 1
  `, [userId, campaignId, profileId]);
}

async function getPendingJobForCampaignProfile(userId, campaignId, profileId) {
  return getOne(`
    SELECT id FROM jobs
    WHERE user_id = $1 AND campaign_id = $2 AND profile_id = $3 AND status = 'pending' LIMIT 1
  `, [userId, campaignId, profileId]);
}

// ═══════════════════════════════════════════════════════════════════════════
//  USER SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

async function getSetting(userId, key, defaultValue = null) {
  const row = await getOne('SELECT value FROM user_settings WHERE user_id = $1 AND key = $2', [userId, key]);
  return row ? row.value : defaultValue;
}

async function setSetting(userId, key, value) {
  await query(`
    INSERT INTO user_settings (user_id, key, value) VALUES ($1,$2,$3)
    ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value
  `, [userId, key, value]);
}

async function getAllSettings(userId) {
  const rows = await getAll('SELECT key, value FROM user_settings WHERE user_id = $1', [userId]);
  const result = {};
  for (const r of rows) result[r.key] = r.value;
  return result;
}

async function bulkSetSettings(userId, kvMap) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [k, v] of Object.entries(kvMap)) {
      await client.query(`
        INSERT INTO user_settings (user_id, key, value) VALUES ($1,$2,$3)
        ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value
      `, [userId, k, v]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  REFRESH TOKENS
// ═══════════════════════════════════════════════════════════════════════════

async function createRefreshToken(userId, tokenHash, expiresAt, { ip, ua } = {}) {
  const id = uuidv4();
  await query(`
    INSERT INTO refresh_tokens (id,user_id,token_hash,expires_at,created_at,ip_address,user_agent)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [id, userId, tokenHash, expiresAt, now(), ip || null, ua || null]);
  return id;
}

async function getRefreshToken(tokenHash) {
  return getOne('SELECT * FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
}

async function deleteRefreshToken(tokenHash) {
  await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
}

async function deleteUserRefreshTokens(userId) {
  await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

async function expireTrialSubscriptions(now) {
  await query(`UPDATE user_subscriptions SET status='expired'
    WHERE status='trial' AND trial_ends_at IS NOT NULL AND trial_ends_at < $1`, [now]);
}

async function expireActiveSubscriptions(now) {
  await query(`UPDATE user_subscriptions SET status='expired'
    WHERE status='active' AND expires_at IS NOT NULL AND expires_at < $1`, [now]);
}

async function cleanExpiredTokens() {
  await query('DELETE FROM refresh_tokens WHERE expires_at < $1', [now()]);
}

// ═══════════════════════════════════════════════════════════════════════════
//  PASSWORD RESETS
// ═══════════════════════════════════════════════════════════════════════════

async function createPasswordReset(userId, token, expiresAt) {
  await query('DELETE FROM password_resets WHERE user_id = $1', [userId]);
  await query(`
    INSERT INTO password_resets (id,user_id,token,expires_at,created_at) VALUES ($1,$2,$3,$4,$5)
  `, [uuidv4(), userId, token, expiresAt, now()]);
}

async function getPasswordReset(token) {
  return getOne('SELECT * FROM password_resets WHERE token = $1 AND used = FALSE', [token]);
}

async function markPasswordResetUsed(id) {
  await query('UPDATE password_resets SET used = TRUE WHERE id = $1', [id]);
}

// ═══════════════════════════════════════════════════════════════════════════
//  EMAIL VERIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

async function createEmailVerification(userId, token, expiresAt) {
  await query('DELETE FROM email_verifications WHERE user_id = $1', [userId]);
  await query(`
    INSERT INTO email_verifications (id,user_id,token,expires_at,created_at) VALUES ($1,$2,$3,$4,$5)
  `, [uuidv4(), userId, token, expiresAt, now()]);
}

async function getEmailVerification(token) {
  return getOne('SELECT * FROM email_verifications WHERE token = $1 AND used = FALSE', [token]);
}

async function markEmailVerificationUsed(id) {
  await query('UPDATE email_verifications SET used = TRUE WHERE id = $1', [id]);
}

// ═══════════════════════════════════════════════════════════════════════════
//  PAYMENT TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function createTransaction({ userId, subscriptionId, amount, currency = 'USD', status,
                                    planId, billingPeriod, paymentMethod, externalId, metadata }) {
  const id = uuidv4();
  await query(`
    INSERT INTO payment_transactions
      (id,user_id,subscription_id,amount,currency,status,
       plan_id,billing_period,payment_method,external_id,metadata,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
  `, [id, userId, subscriptionId || null, amount, currency, status,
    planId || null, billingPeriod || null, paymentMethod || null,
    externalId || null, metadata ? JSON.stringify(metadata) : null, now()]);
  return id;
}

async function getTransactions(userId, limit = 20) {
  return getAll(`
    SELECT * FROM payment_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
  `, [userId, limit]);
}

async function updateTransactionStatus(externalId, status) {
  await query('UPDATE payment_transactions SET status = $1 WHERE external_id = $2', [status, externalId]);
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN STATS
// ═══════════════════════════════════════════════════════════════════════════

async function getAdminStats() {
  const today = new Date().toISOString().split('T')[0];
  const [[tu],[au],[tr],[ac],[tp],[tc],[jt],[rev]] = await Promise.all([
    getAll('SELECT COUNT(*) as n FROM users'),
    getAll('SELECT COUNT(*) as n FROM users WHERE is_active = TRUE'),
    getAll("SELECT COUNT(*) as n FROM user_subscriptions WHERE status = 'trial'"),
    getAll("SELECT COUNT(*) as n FROM user_subscriptions WHERE status = 'active'"),
    getAll('SELECT COUNT(*) as n FROM profiles'),
    getAll('SELECT COUNT(*) as n FROM campaigns WHERE is_active = TRUE'),
    getAll("SELECT COUNT(*) as n FROM jobs WHERE status='done' AND DATE(executed_at)=$1", [today]),
    getAll("SELECT COALESCE(SUM(amount),0) as n FROM payment_transactions WHERE status='completed'"),
  ]);
  return {
    total_users:          Number(tu.n),
    active_users:         Number(au.n),
    trial_subscriptions:  Number(tr.n),
    active_subscriptions: Number(ac.n),
    total_profiles:       Number(tp.n),
    total_campaigns:      Number(tc.n),
    jobs_today:           Number(jt.n),
    revenue_total:        Number(rev.n),
  };
}

async function getAdminUserList({ limit = 50, offset = 0, search = '' } = {}) {
  const like = `%${search}%`;
  return getAll(`
    SELECT u.*,
      s.plan_id, s.status as sub_status, s.expires_at, s.trial_ends_at,
      p.name as plan_name,
      (SELECT COUNT(*) FROM profiles pr WHERE pr.user_id = u.id)  as profiles_count,
      (SELECT COUNT(*) FROM campaigns c  WHERE c.user_id  = u.id) as campaigns_count,
      (SELECT COUNT(*) FROM jobs j WHERE j.user_id = u.id AND j.status = 'done') as jobs_done
    FROM users u
    LEFT JOIN user_subscriptions s ON s.user_id = u.id AND s.status IN ('trial','active')
    LEFT JOIN subscription_plans p ON p.id = s.plan_id
    WHERE u.name ILIKE $1 OR u.email ILIKE $2
    ORDER BY u.created_at DESC LIMIT $3 OFFSET $4
  `, [like, like, limit, offset]);
}

// ═══════════════════════════════════════════════════════════════════════════
//  AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════

async function auditLog(userId, action, resourceType, resourceId, details, ip) {
  await query(`
    INSERT INTO audit_log (id,user_id,action,resource_type,resource_id,details,ip_address,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
  `, [uuidv4(), userId || null, action, resourceType || null, resourceId || null,
    details ? JSON.stringify(details) : null, ip || null, now()]);
}

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
  createEmailVerification, getEmailVerification, markEmailVerificationUsed,
  createTransaction, getTransactions, updateTransactionStatus,
  getAdminStats, getAdminUserList, auditLog,
  pool, // expose for health-checks / migrations
};
