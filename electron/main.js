'use strict';

const { app, BrowserWindow, ipcMain, shell,
        Tray, Menu, nativeImage, Notification } = require('electron');
const path   = require('path');
const isDev        = process.env.NODE_ENV === 'development';
const isServiceMode = process.env.STEAM_BOT_MODE === 'service';

// Одно имя для userData у обеих версий → общая база данных
app.setName('Steam Poster Bot');

// Устанавливаем путь к данным ДО загрузки db/logger/poster,
// чтобы они писали в реальную папку, а не внутрь .asar-архива.
process.env.APP_USER_DATA = app.getPath('userData');

const db        = require('../db');
const logger    = require('../logger');
const poster    = require('../poster');
const scheduler = require('../scheduler');
const Bot       = require('../bot');
const license   = require('./license');
const telegram  = require('../telegram');
const webapp    = require('../webapp-server');
const ngrok     = require('../ngrok');
const inventory = require('../inventory');
const openai    = require('../openai');

let mainWindow = null;
let bot        = null;
let tray       = null;
let licenseMaxBots = 5;  // обновляется при каждой проверке лицензии

// ── Трей ──────────────────────────────────────────────────────────────────
function getTrayIcon() {
  const p = isDev
    ? path.join(__dirname, '..', 'build', 'icon.ico')
    : path.join(process.resourcesPath, 'tray.ico');
  try {
    const img = nativeImage.createFromPath(p);
    return img.isEmpty() ? nativeImage.createEmpty() : img;
  } catch (_) { return nativeImage.createEmpty(); }
}

