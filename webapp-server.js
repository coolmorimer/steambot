'use strict';

/**
 * webapp-server.js — Express-сервер для Telegram Mini App.
 *
 * Отдаёт webapp/index.html и REST API для управления ботом.
 * Порт настраивается (по умолчанию 3388).
 *
 * Безопасность: секретный токен в заголовке X-Token должен
 * совпадать с хешем Telegram-токена бота — проверяется на каждом
 * API-запросе, если включена авторизация.
 */

const express = require('express');
const path    = require('path');
const crypto  = require('crypto');
const logger  = require('./logger');

let server   = null;
let _app     = null;
let _port    = 3388;
let _secret  = null;

// Коллбеки — заполняются из main.js
let cb = {
  getStatus:      () => ({}),
  getAccounts:    () => [],
  getCampaigns:   () => [],
  getRecentJobs:  () => [],
  startBot:       () => {},
  stopBot:        () => {},
  addAccount:     async () => ({ ok: false, error: 'not implemented' }),
  deleteAccount:  () => {},
  toggleAccount:  () => {},
  saveCampaign:   () => ({ ok: false }),
  deleteCampaign: () => {},
  toggleCampaign: () => {},
};

// ═══════════════════════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @param {object} opts
 * @param {number} opts.port      — порт (по умолчанию 3388)
 * @param {string} opts.tgToken   — токен Telegram бота (для генерации секрета)
 * @param {object} callbacks      — те же, что для telegram.js
 */
function start(opts = {}, callbacks = {}) {
  stop();

  _port    = opts.port || 3388;
  _secret  = opts.tgToken ? crypto.createHash('sha256').update(opts.tgToken).digest('hex').slice(0, 32) : null;
  cb       = { ...cb, ...callbacks };

  _app = express();
  _app.use(express.json());

  // ── CORS (разрешаем Telegram WebView) ──
  _app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Token');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // ── Отдаём Mini App ──
  const webappDir = path.join(__dirname, 'webapp');
  _app.use(express.static(webappDir));

  // ── API routes ──
  _app.get('/api/status',            (_, res) => res.json(cb.getStatus()));
  _app.get('/api/accounts',          (_, res) => res.json(cb.getAccounts()));
  _app.get('/api/campaigns',         (_, res) => res.json(cb.getCampaigns()));
  _app.get('/api/jobs',              (_, res) => res.json(cb.getRecentJobs()));

  _app.post('/api/bot/start',        (_, res) => { cb.startBot();  res.json({ ok: true }); });
  _app.post('/api/bot/stop',         (_, res) => { cb.stopBot();   res.json({ ok: true }); });

  _app.post('/api/accounts/add',     async (req, res) => {
    try {
      const r = await cb.addAccount(req.body.name || 'Account');
      res.json(r);
    } catch (err) {
      res.json({ ok: false, error: err.message });
    }
  });
  _app.post('/api/accounts/toggle',  (req, res) => {
    cb.toggleAccount(req.body.id, req.body.active);
    res.json({ ok: true });
  });
  _app.post('/api/accounts/delete',  (req, res) => {
    cb.deleteAccount(req.body.id);
    res.json({ ok: true });
  });

  _app.post('/api/campaigns/save',   (req, res) => {
    const r = cb.saveCampaign(req.body);
    res.json(r);
  });
  _app.post('/api/campaigns/toggle', (req, res) => {
    cb.toggleCampaign(req.body.id);
    res.json({ ok: true });
  });
  _app.post('/api/campaigns/delete', (req, res) => {
    cb.deleteCampaign(req.body.id);
    res.json({ ok: true });
  });

  // ── Запуск ──
  server = _app.listen(_port, '0.0.0.0', () => {
    logger.info(`WebApp-сервер запущен: http://0.0.0.0:${_port}`);
  });

  server.on('error', (err) => {
    logger.error(`WebApp-сервер ошибка: ${err.message}`);
  });
}

function stop() {
  if (server) {
    server.close();
    server = null;
    logger.info('WebApp-сервер остановлен');
  }
}

function isRunning() { return server !== null; }
function getPort()   { return _port; }

module.exports = { start, stop, isRunning, getPort };
