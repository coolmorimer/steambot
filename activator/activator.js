'use strict';
/**
 * Steam Poster Bot — Activator (Admin Panel)
 * ──────────────────────────────────────────
 * Запуск: node activator.js
 * Откройте: http://localhost:3848
 *
 * Текущие настройки читаются из config.json (создаётся при первом запуске).
 */

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const http    = require('http');
const https   = require('https');

const CONFIG_FILE = path.join(__dirname, 'config.json');
const PORT        = 3848;

// ─── Конфигурация ──────────────────────────────────────────────────────────
let config = {
  serverUrl:   'http://localhost:3847',
  adminToken:  'CHANGE_ME_ADMIN_SECRET',
};

if (fs.existsSync(CONFIG_FILE)) {
  try { config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; }
  catch (_) {}
}

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

// ─── Прокси к license-server ───────────────────────────────────────────────
function adminRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const u     = new URL(config.serverUrl + endpoint);
    const lib   = u.protocol === 'https:' ? https : http;
    const data  = body ? JSON.stringify(body) : null;

    const options = {
      hostname: u.hostname,
      port:     u.port || (u.protocol === 'https:' ? 443 : 80),
      path:     u.pathname + u.search,
      method,
      headers: {
        'Content-Type':    'application/json',
        'X-Admin-Token':   config.adminToken,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const req = lib.request(options, (res) => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (_) { reject(new Error('Bad JSON: ' + raw)); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ─── Express ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: получить конфиг
app.get('/api/config', (_, res) => res.json({ ...config, adminToken: '***' }));

// API: сохранить конфиг
app.post('/api/config', (req, res) => {
  const { serverUrl, adminToken } = req.body ?? {};
  if (serverUrl)     config.serverUrl   = serverUrl;
  if (adminToken && adminToken !== '***') config.adminToken = adminToken;
  saveConfig();
  res.json({ ok: true });
});

// API: проверить связь с сервером
app.get('/api/health', async (_, res) => {
  try {
    const r = await adminRequest('GET', '/health');
    res.json({ ok: true, server: r });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// API: список ключей
app.get('/api/keys', async (_, res) => {
  try {
    const r = await adminRequest('GET', '/admin/keys');
    res.json(r);
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// API: сгенерировать ключ
app.post('/api/generate', async (req, res) => {
  try {
    const r = await adminRequest('POST', '/admin/generate', req.body);
    res.json(r);
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// API: отозвать ключ
app.post('/api/revoke', async (req, res) => {
  try {
    const r = await adminRequest('POST', '/admin/revoke', req.body);
    res.json(r);
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// API: восстановить ключ
app.post('/api/restore', async (req, res) => {
  try {
    const r = await adminRequest('POST', '/admin/restore', req.body);
    res.json(r);
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n╔═══════════════════════════════════════╗`);
  console.log(`║  Steam Poster Bot — Activator Panel   ║`);
  console.log(`║  http://localhost:${PORT}               ║`);
  console.log(`╚═══════════════════════════════════════╝\n`);
});
