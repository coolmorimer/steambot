'use strict';

/**
 * server/routes/support.js
 *
 * API чата поддержки и баг-репортов.
 */

const express  = require('express');
const db       = require('../db');
const config   = require('../config');
const logger   = require('../logger');
const email    = require('../services/EmailService');
const { requireAuth, requireActiveUser, requireAdmin } = require('../middleware/auth');

const router  = express.Router();
const ALL     = [requireAuth, requireActiveUser];
const ADMIN   = [requireAuth, requireAdmin];

// ═══════════════════════════════════════════════════════════════════════════
//  Чат поддержки
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/support/messages — история чата пользователя */
router.get('/messages', ALL, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, direction, body, read, created_at
       FROM support_messages
       WHERE user_id = $1
       ORDER BY created_at ASC
       LIMIT 200`,
      [req.userId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

/** POST /api/support/messages — отправить сообщение в поддержку */
router.post('/messages', ALL, async (req, res, next) => {
  try {
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'Пустое сообщение' });

    const { rows } = await db.query(
      `INSERT INTO support_messages (user_id, direction, body)
       VALUES ($1, 'in', $2) RETURNING *`,
      [req.userId, body.trim().substring(0, 2000)]
    );

    // Уведомление на email администратора
    const user = await db.getUserById(req.userId);
    const adminEmail = config.admin.email;
    if (adminEmail && adminEmail !== 'admin@steambot.local') {
      email.send({
        to: adminEmail,
        subject: `💬 Новое сообщение от ${user?.name || user?.email || req.userId}`,
        html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
  <h3 style="color:#66c0f4;">💬 Сообщение в поддержку</h3>
  <p><b>Пользователь:</b> ${user?.name || '—'} (${user?.email || '—'})</p>
  <div style="background:#1b2838;color:#c6d4df;padding:16px;border-radius:8px;margin:12px 0;">
    ${body.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>')}
  </div>
  <p style="color:#888;font-size:13px;">Ответьте через панель администратора.</p>
</div>`,
      }).catch(() => {});
    }

    logger.info(`[Support] Chat message from user ${req.userId}`);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/** GET /api/support/unread — кол-во непрочитанных ответов от админа */
router.get('/unread', ALL, async (req, res, next) => {
  try {
    const row = await db.getOne(
      `SELECT COUNT(*) AS cnt FROM support_messages
       WHERE user_id = $1 AND direction = 'out' AND read = FALSE`,
      [req.userId]
    );
    res.json({ count: parseInt(row?.cnt || '0') });
  } catch (e) { next(e); }
});

