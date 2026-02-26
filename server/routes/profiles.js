'use strict';

const express = require('express');
const db       = require('../db');
const { requireAuth, requireActiveUser } = require('../middleware/auth');
const { checkLimit }  = require('../middleware/subscription');
const steamLogin      = require('../services/SteamLoginManager');

const router = express.Router();
const ALL    = [requireAuth, requireActiveUser];

router.get('/', ALL, async (req, res, next) => {
  try {
    const profiles = (await db.getProfiles(req.userId)).map(p => ({
      id: p.id, name: p.name, target_url: p.target_url,
      is_active: p.is_active, created_at: p.created_at,
    }));
    res.json(profiles);
  } catch (e) { next(e); }
});

router.post('/import', ALL, ...checkLimit.profiles, async (req, res, next) => {
  try {
    const { name, cookies, target_url } = req.body;
    if (!name) return res.status(400).json({ error: 'name обязателен' });
    if (!cookies || !Array.isArray(cookies) || cookies.length === 0)
      return res.status(400).json({ error: 'cookies должны быть непустым массивом' });

    const id = await db.addProfile(req.userId, { name, cookies, targetUrl: target_url || null });
    await db.auditLog(req.userId, 'profile.import', 'profile', id, { name });
    res.status(201).json({ ok: true, id });
  } catch (e) { next(e); }
});

router.post('/login/start', ALL, ...checkLimit.profiles, async (req, res, next) => {
  try {
    const { name, target_url, mode = 'qr' } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name обязателен' });
    if (!['qr', 'credentials'].includes(mode))
      return res.status(400).json({ error: 'mode: qr | credentials' });

    const sessionId = await steamLogin.startSession(req.userId, name.trim(), target_url || null, mode);
    res.status(201).json({ ok: true, sessionId });
  } catch (e) { next(e); }
});

router.get('/login/:sid/qr', ALL, async (req, res, next) => {
  try {
    const qr = await steamLogin.getQRCode(req.params.sid);
    if (!qr) return res.status(404).json({ error: 'QR не готов, подождите' });
    res.json({ ok: true, qr });
  } catch (e) { next(e); }
});

router.post('/login/:sid/credentials', ALL, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'username и password обязательны' });
    const result = await steamLogin.fillCredentials(req.params.sid, username, password);
    res.json({ ok: true, ...result });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/login/:sid/guard', ALL, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'code обязателен' });
    await steamLogin.fillGuardCode(req.params.sid, code);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/login/:sid/screenshot', ALL, async (req, res, next) => {
  try {
    const screenshot = await steamLogin.getScreenshot(req.params.sid);
    const debug = steamLogin.getDebugScreenshot(req.params.sid);
    const img = screenshot || debug;
    if (!img) return res.status(404).json({ error: 'Скриншот не доступен' });
    res.json({ ok: true, screenshot: img });
  } catch (e) { next(e); }
});

router.get('/login/:sid/status', ALL, async (req, res, next) => {
  try {
    const sid  = req.params.sid;
    const info = steamLogin.getStatus(sid);

    if (info.status === 'done' && info.cookies) {
      let profileId = steamLogin.getSavedProfileId(sid);
      if (!profileId) {
        profileId = await db.addProfile(req.userId, {
          name: info.name, cookies: info.cookies, targetUrl: info.targetUrl || null,
        });
        await db.auditLog(req.userId, 'profile.add', 'profile', profileId, { name: info.name, method: 'qr_login' });
        steamLogin.markSaved(sid, profileId);
      }
      return res.json({ status: 'done', profileId });
    }

    res.json({ status: info.status, expiresAt: info.expiresAt, error: info.error || undefined });
  } catch (e) { next(e); }
});

router.delete('/login/:sid', ALL, async (req, res, next) => {
  try {
    await steamLogin.cancelSession(req.params.sid);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/', ALL, ...checkLimit.profiles, async (req, res) => {
  return res.status(410).json({
    error: 'Используйте /login/start для QR-входа или /import для импорта cookies.',
  });
});

router.patch('/:id', ALL, async (req, res, next) => {
  try {
    const profile = await db.getProfile(req.params.id, req.userId);
    if (!profile) return res.status(404).json({ error: 'Аккаунт не найден' });

    const { name, target_url, is_active } = req.body;
    const updates = {};
    if (name       !== undefined) updates.name       = name;
    if (target_url !== undefined) updates.target_url = target_url;
    if (is_active  !== undefined) updates.is_active  = is_active ? 1 : 0;

    await db.updateProfile(req.params.id, req.userId, updates);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/:id/inventory-post', ALL, async (req, res, next) => {
  try {
    const profile = await db.getProfile(req.params.id, req.userId);
    if (!profile) return res.status(404).json({ error: 'Аккаунт не найден' });
    if (!profile.cookies) return res.status(400).json({ error: 'Нет активной сессии' });

    const variant = parseInt(req.query.variant ?? '0', 10);
    const { fetchInventory } = require(require('path').join(__dirname, '..', '..', 'inventory.js'));
    const PostTpl = require('../services/PostTemplateGenerator');

    const { items, tradeUrl } = await fetchInventory(profile);
    const body  = PostTpl.buildFullPost(items, tradeUrl || '', variant);
    const title = PostTpl.TITLE_VARIANTS[variant % PostTpl.TITLE_VARIANTS.length];
    const knives   = items.filter(i => i.category === 'knife').length;
    const stattrak = items.filter(i => i.stattrak).length;
    const resolvedTitle = title
      .replace(/\{items_count\}/gi,    String(items.length))
      .replace(/\{knives_count\}/gi,   String(knives))
      .replace(/\{stattrak_count\}/gi, String(stattrak))
      .replace(/\{best_item\}/gi,      items[0]?.name || '')
      .replace(/\{date\}/gi,           new Date().toLocaleDateString('ru-RU'));

    res.json({
      ok: true, title: resolvedTitle, body,
      meta: { items_count: items.length, knives_count: knives, stattrak_count: stattrak, trade_url: tradeUrl },
    });
  } catch (e) { next(e); }
});

router.post('/:id/toggle', ALL, async (req, res, next) => {
  try {
    const profile = await db.getProfile(req.params.id, req.userId);
    if (!profile) return res.status(404).json({ error: 'Аккаунт не найден' });
    const newState = !profile.is_active;
    await db.updateProfile(req.params.id, req.userId, { is_active: newState ? 1 : 0 });
    res.json({ ok: true, is_active: newState });
  } catch (e) { next(e); }
});

router.delete('/:id', ALL, async (req, res, next) => {
  try {
    const profile = await db.getProfile(req.params.id, req.userId);
    if (!profile) return res.status(404).json({ error: 'Аккаунт не найден' });
    await db.deleteProfile(req.params.id, req.userId);
    await db.auditLog(req.userId, 'profile.delete', 'profile', req.params.id, { name: profile.name });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