function createTray() {
  tray = new Tray(getTrayIcon());
  tray.setToolTip('Steam Poster Bot');
  tray.on('double-click', showOrCreateWindow);
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const running = bot !== null;
  tray.setToolTip(`Steam Poster Bot  ${running ? '▪ работает' : '▪ остановлен'}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '🎮 Steam Poster Bot', enabled: false },
    { type: 'separator' },
    { label: running ? '🟢 Бот работает' : '🔴 Бот остановлен', enabled: false },
    { type: 'separator' },
    {
      label: running ? '⏹  Остановить бота' : '▶  Запустить бота',
      click() {
        if (running) { bot.stop(); bot = null; }
        else startBot();
        refreshTrayMenu();
        send('bot:status-changed', { running: bot !== null });
      },
    },
    { type: 'separator' },
    { label: '🖥  Открыть интерфейс', click: showOrCreateWindow },
    { type: 'separator' },
    {
      label: '✕  Выход',
      click() {
        if (bot) bot.stop();
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
        app.quit();
      },
    },
  ]));
}

function showOrCreateWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

// ── Запуск бота ────────────────────────────────────────────────────────────
function startBot() {
  if (bot) return;
  bot = new Bot({ headless: true });

  // Пересылаем логи бота в рендерер
  bot.on('log', (entry) => send('bot:log', entry));
  bot.on('account:expired', (data) => {
    send('account:expired', data);
    telegram.notifyAccountExpired(data.profileName);
  });

  const origRunJob = bot._runJob.bind(bot);
  bot._runJob = async function (job) {
    const current = db.getJob(job.id);
    if (!current || current.status === 'cancelled') return;

    send('job:update', { ...job, status: 'running' });
    await origRunJob(job);

    const updated = db.getJob(job.id);
    if (updated) {
      send('job:update', updated);
      // Telegram-уведомления
      if (updated.status === 'done') {
        telegram.notifySuccess(
          updated.profile_name || updated.profile_id,
          updated.title,
          updated.topic_url
        );
      } else if (updated.status === 'failed') {
        telegram.notifyError(
          updated.profile_name || updated.profile_id,
          updated.title,
          updated.error
        );
      }
    }
  };
  bot.start();
  telegram.notifyBotState(true);
}

// ── Создание окна ──────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1100,
    height: 720,
    minWidth:  900,
    minHeight: 600,
    backgroundColor: '#1b2838',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#1b2838', symbolColor: '#c7d5e0', height: 32 },
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173').catch(() =>
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    );
    mainWindow.webContents.once('did-fail-load', (_, code) => {
      if (code === -102) mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Закрытие окна → скрыть в трей (не выходить)
  mainWindow.on('close', e => {
    e.preventDefault();
    mainWindow.hide();
  });
}

app.whenReady().then(() => {
  createTray();
  initTelegram();       // ← Запуск Telegram-бота по сохранённым настройкам

  if (isServiceMode) {
    // Сервисный режим: сразу запускаем бота, окно не открываем
    startBot();
    refreshTrayMenu();
    if (Notification.isSupported()) {
      new Notification({
        title: 'Steam Poster Bot',
        body:  'Бот запущен в фоновом режиме. Управление — через иконку в трее.',
        silent: true,
      }).show();
    }
  } else {
    // UI режим: открываем окно
    createWindow();
    app.on('activate', () => {
      if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    });
  }
});

// Не выходим при закрытии всех окон — живём в трее.
// Выход только через пункт «Выход» в меню трея.
app.on('window-all-closed', () => { /* stay alive in tray */ });

app.on('before-quit', () => {
  ngrok.stop();
});

// ── Помощники ──────────────────────────────────────────────────────────────
function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  IPC — Аккаунты
// ═══════════════════════════════════════════════════════════════════════════

ipcMain.handle('accounts:list', () => {
  return db.getProfiles().map(p => ({ ...p, cookies: undefined }));
});

ipcMain.handle('accounts:login', async (_, name) => {
  // Проверяем лимит по тарифу
  const existing = db.getProfiles().length;
  if (existing >= licenseMaxBots) {
    return { ok: false, error: `Тариф ограничен ${licenseMaxBots} аккаунтами. Удалите лишние или перейдите на больший тариф.` };
  }
  send('accounts:login-status', { name, status: 'waiting' });
  try {
    const cookies = await poster.addProfileInteractive(name || 'Account');
    const id = db.addProfile(name || 'Account', cookies);
    send('accounts:login-status', { name, status: 'done', id });
    return { ok: true, id };
  } catch (err) {
    send('accounts:login-status', { name, status: 'error', error: err.message });
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('accounts:delete', (_, id) => {
  db.deleteProfile(id);
  return { ok: true };
});

// ═══════════════════════════════════════════════════════════════════════════
//  IPC — Кампании
// ═══════════════════════════════════════════════════════════════════════════

ipcMain.handle('campaigns:list', () => db.getCampaigns());

ipcMain.handle('campaigns:save', (_, data) => {
  if (data.id && db.getCampaign(data.id)) {
    // Обновление: удалить старую + создать новую с тем же id нельзя в better-sqlite3,
    // поэтому удаляем и создаём заново
    db.deleteCampaign(data.id);
  }
  const id = db.addCampaign({
    name:            data.name,
    titleTemplate:   data.title_template,
    bodyTemplate:    data.body_template,
    scheduleMinutes: data.schedule_minutes || 0,
    scheduleTimes:   data.schedule_times   || null,
    windowStart:     data.window_start     || '00:00',
    windowEnd:       data.window_end       || '23:59',
    profileIds:      data.profile_ids,
  });
  return { ok: true, id };
});

ipcMain.handle('campaigns:delete', (_, id) => {
  db.deleteCampaign(id);
  return { ok: true };
});

ipcMain.handle('campaigns:toggle', (_, id) => {
  const c = db.getCampaign(id);
  if (!c) return { ok: false };
  db.toggleCampaign(id, !c.is_active);
  return { ok: true, enabled: !c.is_active };
});

// ═══════════════════════════════════════════════════════════════════════════
//  IPC — Джобы / Активность
// ═══════════════════════════════════════════════════════════════════════════

ipcMain.handle('jobs:recent', (_, limit = 50) => db.getRecentJobs(limit));

ipcMain.handle('jobs:cancel', (_, id) => {
  const job = db.getJob(id);
  if (!job) return { ok: false, reason: 'not_found' };
  if (!['pending', 'running'].includes(job.status)) return { ok: false, reason: 'not_cancellable' };

  // Если джоб выполняется сейчас — помечаем для бота, чтобы тот игнорировал результат
  if (job.status === 'running' && bot) {
    bot._cancelledJobs.add(id);
  }

  db.cancelJob(id);
  const cancelled = db.getJob(id);
  if (cancelled) send('job:update', cancelled);
  return { ok: true };
});

ipcMain.handle('jobs:delete', (_, id) => {
  db.deleteJob(id);
  return { ok: true };
});

ipcMain.handle('jobs:clear', () => {
  const count = db.clearFinishedJobs();
  return { ok: true, count };
});

// ═══════════════════════════════════════════════════════════════════════════
//  IPC — Бот
// ═══════════════════════════════════════════════════════════════════════════

ipcMain.handle('bot:status', () => ({ running: bot !== null }));

ipcMain.handle('bot:start', () => {
  if (bot) return { ok: true, already: true };
  startBot();
  refreshTrayMenu();
  return { ok: true };
});

ipcMain.handle('bot:stop', () => {
  if (bot) { bot.stop(); bot = null; }
  refreshTrayMenu();
  telegram.notifyBotState(false);
  return { ok: true };
});

// Открыть URL во внешнем браузере (только http/https)
ipcMain.handle('shell:open', (_, url) => {
  if (typeof url !== 'string' || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return { ok: false, error: 'invalid_url' };
  }
  shell.openExternal(url);
  return { ok: true };
});

// ══════════════════════════════════════════════════════════════════════════
//  IPC — Лицензирование
// ══════════════════════════════════════════════════════════════════════════

ipcMain.handle('license:check', async () => {
  const result = await license.check();
  if (result.maxBots) licenseMaxBots = result.maxBots;
  return result;
});
ipcMain.handle('license:activate', async (_, k) => {
  const result = await license.activate(k);
  if (result.ok && result.maxBots) licenseMaxBots = result.maxBots;
  return result;
});
ipcMain.handle('license:hwid',       ()      => license.hwid());
ipcMain.handle('license:deactivate', ()      => { license.deactivate(); return { ok: true }; });

// ══════════════════════════════════════════════════════════════════════════
//  IPC — Настройки + Telegram
// ══════════════════════════════════════════════════════════════════════════

ipcMain.handle('settings:get', () => db.getAllSettings());

ipcMain.handle('settings:save', (_, data) => {
  for (const [key, value] of Object.entries(data)) {
    db.setSetting(key, value);
  }
  // Перезапуск Телеграм-бота с новыми настройками
  initTelegram();
  return { ok: true };
});

ipcMain.handle('telegram:test', async () => {
  const s = db.getAllSettings();
  if (!s.tg_token || !s.tg_chat_id) {
    return { ok: false, error: 'Укажите токен и Chat ID' };
  }
  try {
    const TelegramBot = require('node-telegram-bot-api');
    const testBot = new TelegramBot(s.tg_token);
    const ids = String(s.tg_chat_id).split(/[\s,;]+/).filter(Boolean);
    for (const cid of ids) {
      await testBot.sendMessage(cid, '🎮 *Steam Poster Bot* — тестовое сообщение ✅', { parse_mode: 'Markdown' });
    }
    return { ok: true, msg: `✅ Сообщение отправлено (${ids.length} чат${ids.length > 1 ? 'ов' : ''})!` };
  } catch (err) {
    return { ok: false, error: `Ошибка: ${err.message}` };
  }
});

// ── Инвентарь и AI-генерация постов ──────────────────────────────────────

ipcMain.handle('inventory:fetch', async (_, profileId) => {
  try {
    const profile = db.getProfile(profileId);
    if (!profile) return { ok: false, error: 'Аккаунт не найден' };
    const data = await inventory.fetchInventory(profile);
    return { ok: true, ...data };
  } catch (err) {
    logger.error(`[inventory] Ошибка загрузки инвентаря: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('inventory:generate-post', async (_, { profileId, useAI, useOllama, templateId }) => {
  try {
    const profile = db.getProfile(profileId);
    if (!profile) return { ok: false, error: 'Аккаунт не найден' };

    send('inventory:status', { profileId, status: 'fetching' });
    const data = await inventory.fetchInventory(profile);

    if (!data.items || data.items.length === 0) {
      return { ok: false, error: 'Инвентарь пуст или все предметы нетрейдабельные' };
    }

    let result;
    if (useOllama) {
      send('inventory:status', { profileId, status: 'generating' });
      result = await openai.generatePostOllama({
        items:    data.items,
        tradeUrl: data.tradeUrl,
        style:    'emoji',
      });
    } else if (useAI) {
      send('inventory:status', { profileId, status: 'generating' });
      result = await openai.generatePost({
        items:    data.items,
        tradeUrl: data.tradeUrl,
        style:    'emoji',
      });
    } else {
      result = openai.generatePostLocal({
        items:    data.items,
        tradeUrl: data.tradeUrl,
        templateId: templateId || 'emoji',
      });
    }

    return { ok: true, title: result.title, body: result.body, itemCount: data.items.length, tradeUrl: data.tradeUrl };
  } catch (err) {
    logger.error(`[inventory] Ошибка генерации поста: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('inventory:has-openai-key', () => {
  return { hasKey: !!openai.getApiKey() };
});

ipcMain.handle('inventory:templates', () => {
  return openai.getTemplateList();
});

ipcMain.handle('ollama:status', async () => {
  try {
    return await openai.isOllamaAvailable();
  } catch {
    return { available: false, models: [], currentModel: 'llama3' };
  }
});

// Инициализация Telegram-бота по сохранённым настройкам
function initTelegram() {
  const s = db.getAllSettings();
  if (s.tg_active !== '1' || !s.tg_token || !s.tg_chat_id) {
    telegram.stop();
    webapp.stop();
    ngrok.stop();
    return;
  }

  // Общие callbacks для Telegram-бота и Mini App
  const callbacks = {
    // ── Данные ──────────────────────────────────────────────────────
    getStatus() {
      const profiles  = db.getProfiles();
      const campaigns = db.getCampaigns();
      const jobs      = db.getRecentJobs(200);
      const today     = new Date().toISOString().slice(0, 10);
      return {
        botRunning:      bot !== null,
        accountsTotal:   profiles.length,
        accountsActive:  profiles.filter(p => p.is_active).length,
        campaignsTotal:  campaigns.length,
        campaignsActive: campaigns.filter(c => c.is_active).length,
        pendingJobs:     jobs.filter(j => j.status === 'pending').length,
        doneToday:       jobs.filter(j => j.status === 'done' && (j.executed_at||'').startsWith(today)).length,
        failedToday:     jobs.filter(j => j.status === 'failed' && (j.executed_at||'').startsWith(today)).length,
      };
    },
    getAccounts()   { return db.getProfiles().map(p => ({ id: p.id, name: p.name, is_active: p.is_active })); },
    getCampaigns()  { return db.getCampaigns(); },
    getRecentJobs() { return db.getRecentJobs(50); },

    // ── Управление ботом ────────────────────────────────────────────
    startBot() {
      if (!bot) { startBot(); refreshTrayMenu(); send('bot:status-changed', { running: true }); }
    },
    stopBot() {
      if (bot) { bot.stop(); bot = null; refreshTrayMenu(); send('bot:status-changed', { running: false }); }
    },

    // ── Аккаунты ───────────────────────────────────────────────────
    async addAccount(name) {
      try {
        const cookies = await poster.addProfileInteractive(name || 'Account');
        const id = db.addProfile(name || 'Account', cookies);
        send('accounts:login-status', { name, status: 'done', id });
        return { ok: true, id };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
    deleteAccount(id) {
      db.deleteProfile(id);
    },
    toggleAccount(id, active) {
      db.setProfileActive(id, active);
    },

    // ── Кампании ───────────────────────────────────────────────────
    saveCampaign(data) {
      try {
        if (data.id && db.getCampaign(data.id)) {
          db.deleteCampaign(data.id);
        }
        const id = db.addCampaign({
          name:            data.name,
          titleTemplate:   data.title_template,
          bodyTemplate:    data.body_template,
          scheduleMinutes: data.schedule_minutes || 0,
          scheduleTimes:   data.schedule_times   || null,
          windowStart:     data.window_start     || '00:00',
          windowEnd:       data.window_end       || '23:59',
          profileIds:      data.profile_ids,
        });
        return { ok: true, id };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
    deleteCampaign(id) {
      db.deleteCampaign(id);
    },
    toggleCampaign(id) {
      const c = db.getCampaign(id);
      if (c) db.toggleCampaign(id, !c.is_active);
    },
  };

  // Запуск веб-сервера Mini App
  const webPort = parseInt(s.tg_webapp_port) || 3388;
  webapp.start({ port: webPort, tgToken: s.tg_token }, callbacks);
  logger.info(`[Mini App] Веб-сервер запущен на порту ${webPort}`);

  // Запуск ngrok-туннеля и Telegram-бота
  (async () => {
    let webAppUrl = s.tg_webapp_url || null;

    // Автозапуск ngrok, если ещё нет ручного URL
    if (s.tg_ngrok_auto !== '0') {
      const url = await ngrok.start(webPort);
      if (url) {
        webAppUrl = url;
        // Сохраняем URL в настройки, чтобы было видно в UI
        db.setSetting('tg_webapp_url', url);
        send('settings:ngrok-url', url);
        logger.info(`[ngrok] URL сохранён в настройки: ${url}`);
      }
    }

    // Запуск Telegram-бота
    telegram.start(
      {
        token:     s.tg_token,
        chatId:    s.tg_chat_id,
        webAppUrl,
        notify: {
          notifyErrors:   s.tg_notify_errors  !== '0',
          notifySuccess:  s.tg_notify_success === '1',
          notifyExpired:  s.tg_notify_expired !== '0',
          notifyBotState: s.tg_notify_bot     !== '0',
        },
      },
      callbacks
    );
  })();
}