/** POST /api/support/messages/read — пометить ответы админа как прочитанные */
router.post('/messages/read', ALL, async (req, res, next) => {
  try {
    await db.query(
      `UPDATE support_messages SET read = TRUE
       WHERE user_id = $1 AND direction = 'out' AND read = FALSE`,
      [req.userId]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  Баг-репорты
// ═══════════════════════════════════════════════════════════════════════════

/** POST /api/support/bugs — отправить баг-репорт */
router.post('/bugs', ALL, async (req, res, next) => {
  try {
    const { subject, body, screenshot } = req.body;
    if (!subject?.trim() || !body?.trim()) {
      return res.status(400).json({ error: 'Заполните тему и описание' });
    }

    // Ограничиваем screenshot до 5МБ base64
    let screenshotData = null;
    if (screenshot && typeof screenshot === 'string') {
      if (screenshot.length > 7 * 1024 * 1024) {
        return res.status(400).json({ error: 'Скриншот слишком большой (макс 5 МБ)' });
      }
      screenshotData = screenshot;
    }

    const { rows } = await db.query(
      `INSERT INTO bug_reports (user_id, subject, body, screenshot)
       VALUES ($1, $2, $3, $4) RETURNING id, subject, status, created_at`,
      [req.userId, subject.trim().substring(0, 255), body.trim().substring(0, 5000), screenshotData]
    );

    // Email администратору
    const user = await db.getUserById(req.userId);
    const adminEmail = config.admin.email;
    if (adminEmail && adminEmail !== 'admin@steambot.local') {
      const attachments = [];
      if (screenshotData) {
        // Извлекаем base64 из data-url
        const match = screenshotData.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
        if (match) {
          attachments.push({
            filename: `screenshot.${match[1]}`,
            content: match[2],
            encoding: 'base64',
          });
        }
      }

      email.send({
        to: adminEmail,
        subject: `🐛 Баг-репорт: ${subject.trim().substring(0, 80)}`,
        html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
  <h3 style="color:#e74c3c;">🐛 Баг-репорт</h3>
  <p><b>Пользователь:</b> ${user?.name || '—'} (${user?.email || '—'})</p>
  <p><b>Тема:</b> ${subject.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
  <div style="background:#1b2838;color:#c6d4df;padding:16px;border-radius:8px;margin:12px 0;">
    ${body.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>')}
  </div>
  ${screenshotData ? '<p style="color:#888;">📎 Скриншот прикреплён к письму</p>' : ''}
  <p style="color:#888;font-size:13px;">Steam Poster Bot — Bug Report</p>
</div>`,
        attachments,
      }).catch(() => {});
    }

    logger.info(`[Support] Bug report from user ${req.userId}: ${subject.trim()}`);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/** GET /api/support/bugs — список своих баг-репортов */
router.get('/bugs', ALL, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, subject, status, created_at
       FROM bug_reports WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [req.userId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  Admin: управление поддержкой
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/support/admin/chats — список пользователей с чатами */
router.get('/admin/chats', ADMIN, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT sm.user_id, u.name, u.email,
             MAX(sm.created_at) AS last_message,
             COUNT(*) FILTER (WHERE sm.direction='in' AND sm.read=FALSE) AS unread
      FROM support_messages sm
      JOIN users u ON u.id = sm.user_id
      GROUP BY sm.user_id, u.name, u.email
      ORDER BY last_message DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

/** GET /api/support/admin/chats/:userId — сообщения конкретного пользователя */
router.get('/admin/chats/:userId', ADMIN, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, direction, body, read, created_at
       FROM support_messages WHERE user_id = $1
       ORDER BY created_at ASC LIMIT 500`,
      [req.params.userId]
    );
    // Помечаем входящие как прочитанные
    await db.query(
      `UPDATE support_messages SET read = TRUE
       WHERE user_id = $1 AND direction = 'in' AND read = FALSE`,
      [req.params.userId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

/** POST /api/support/admin/chats/:userId — ответить пользователю */
router.post('/admin/chats/:userId', ADMIN, async (req, res, next) => {
  try {
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'Пустое сообщение' });

    const { rows } = await db.query(
      `INSERT INTO support_messages (user_id, direction, body)
       VALUES ($1, 'out', $2) RETURNING *`,
      [req.params.userId, body.trim().substring(0, 2000)]
    );
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/** GET /api/support/admin/bugs — все баг-репорты */
router.get('/admin/bugs', ADMIN, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT br.id, br.subject, br.body, br.status, br.created_at,
             br.screenshot IS NOT NULL AS has_screenshot,
             u.name AS user_name, u.email AS user_email
      FROM bug_reports br JOIN users u ON u.id = br.user_id
      ORDER BY br.created_at DESC LIMIT 100
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

/** GET /api/support/admin/bugs/:id — детали баг-репорта (включая screenshot) */
router.get('/admin/bugs/:id', ADMIN, async (req, res, next) => {
  try {
    const row = await db.getOne(`
      SELECT br.id, br.subject, br.body, br.screenshot, br.status, br.created_at,
             u.name AS user_name, u.email AS user_email
      FROM bug_reports br JOIN users u ON u.id = br.user_id
      WHERE br.id = $1
    `, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Баг-репорт не найден' });
    res.json(row);
  } catch (e) { next(e); }
});

/** PATCH /api/support/admin/bugs/:id — обновить статус */
router.patch('/admin/bugs/:id', ADMIN, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['open', 'in_progress', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Некорректный статус' });
    }
    await db.query('UPDATE bug_reports SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
