'use strict';

/**
 * server/services/TelegramBotManager.js
 *
 * Управляет пулом Telegram-ботов — по одному на пользователя.
 *
 * - 409 Conflict — уступаем, ретрай через 60 с
 * - suppressNotify — не слать «бот запущен» при авто-восстановлении
 * - Reply Keyboard + Inline-кнопки для управления
 * - Кнопка Mini App в сообщениях
 */

const TelegramBot = require('node-telegram-bot-api');
const db = require('../db');

const _bots        = new Map(); // userId -> { bot, config, chatIds }
const _retryTimers = new Map();

// ── Утилиты ──────────────────────────────────────────────────────────────────

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function auth(cid, ids) { return ids.includes(String(cid)); }

async function sendAll(bot, ids, text, opts = {}) {
  for (const c of ids) {
    try { await bot.sendMessage(c, text, opts); } catch (e) {
      console.error(`[TG] send err cid=${c}: ${e.message}`);
    }
  }
}

function ib(text, data) { return { text, callback_data: data }; }
function wa(text, url)  { return { text, web_app: { url } }; }

async function _notifyBot(userId) {
  const e = _bots.get(userId);
  if (e) return e;
  try {
    const r = await db.getTelegramBot(userId);
    if (!r?.bot_token || !r.is_active) return null;
    const ids = typeof r.authorized_chat_ids === 'string'
      ? JSON.parse(r.authorized_chat_ids || '[]') : (r.authorized_chat_ids || []);
    if (!ids.length) return null;
    return {
      bot: new TelegramBot(r.bot_token, { polling: false }),
      chatIds: ids.map(String),
      config: {
        notify: { errors: !!r.notify_errors, success: !!r.notify_success,
                  expired: !!r.notify_expired, botState: !!r.notify_bot_state },
        webAppUrl: r.mini_app_url,
      },
    };
  } catch { return null; }
}

// ── Reply Keyboard ───────────────────────────────────────────────────────────

const RK = {
  keyboard: [
    ['📊 Статус',    '🔄 Обновить'],
    ['👤 Аккаунты',  '📋 Автопостинг'],
    ['📜 Активность',    '📈 Статистика'],
  ],
  resize_keyboard: true,
  persistent: true,
};

// ═════════════════════════════════════════════════════════════════════════════
//  ЗАПУСК / ОСТАНОВКА
// ═════════════════════════════════════════════════════════════════════════════

