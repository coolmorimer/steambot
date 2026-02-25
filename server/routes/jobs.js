'use strict';

const express = require('express');
const db      = require('../db');
const { requireAuth, requireActiveUser } = require('../middleware/auth');

const router = express.Router();
const ALL    = [requireAuth, requireActiveUser];

router.get('/', ALL, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '20'), 200);
    const offset = Math.max(parseInt(req.query.offset || '0'),  0);
    const status = req.query.status || null;
    res.json(await db.getJobsPaged(req.userId, { limit, offset, status }));
  } catch (e) { next(e); }
});

router.get('/stats', ALL, async (req, res, next) => {
  try {
    const rows  = await db.getJobStats(req.userId);
    const stats = { pending: 0, running: 0, done: 0, failed: 0, cancelled: 0 };
    for (const r of rows) stats[r.status] = Number(r.count);
    stats.today = await db.countJobsToday(req.userId);
    res.json(stats);
  } catch (e) { next(e); }
});

router.post('/:id/cancel', ALL, async (req, res, next) => {
  try {
    await db.updateJobStatus(req.params.id, req.userId, 'cancelled');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:id', ALL, async (req, res, next) => {
  try {
    await db.deleteJob(req.params.id, req.userId);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
