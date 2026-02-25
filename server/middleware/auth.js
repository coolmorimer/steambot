'use strict';

/**
 * server/middleware/auth.js
 *
 * JWT-аутентификация.
 * Декодирует Bearer-токен из заголовка Authorization
 * и добавляет req.user = { id, email, role }.
 */

const jwt    = require('jsonwebtoken');
const config = require('../config');
const db     = require('../db');

/**
 * requireAuth — обязательная аутентификация.
 * 401 если токен отсутствует или невалиден.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.userId = payload.sub;
    req.user   = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({
      error: err.name === 'TokenExpiredError'
        ? 'Токен истёк. Выполните повторный вход.'
        : 'Недействительный токен',
    });
  }
}

/**
 * requireAdmin — только для администраторов.
 */
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    next();
  });
}

/**
 * optionalAuth — аутентификация опциональна.
 * Если токен есть и валиден — заполняет req.user.
 * Если нет — продолжает без ошибки.
 */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwt.secret);
      req.userId = payload.sub;
      req.user   = { id: payload.sub, email: payload.email, role: payload.role };
    } catch (_) { /* игнорируем */ }
  }
  next();
}

/**
 * requireActiveUser — проверяет что пользователь активен в БД.
 * Использовать ПОСЛЕ requireAuth.
 */
async function requireActiveUser(req, res, next) {
  try {
    const user = await db.getUserById(req.userId);
    if (!user || !user.is_active) {
      return res.status(403).json({ error: 'Аккаунт заблокирован' });
    }
    req.dbUser = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth, requireAdmin, optionalAuth, requireActiveUser };