async function start(userId, config, { suppressNotify = false } = {}) {
  stop(userId);
  if (!config?.token) throw new Error('bot_token обязателен');

  let tg;
  try { tg = new TelegramBot(config.token, { polling: true }); }
  catch (err) { throw new Error(`Не удалось запустить: ${err.message}`); }

  let _409 = false;
  tg.on('polling_error', (e) => {
    if (e.message?.includes('409 Conflict')) {
      if (_409) return; _409 = true;
      _bots.delete(userId);
      try { tg.stopPolling(); } catch (_) {}
      if (!_retryTimers.has(userId)) {
        _retryTimers.set(userId, setTimeout(() => {
          _retryTimers.delete(userId);
          if (!_bots.has(userId))
            start(userId, config, { suppressNotify: true }).catch(() => {});
        }, 60_000));
      }
    } else { console.error(`[TG ${userId}] poll:`, e.message); }
  });

  const ids = Array.isArray(config.chatIds)
    ? config.chatIds.map(String) : [String(config.chatIds || '')].filter(Boolean);

  // ── Messages ──
  tg.on('message', async (msg) => {
    const c = msg.chat.id, t = (msg.text || '').trim();
    if (!auth(c, ids)) return;
    try {
      if (t.match(/^\/(start|menu)$/i))   return await cmdMenu(tg, c, config, userId);
      if (t.match(/^\/help$/i))            return await cmdHelp(tg, c, config);
      if (t === '📊 Статус')              return await cmdMenu(tg, c, config, userId);
      if (t === '🔄 Обновить')             return await cmdMenu(tg, c, config, userId);
      if (t === '👤 Аккаунты')             return await cmdAccounts(tg, c, config, userId);
      if (t === '📋 Автопостинг')            return await cmdCampaigns(tg, c, config, userId);
      if (t === '📜 Активность')               return await cmdJobs(tg, c, config, userId);
      if (t === '📈 Статистика')           return await cmdStats(tg, c, config, userId);
      if (!t.startsWith('/'))
        await tg.sendMessage(c, '👇 Нажмите кнопку внизу или /menu', { reply_markup: RK });
    } catch (e) { console.error(`[TG ${userId}] msg:`, e.message); }
  });

  // ── Inline callbacks ──
  tg.on('callback_query', async (q) => {
    const c = q.message?.chat?.id || q.from.id;
    if (!auth(c, ids)) return;
    try {
      await tg.answerCallbackQuery(q.id).catch(() => {});
      await handleCb(tg, q.data, c, config, userId);
    } catch (e) { console.error(`[TG ${userId}] cb:`, e.message); }
  });

  _bots.set(userId, { bot: tg, config, chatIds: ids });
  console.log(`[TG Bot] Started userId=${userId}`);

  try {
    await tg.setMyCommands([
      { command: 'menu', description: '🏠 Главное меню' },
      { command: 'help', description: '📖 Справка' },
    ]);
  } catch (_) {}

  if (!suppressNotify) {
    const txt = config.notify?.botState
      ? '▶️ <b>Steam Poster Bot запущен!</b>\nНажмите /menu'
      : '🎮 Бот готов. /menu — управление.';
    await sendAll(tg, ids, txt, { parse_mode: 'HTML', reply_markup: RK }).catch(() => {});
  }
}

function stop(userId) {
  const t = _retryTimers.get(userId);
  if (t) { clearTimeout(t); _retryTimers.delete(userId); }
  const e = _bots.get(userId);
  if (e) { try { e.bot.stopPolling(); } catch (_) {} _bots.delete(userId); }
}

async function restart(userId, config) { await start(userId, config); }
function isRunning(userId) { return _bots.has(userId); }

async function isRunningAsync(userId) {
  if (_bots.has(userId)) return true;
  try { const b = await db.getTelegramBot(userId); return !!(b?.is_active); } catch { return false; }
}

function stopAll() { for (const [u] of _bots) stop(u); }

// ═════════════════════════════════════════════════════════════════════════════
//  КОМАНДЫ
// ═════════════════════════════════════════════════════════════════════════════

async function cmdMenu(bot, cid, cfg, userId) {
  const st   = await Promise.resolve(cfg.getStatus?.()).catch(() => ({})) || {};
  const accs = await Promise.resolve(cfg.getAccounts?.()).catch(() => []) || [];
  const cmps = await Promise.resolve(cfg.getCampaigns?.()).catch(() => []) || [];
  const jobs = await Promise.resolve(cfg.getRecentJobs?.()).catch(() => []) || [];

  const on   = st.running === true;
  const act  = cmps.filter(c => c.is_active).length;
  const done = jobs.filter(j => j.status === 'done').length;
  const fail = jobs.filter(j => j.status === 'failed').length;
  const pend = jobs.filter(j => j.status === 'pending').length;

  const txt = [
    '🎮 <b>Steam Poster Bot</b>',
    '',
    on ? '🟢 Бот <b>работает</b>' : '🔴 Бот <b>остановлен</b>',
    '',
    `👤 Аккаунтов: <b>${accs.length}</b>`,
    `📋 Задач: <b>${act}</b> из ${cmps.length} активны`,
    '',
    `✅ ${done}  ❌ ${fail}  🕒 ${pend}`,
  ].join('\n');

  const kb = [
    [ ib(on ? '⏹ Остановить' : '▶️ Запустить', on ? 'bot:stop' : 'bot:start'),
      ib('🔄 Обновить', 'go:menu') ],
    [ ib(`👤 Аккаунты (${accs.length})`, 'go:accounts'),
      ib(`📋 Автопостинг (${cmps.length})`, 'go:campaigns') ],
    [ ib('📜 Активность', 'go:jobs'),
      ib('📈 Статистика', 'go:stats') ],
  ];

  if (cfg.webAppUrl) {
    kb.push([ wa('🖥 Панель управления', cfg.webAppUrl) ]);
  }

  await bot.sendMessage(cid, txt, {
    parse_mode: 'HTML', reply_markup: { inline_keyboard: kb, ...RK },
  });
}

