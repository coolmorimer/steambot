'use strict';

const express = require('express');
const db      = require('../db');
const logger  = require('../logger');
const { requireAuth, requireActiveUser } = require('../middleware/auth');

const router = express.Router();

/* ═══════ BROWSE TRADE OFFERS (PUBLIC) ═══════ */

router.get('/', async (req, res) => {
  try {
    const { search, sort, page, limit: qLimit } = req.query;
    const limit  = Math.min(parseInt(qLimit) || 20, 100);
    const offset = ((parseInt(page) || 1) - 1) * limit;
    const filters = { status: 'active', search: search || '', sort: sort || 'bumped', limit, offset };
    const [items, total] = await Promise.all([
      db.getTradeOffers(filters),
      db.countTradeOffers(filters),
    ]);
    res.json({ items, total, page: (parseInt(page) || 1), pages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error('trades list error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ═══════ SINGLE TRADE ═══════ */

router.get('/:id', async (req, res) => {
  try {
    const trade = await db.getTradeOffer(parseInt(req.params.id));
    if (!trade) return res.status(404).json({ error: 'Трейд не найден' });
    res.json(trade);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ═══════ MY TRADES ═══════ */

router.get('/my/offers', requireAuth, async (req, res) => {
  try {
    const items = await db.getUserTradeOffers(req.userId);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ═══════ CREATE TRADE OFFER ═══════ */

router.post('/', requireAuth, requireActiveUser, async (req, res) => {
  try {
    const { title, description, offering_items, wanted_items, wanted_tags, total_value } = req.body;
    if (!offering_items?.length) return res.status(400).json({ error: 'Укажите предметы для обмена' });

    const id = await db.createTradeOffer({
      creatorId: req.userId,
      title,
      description,
      offeringItems: offering_items,
      wantedItems:   wanted_items || [],
      wantedTags:    wanted_tags || [],
      totalValue:    total_value || 0,
    });

    logger.info('Новый трейд', { id, userId: req.userId });
    res.status(201).json({ id });
  } catch (err) {
    logger.error('create trade error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ═══════ UPDATE TRADE ═══════ */

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const trade = await db.getTradeOffer(parseInt(req.params.id));
    if (!trade) return res.status(404).json({ error: 'Не найдено' });
    if (trade.creator_id !== req.userId) return res.status(403).json({ error: 'Нет доступа' });
    if (trade.status !== 'active') return res.status(400).json({ error: 'Трейд не активен' });

    const { title, description, offering_items, wanted_items, wanted_tags } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (offering_items) updates.offering_items = offering_items;
    if (wanted_items) updates.wanted_items = wanted_items;
    if (wanted_tags) updates.wanted_tags = wanted_tags;

    await db.updateTradeOffer(trade.id, updates);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ═══════ BUMP TRADE ═══════ */

router.post('/:id/bump', requireAuth, async (req, res) => {
  try {
    await db.bumpTradeOffer(parseInt(req.params.id), req.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ═══════ CANCEL TRADE ═══════ */

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const trade = await db.getTradeOffer(parseInt(req.params.id));
    if (!trade) return res.status(404).json({ error: 'Не найдено' });
    if (trade.creator_id !== req.userId) return res.status(403).json({ error: 'Нет доступа' });
    await db.updateTradeOffer(trade.id, { status: 'cancelled' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
