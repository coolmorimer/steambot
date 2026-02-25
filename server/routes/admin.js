'use strict';

const express = require('express');
const db      = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', requireAdmin, async (req, res, next) => {
  try { res.json(await db.getAdminStats()); }
  catch (e) { next(e); }
});

router.get('/users', requireAdmin, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '50'), 200);
    const offset = parseInt(req.query.offset || '0');
    const search = req.query.search || '';
    const [users, total] = await Promise.all([
      db.getAdminUserList({ limit, offset, search }),
      db.countUsers(),
    ]);
    res.json({ users, total, limit, offset });
  } catch (e) { next(e); }
});

router.get('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const [sub, history, profiles, campaigns, stats] = await Promise.all([
      db.getActiveSubscription(req.params.id),
      db.getSubscriptionHistory(req.params.id),
      db.getProfiles(req.params.id),
      db.getCampaigns(req.params.id),
      db.getJobStats(req.params.id),
    ]);

    res.json({
      user, subscription: sub, subscription_history: history,
      profiles: profiles.map(p => ({ id: p.id, name: p.name, is_active: p.is_active, created_at: p.created_at })),
      campaigns, stats,
    });
  } catch (e) { next(e); }
});

router.patch('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const { is_active, role, name } = req.body;
    const updates = {};
    if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;
    if (role      !== undefined) updates.role      = role;
    if (name      !== undefined) updates.name      = name;

    await db.updateUser(req.params.id, updates);
    await db.auditLog(req.user.id, 'admin.user.update', 'user', req.params.id, updates);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    if (req.params.id === req.userId)
      return res.status(400).json({ error: 'Нельзя удалить себя' });

    const user = await db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    await db.deleteUser(req.params.id);
    await db.auditLog(req.user.id, 'admin.user.delete', 'user', req.params.id, { email: user.email });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/users/:id/subscription', requireAdmin, async (req, res, next) => {
  try {
    const { plan_id, billing_period = 'monthly', expires_at, status = 'active' } = req.body;

    const [user, plan] = await Promise.all([
      db.getUserById(req.params.id),
      db.getPlan(plan_id),
    ]);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (!plan) return res.status(400).json({ error: 'План не найден' });

    const subId = await db.createSubscription({ userId: req.params.id, planId: plan_id, billingPeriod: billing_period, status });
    if (expires_at) await db.updateSubscription(subId, { expires_at });

    await db.auditLog(req.user.id, 'admin.subscription.set', 'subscription', subId, {
      user_id: req.params.id, plan_id, status,
    });
    res.json({ ok: true, subscription_id: subId });
  } catch (e) { next(e); }
});

router.get('/plans', requireAdmin, async (req, res, next) => {
  try { res.json(await db.getPlans(false)); }
  catch (e) { next(e); }
});

router.put('/plans/:id', requireAdmin, async (req, res, next) => {
  try {
    await db.upsertPlan({ ...req.body, id: req.params.id });
    await db.auditLog(req.user.id, 'admin.plan.upsert', 'plan', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/plans/:id', requireAdmin, async (req, res, next) => {
  try {
    await db.upsertPlan({ id: req.params.id, is_active: false });
    await db.auditLog(req.user.id, 'admin.plan.deactivate', 'plan', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