async function cmdHelp(bot, cid, cfg) {
  const txt = [
    '📖 <b>Справка</b>',
    '',
    '🎮 Этот бот управляет автопостингом',
    'на форумах Steam.',
    '',
    '<b>Кнопки внизу экрана:</b>',
    '📊 Статус — главное меню',
    '👤 Аккаунты — Steam аккаунты',
    '📋 Автопостинг — расписание постов',
    '📜 Активность — лента публикаций',
    '📈 Статистика — цифры',
    '',
    '<b>Кнопки в сообщениях:</b>',
    '▶️/⏹ — запуск/стоп бота',
    '⏸/▶️ — вкл/выкл аккаунт или задачу',
    '',
    '💡 Для создания задач и добавления',
    'аккаунтов используйте <b>Панель управления</b>',
  ].join('\n');

  const kb = cfg.webAppUrl ? [[ wa('🖥 Панель управления', cfg.webAppUrl) ]] : [];
  await bot.sendMessage(cid, txt, {
    parse_mode: 'HTML', reply_markup: { inline_keyboard: kb, ...RK },
  });
}

async function cmdAccounts(bot, cid, cfg, userId) {
  const accs = await Promise.resolve(cfg.getAccounts?.()).catch(() => []) || [];

  if (!accs.length) {
    const kb = cfg.webAppUrl ? [[ wa('➕ Добавить', cfg.webAppUrl) ]] : [];
    kb.push([ ib('🏠 Меню', 'go:menu') ]);
    return bot.sendMessage(cid,
      '👤 <b>Аккаунты</b>\n\n📭 Пусто. Добавьте аккаунт через панель.',
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: kb, ...RK } }
    );
  }

  const lines = [`👤 <b>Steam аккаунты</b> (${accs.length})`, ''];
  accs.forEach(a => lines.push(`${a.is_active ? '🟢' : '🔴'} <b>${esc(a.name)}</b>`));

  const kb = accs.map(a => [
    ib(`${a.is_active ? '⏸ Выкл' : '▶️ Вкл'} ${a.name.slice(0, 24)}`, `acc:${a.id}`),
  ]);
  if (cfg.webAppUrl) kb.push([ wa('➕ Добавить аккаунт', cfg.webAppUrl) ]);
  kb.push([ ib('🏠 Меню', 'go:menu') ]);

  await bot.sendMessage(cid, lines.join('\n'), {
    parse_mode: 'HTML', reply_markup: { inline_keyboard: kb, ...RK },
  });
}

async function cmdCampaigns(bot, cid, cfg, userId) {
  const cmps = await Promise.resolve(cfg.getCampaigns?.()).catch(() => []) || [];

  if (!cmps.length) {
    const kb = cfg.webAppUrl ? [[ wa('➕ Создать', cfg.webAppUrl) ]] : [];
    kb.push([ ib('🏠 Меню', 'go:menu') ]);
    return bot.sendMessage(cid,
      '📋 <b>Автопостинг</b>\n\n📭 Пусто. Создайте задачу через панель.',
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: kb, ...RK } }
    );
  }

  const lines = [`📋 <b>Автопостинг</b> (${cmps.length})`, ''];
  cmps.forEach(c => {
    const t = Array.isArray(c.schedule_times) && c.schedule_times.length
      ? c.schedule_times.join(', ') : '—';
    lines.push(`${c.is_active ? '🟢' : '⏸'} <b>${esc(c.name)}</b>  🕐 ${t}`);
  });

  const kb = cmps.map(c => [
    ib(`${c.is_active ? '⏸ Пауза' : '▶️ Запуск'} ${c.name.slice(0, 22)}`, `camp:${c.id}`),
  ]);
  if (cfg.webAppUrl) kb.push([ wa('✏️ Управление', cfg.webAppUrl) ]);
  kb.push([ ib('🏠 Меню', 'go:menu') ]);

  await bot.sendMessage(cid, lines.join('\n'), {
    parse_mode: 'HTML', reply_markup: { inline_keyboard: kb, ...RK },
  });
}

