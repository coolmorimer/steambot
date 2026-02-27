'use strict';

const express = require('express');
const db      = require('../db');
const { requireAuth, requireActiveUser } = require('../middleware/auth');
const { checkLimit }  = require('../middleware/subscription');
const SteamBotManager = require('../services/SteamBotManager');

const router = express.Router();
const ALL    = [requireAuth, requireActiveUser];

router.get('/', ALL, async (req, res, next) => {
  try { res.json(await db.getCampaigns(req.userId)); }
  catch (e) { next(e); }
});

router.get('/:id', ALL, async (req, res, next) => {
  try {
    const c = await db.getCampaign(req.params.id, req.userId);
    if (!c) return res.status(404).json({ error: 'Кампания не найдена' });
    res.json(c);
  } catch (e) { next(e); }
});

router.post('/', ALL, ...checkLimit.campaigns, async (req, res, next) => {
  try {
    const { name, title_template, body_template,
            schedule_minutes, schedule_times,
            window_start, window_end, profile_ids, target_url } = req.body;

    if (!name)           return res.status(400).json({ error: 'name обязателен' });
    if (!title_template) return res.status(400).json({ error: 'title_template обязателен' });
    if (!body_template)  return res.status(400).json({ error: 'body_template обязателен' });
    if (!profile_ids || !Array.isArray(profile_ids) || profile_ids.length === 0)
      return res.status(400).json({ error: 'profile_ids должен быть непустым массивом' });

    for (const pid of profile_ids) {
      if (!await db.getProfile(pid, req.userId))
        return res.status(400).json({ error: `Аккаунт ${pid} не найден` });
    }

    const id = await db.addCampaign(req.userId, {
      name, titleTemplate: title_template, bodyTemplate: body_template,
      scheduleMinutes: schedule_minutes, scheduleTimes: schedule_times,
      windowStart: window_start, windowEnd: window_end, profileIds: profile_ids,
      targetUrl: target_url,
    });

    SteamBotManager.notifyNewCampaign(req.userId);
    await db.auditLog(req.userId, 'campaign.create', 'campaign', id, { name });
    res.status(201).json(await db.getCampaign(id, req.userId));
  } catch (e) { next(e); }
});

router.patch('/:id', ALL, async (req, res, next) => {
  try {
    const c = await db.getCampaign(req.params.id, req.userId);
    if (!c) return res.status(404).json({ error: 'Кампания не найдена' });

    const { name, title_template, body_template, schedule_minutes,
            schedule_times, window_start, window_end, profile_ids, is_active, target_url } = req.body;

    const updates = {};
    if (name             !== undefined) updates.name             = name;
    if (title_template   !== undefined) updates.title_template   = title_template;
    if (body_template    !== undefined) updates.body_template    = body_template;
    if (schedule_minutes !== undefined) updates.schedule_minutes = schedule_minutes;
    if (schedule_times   !== undefined) updates.schedule_times   = schedule_times;
    if (window_start     !== undefined) updates.window_start     = window_start;
    if (window_end       !== undefined) updates.window_end       = window_end;
    if (profile_ids      !== undefined) updates.profile_ids      = profile_ids;
    if (is_active        !== undefined) updates.is_active        = is_active ? 1 : 0;
    if (target_url       !== undefined) updates.target_url       = target_url;

    await db.updateCampaign(req.params.id, req.userId, updates);
    await db.deletePendingJobsByCampaign(req.params.id, req.userId);

    const refreshed = await db.getCampaign(req.params.id, req.userId);
    if (refreshed.is_active) SteamBotManager.notifyNewCampaign(req.userId);

    res.json(refreshed);
  } catch (e) { next(e); }
});

router.post('/:id/toggle', ALL, async (req, res, next) => {
  try {
    const c = await db.getCampaign(req.params.id, req.userId);
    if (!c) return res.status(404).json({ error: 'Кампания не найдена' });

    const newState = !c.is_active;
    await db.updateCampaign(req.params.id, req.userId, { is_active: newState ? 1 : 0 });
    await db.deletePendingJobsByCampaign(req.params.id, req.userId);
    if (newState) SteamBotManager.notifyNewCampaign(req.userId);

    res.json({ ok: true, is_active: newState });
  } catch (e) { next(e); }
});

router.delete('/:id', ALL, async (req, res, next) => {
  try {
    const c = await db.getCampaign(req.params.id, req.userId);
    if (!c) return res.status(404).json({ error: 'Кампания не найдена' });

    await db.deleteCampaign(req.params.id, req.userId);
    await db.auditLog(req.userId, 'campaign.delete', 'campaign', req.params.id, { name: c.name });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
