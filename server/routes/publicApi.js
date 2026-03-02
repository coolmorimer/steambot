'use strict';

/**
 * server/routes/publicApi.js
 *
 * Public API v1 для внешних интеграций.
 * Авторизация через API-ключ (spb_xxx).
 * Монтируется как /api/v1
 *
 * Endpoints:
 *   GET    /api/v1/me              — информация о пользователе
 *   GET    /api/v1/profiles        — список Steam аккаунтов
 *   GET    /api/v1/profiles/:id    — один аккаунт
 *   GET    /api/v1/campaigns       — список кампаний
 *   GET    /api/v1/campaigns/:id   — одна кампания
 *   PATCH  /api/v1/campaigns/:id   — вкл/выкл кампанию
 *   GET    /api/v1/jobs            — задачи (с пагинацией)
 *   GET    /api/v1/jobs/stats      — статистика задач
 *   GET    /api/v1/subscription    — текущая подписка
 *   GET    /api/v1/bot/status      — статус Steam-бота
 *   POST   /api/v1/bot/start       — запустить Steam-бота
 *   POST   /api/v1/bot/stop        — остановить Steam-бота
 */

const express = require('express');
const db      = require('../db');
const { apiKeyAuth, requirePermission } = require('../middleware/apiKeyAuth');
const { loadSubscription }              = require('../middleware/subscription');
const SteamBotManager = require('../services/SteamBotManager');

const router = express.Router();

// Все маршруты требуют API-ключ + загрузку подписки
router.use(apiKeyAuth, loadSubscription);

// ═══════════════════════════════════════════════════════════════════════════
//  ME
// ═══════════════════════════════════════════════════════════════════════════

router.get('/me', async (req, res) => {
  const sub = await db.getActiveSubscription(req.userId);
  res.json({
    id:    req.user.id,
    email: req.user.email,
    name:  req.user.name,
    subscription: sub ? {
      plan_id:   sub.plan_id,
      plan_name: sub.plan_name,
      status:    sub.status,
      expires_at: sub.expires_at,
      trial_ends_at: sub.trial_ends_at,
    } : null,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  PROFILES (Steam accounts)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/profiles', requirePermission('read'), async (req, res, next) => {
  try {
    const profiles = await db.getProfiles(req.userId);
    res.json({
      data: profiles.map(p => ({
        id: p.id, name: p.name, status: p.status,
        is_active: p.is_active, target_url: p.target_url,
        created_at: p.created_at,
      })),
      total: profiles.length,
    });
  } catch (e) { next(e); }
});

router.get('/profiles/:id', requirePermission('read'), async (req, res, next) => {
  try {
    const p = await db.getProfile(req.params.id, req.userId);
    if (!p) return res.status(404).json({ error: 'Profile not found' });
    res.json({
      id: p.id, name: p.name, status: p.status,
      is_active: p.is_active, target_url: p.target_url,
      created_at: p.created_at,
    });
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  CAMPAIGNS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/campaigns', requirePermission('read'), async (req, res, next) => {
  try {
    const campaigns = await db.getCampaigns(req.userId);
    res.json({
      data: campaigns.map(c => ({
        id: c.id, name: c.name, is_active: c.is_active,
        title_template: c.title_template, body_template: c.body_template,
        schedule_times: c.schedule_times, schedule_days: c.schedule_days,
        profile_ids: c.profile_ids, group_urls: c.group_urls,
        created_at: c.created_at,
      })),
      total: campaigns.length,
    });
  } catch (e) { next(e); }
});

router.get('/campaigns/:id', requirePermission('read'), async (req, res, next) => {
  try {
    const c = await db.getCampaign(req.params.id, req.userId);
    if (!c) return res.status(404).json({ error: 'Campaign not found' });
    res.json({
      id: c.id, name: c.name, is_active: c.is_active,
      title_template: c.title_template, body_template: c.body_template,
      schedule_times: c.schedule_times, schedule_days: c.schedule_days,
      profile_ids: c.profile_ids, group_urls: c.group_urls,
      created_at: c.created_at,
    });
  } catch (e) { next(e); }
});

router.patch('/campaigns/:id', requirePermission('write'), async (req, res, next) => {
  try {
    const c = await db.getCampaign(req.params.id, req.userId);
    if (!c) return res.status(404).json({ error: 'Campaign not found' });

    const allowed = ['is_active', 'name', 'title_template', 'body_template'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await db.updateCampaign(req.params.id, req.userId, updates);
    res.json({ ok: true, updated: Object.keys(updates) });
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  JOBS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/jobs', requirePermission('read'), async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '20'), 100);
    const offset = parseInt(req.query.offset || '0');
    const status = req.query.status || null;

    const { jobs, total } = await db.getJobsPaged(req.userId, { limit, offset, status });
    res.json({
      data: jobs.map(j => ({
        id: j.id, campaign_id: j.campaign_id, campaign_name: j.campaign_name,
        profile_id: j.profile_id, profile_name: j.profile_name,
        status: j.status, title: j.title,
        error_message: j.error_message, topic_url: j.topic_url,
        scheduled_at: j.scheduled_at, started_at: j.started_at,
        completed_at: j.completed_at, created_at: j.created_at,
      })),
      total,
      limit,
      offset,
    });
  } catch (e) { next(e); }
});

router.get('/jobs/stats', requirePermission('read'), async (req, res, next) => {
  try {
    const stats = await db.getJobStats(req.userId);
    const todayCount = await db.countJobsToday(req.userId);
    res.json({
      ...stats,
      today: todayCount,
    });
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  SUBSCRIPTION
// ═══════════════════════════════════════════════════════════════════════════

router.get('/subscription', requirePermission('read'), async (req, res, next) => {
  try {
    const sub = await db.getActiveSubscription(req.userId);
    if (!sub) return res.json(null);
    res.json({
      plan_id:     sub.plan_id,
      plan_name:   sub.plan_name,
      status:      sub.status,
      expires_at:  sub.expires_at,
      trial_ends_at: sub.trial_ends_at,
      limits: {
        max_steam_accounts: sub.max_steam_accounts,
        max_campaigns:      sub.max_campaigns,
        max_jobs_per_day:   sub.max_jobs_per_day,
        max_steam_groups:   sub.max_steam_groups ?? 0,
      },
    });
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  BOT CONTROL
// ═══════════════════════════════════════════════════════════════════════════

router.get('/bot/status', requirePermission('read'), async (req, res) => {
  res.json(await SteamBotManager.getStatus(req.userId));
});

router.post('/bot/start', requirePermission('write'), (req, res) => {
  SteamBotManager.start(req.userId);
  res.json({ ok: true, message: 'Bot started' });
});

router.post('/bot/stop', requirePermission('write'), (req, res) => {
  SteamBotManager.stop(req.userId);
  res.json({ ok: true, message: 'Bot stopped' });
});

module.exports = router;
