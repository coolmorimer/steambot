'use strict';

const express = require('express');
const db      = require('../db');
const { requireAuth, requireActiveUser } = require('../middleware/auth');

const router = express.Router();

// GET /api/steam-groups — список доступных Steam-групп
router.get('/', [requireAuth, requireActiveUser], async (req, res, next) => {
  try {
    const groups = await db.getSteamGroups(true);

    // Получить лимит из подписки
    const sub = await db.getActiveSubscription(req.userId);
    const maxGroups = sub?.max_steam_groups ?? 0;

    res.json({ groups, max_steam_groups: maxGroups });
  } catch (e) { next(e); }
});

module.exports = router;