async function cmdJobs(bot, cid, cfg) {
  const jobs = await Promise.resolve(cfg.getRecentJobs?.()).catch(() => []) || [];
  const list = jobs.slice(0, 10);

  if (!list.length) {
    return bot.sendMessage(cid, '📜 <b>Активность</b>\n\n📭 Пока нет.',
      { parse_mode: 'HTML', reply_markup: RK });
  }

  const ic = { done: '✅', failed: '❌', running: '⏳', pending: '🕒', cancelled: '🚫' };
  const lines = ['📜 <b>Лента активности</b>', ''];
  list.forEach(j => {
    const d = new Date(j.scheduled_at || j.created_at);
    const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    lines.push(`${ic[j.status] || '·'} ${ts} <b>${esc((j.title || '—').slice(0, 32))}</b>`);
    lines.push(`   👤 ${esc(j.profile_name || '?')}`);
    if (j.status === 'failed' && (j.error_message || j.error))
      lines.push(`   ⚠️ <i>${esc((j.error_message || j.error).slice(0, 50))}</i>`);
  });

  await bot.sendMessage(cid, lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[ ib('🔄', 'go:jobs'), ib('🏠 Меню', 'go:menu') ]], ...RK },
  });
}

async function cmdStats(bot, cid, cfg) {
  const jobs = await Promise.resolve(cfg.getRecentJobs?.()).catch(() => []) || [];
  const s = { done: 0, failed: 0, pending: 0, running: 0, cancelled: 0 };
  for (const j of jobs) s[j.status] = (s[j.status] || 0) + 1;
  const tot = Object.values(s).reduce((a, b) => a + b, 0) || 1;

  const txt = [
    `📈 <b>Статистика</b>`,
    '',
    `✅ Выполнено: <b>${s.done}</b>  (${(s.done / tot * 100).toFixed(0)}%)`,
    `❌ Ошибок: <b>${s.failed}</b>`,
    `� Ожидают: <b>${s.pending}</b>`,
    `⏳ В процессе: <b>${s.running}</b>`,
    `🚫 Отменено: <b>${s.cancelled}</b>`,
  ].join('\n');

  await bot.sendMessage(cid, txt, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[ ib('🔄', 'go:stats'), ib('🏠 Меню', 'go:menu') ]], ...RK },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  INLINE CALLBACKS
// ═════════════════════════════════════════════════════════════════════════════

async function handleCb(bot, data, cid, cfg, userId) {
  // Бот старт/стоп
  if (data === 'bot:start') {
    try {
      const SM = require('./SteamBotManager');
      SM.start(userId);
      await bot.sendMessage(cid, '▶️ <b>Бот запущен!</b> Публикации по расписанию.', { parse_mode: 'HTML' });
    } catch (e) { await bot.sendMessage(cid, `❌ ${esc(e.message)}`, { parse_mode: 'HTML' }); }
    return;
  }
  if (data === 'bot:stop') {
    try {
      const SM = require('./SteamBotManager');
      SM.stop(userId);
      await bot.sendMessage(cid, '⏹ <b>Бот остановлен.</b>', { parse_mode: 'HTML' });
    } catch (e) { await bot.sendMessage(cid, `❌ ${esc(e.message)}`, { parse_mode: 'HTML' }); }
    return;
  }

  // Аккаунт вкл/выкл
  if (data.startsWith('acc:')) {
    const id = data.slice(4);
    try {
      const all = await db.getProfiles(userId);
      const a = all.find(x => x.id === id);
      if (!a) return bot.sendMessage(cid, '❌ Не найден');
      const on = !a.is_active;
      await db.updateProfile(id, userId, { is_active: on });
      await bot.sendMessage(cid,
        `${on ? '🟢' : '🔴'} <b>${esc(a.name)}</b> ${on ? 'включён' : 'отключён'}`,
        { parse_mode: 'HTML' });
    } catch (e) { await bot.sendMessage(cid, `❌ ${esc(e.message)}`, { parse_mode: 'HTML' }); }
    return;
  }

  // Кампания вкл/выкл
  if (data.startsWith('camp:')) {
    const id = data.slice(5);
    try {
      const all = await db.getCampaigns(userId);
      const c = all.find(x => x.id === id);
      if (!c) return bot.sendMessage(cid, '❌ Не найдена');
      const on = !c.is_active;
      await db.updateCampaign(id, userId, { is_active: on });
      await bot.sendMessage(cid,
        `${on ? '▶️' : '⏸'} <b>${esc(c.name)}</b> ${on ? 'запущена' : 'на паузе'}`,
        { parse_mode: 'HTML' });
    } catch (e) { await bot.sendMessage(cid, `❌ ${esc(e.message)}`, { parse_mode: 'HTML' }); }
    return;
  }

  // Навигация
  if (data === 'go:menu')      return cmdMenu(bot, cid, cfg, userId);
  if (data === 'go:accounts')  return cmdAccounts(bot, cid, cfg, userId);
  if (data === 'go:campaigns') return cmdCampaigns(bot, cid, cfg, userId);
  if (data === 'go:jobs')      return cmdJobs(bot, cid, cfg);
  if (data === 'go:stats')     return cmdStats(bot, cid, cfg);
}

// ═════════════════════════════════════════════════════════════════════════════
//  УВЕДОМЛЕНИЯ
// ═════════════════════════════════════════════════════════════════════════════

async function sendNotification(userId, text, options = {}) {
  const e = await _notifyBot(userId);
  if (!e) return;
  await sendAll(e.bot, e.chatIds, text, options);
}

async function notifyJobResult(userId, { success, title, profileName, topicUrl, error } = {}) {
  const e = await _notifyBot(userId);
  if (!e) return;
  const n = e.config.notify;
  if (success && !n?.success) return;
  if (!success && !n?.errors) return;

  const kb = [];
  if (success && topicUrl)
    kb.push([{ text: '🔗 Открыть тему', url: topicUrl }]);
  if (e.config.webAppUrl)
    kb.push([ wa('� Активность', e.config.webAppUrl) ]);

  const txt = success
    ? `✅ <b>Пост опубликован!</b>\n📌 ${esc(title)}\n👤 ${esc(profileName)}` +
      (topicUrl ? `\n🔗 <a href="${topicUrl}">Открыть тему</a>` : '')
    : `❌ <b>Ошибка!</b>\n📌 ${esc(title)}\n👤 ${esc(profileName)}\n⚠️ ${esc(error || '?')}`;

  await sendAll(e.bot, e.chatIds, txt, {
    parse_mode: 'HTML', disable_web_page_preview: true,
    reply_markup: kb.length ? { inline_keyboard: kb } : undefined,
  });
}

async function notifyExpiredAccount(userId, profileName) {
  const e = await _notifyBot(userId);
  if (!e || !e.config.notify?.expired) return;
  const kb = e.config.webAppUrl ? [[ wa('🔄 Переавторизовать', e.config.webAppUrl) ]] : [];
  await sendAll(e.bot, e.chatIds,
    `⚠️ <b>Аккаунт Steam вылетел!</b>\n👤 ${esc(profileName)}\n\n🔑 Нужно заново войти.`,
    { parse_mode: 'HTML', reply_markup: kb.length ? { inline_keyboard: kb } : undefined }
  );
}

module.exports = {
  start, stop, restart, isRunning, isRunningAsync,
  sendNotification, notifyJobResult, notifyExpiredAccount,
  stopAll,
};
