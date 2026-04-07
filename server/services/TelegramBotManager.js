'use strict';

/**
 * server/services/TelegramBotManager.js
 *
 * Shared Telegram bot — один бот на всю платформу.
 * Токен хранится в server_settings (TG_BOT_TOKEN).
 * Пользователи привязывают аккаунт через deep-link /start CODE.
 *
 * Notification flow:
 *   userId → users.telegram_chat_id → бот шлёт в этот чат.
 *
 * Commands: /start, /menu, /help + Reply Keyboard.
 */

const TelegramBot = require('node-telegram-bot-api');
const db = require('../db');

let _bot      = null;   // TelegramBot instance
let _botToken = null;
let _webAppUrl = null;
let _retryTimer = null;
let _retryCount = 0;
const MAX_RETRIES = 5;

// ── Утилиты ──────────────────────────────────────────────────────────────────

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ib(text, data) { return { text, callback_data: data }; }
function wa(text, url)  { return { text, web_app: { url } }; }

async function send(chatId, text, opts = {}) {
  if (!_bot) return;
  try { await _bot.sendMessage(chatId, text, opts); } catch (e) {
    console.error(`[TG] send err cid=${chatId}: ${e.message}`);
  }
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
//  RESOLVE USER BY CHAT ID
// ═════════════════════════════════════════════════════════════════════════════

async function resolveUser(chatId) {
  return db.getUserByTelegramChatId(String(chatId));
}

function getUserCallbacks(userId) {
  const SteamBotManager = require('./SteamBotManager');
  return {
    getStatus:     () => SteamBotManager.getStatus(userId),
    getAccounts:   () => db.getProfiles(userId),
    getCampaigns:  () => db.getCampaigns(userId),
    getRecentJobs: () => db.getRecentJobs(userId, 20),
    startBot:      () => SteamBotManager.start(userId),
    stopBot:       () => SteamBotManager.stop(userId),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  START / STOP
// ═════════════════════════════════════════════════════════════════════════════

async function start(opts = {}) {
  stop();

  const token = opts.token || await db.getServerSetting('TG_BOT_TOKEN');
  _webAppUrl  = opts.webAppUrl || await db.getServerSetting('TG_MINI_APP_URL') || null;

  if (!token) throw new Error('TG_BOT_TOKEN не настроен');
  _botToken = token;

  let tg;
  try { tg = new TelegramBot(token, { polling: true }); }
  catch (err) { throw new Error(`Не удалось запустить TG-бот: ${err.message}`); }

  let _409 = false;
  tg.on('polling_error', (e) => {
    if (e.message?.includes('409 Conflict')) {
      if (_409) return; _409 = true;
      _bot = null;
      try { tg.stopPolling(); } catch (_) {}
      if (_retryCount >= MAX_RETRIES) {
        console.error(`[TG Shared] Max retries (${MAX_RETRIES}) exceeded, giving up`);
        return;
      }
      if (!_retryTimer) {
        const delay = 60_000 * Math.pow(2, _retryCount);
        _retryCount++;
        console.warn(`[TG Shared] 409 Conflict, retry #${_retryCount} in ${delay / 1000}s`);
        _retryTimer = setTimeout(() => {
          _retryTimer = null;
          if (!_bot) start(opts).catch(err =>
            console.error('[TG Shared] Retry failed:', err.message)
          );
        }, delay);
      }
    } else { console.error(`[TG Shared] poll:`, e.message); }
  });

  // ── Messages ──
  tg.on('message', async (msg) => {
    const c = msg.chat.id;
    const t = (msg.text || '').trim();
    try {
      // /start with link code
      if (t.match(/^\/start\s+(.+)$/i)) {
        const code = t.match(/^\/start\s+(.+)$/i)[1];
        return await handleLink(tg, c, code, msg.from);
      }

      // Resolve user from chat_id
      const user = await resolveUser(c);
      if (!user) {
        return await tg.sendMessage(c,
          '⚠️ Ваш Telegram не привязан к аккаунту.\n\n' +
          '📌 Войдите в личный кабинет, ' +
          'откройте раздел «Уведомления» и нажмите «Привязать Telegram».',
          { parse_mode: 'HTML', disable_web_page_preview: true });
      }

      const cb = getUserCallbacks(user.id);

      if (t.match(/^\/(start|menu)$/i) || t === '📊 Статус' || t === '🔄 Обновить')
        return await cmdMenu(tg, c, cb, user);
      if (t.match(/^\/help$/i))
        return await cmdHelp(tg, c);
      if (t === '👤 Аккаунты')
        return await cmdAccounts(tg, c, cb, user);
      if (t === '📋 Автопостинг')
        return await cmdCampaigns(tg, c, cb, user);
      if (t === '📜 Активность')
        return await cmdJobs(tg, c, cb);
      if (t === '📈 Статистика')
        return await cmdStats(tg, c, cb);

      if (!t.startsWith('/'))
        await tg.sendMessage(c, '👇 Нажмите кнопку внизу или /menu', { reply_markup: RK });
    } catch (e) { console.error(`[TG Shared] msg:`, e.message); }
  });

  // ── Inline callbacks ──
  tg.on('callback_query', async (q) => {
    const c = q.message?.chat?.id || q.from.id;
    try {
      await tg.answerCallbackQuery(q.id).catch(() => {});
      const user = await resolveUser(c);
      if (!user) return;
      const cb = getUserCallbacks(user.id);
      await handleCb(tg, q.data, c, cb, user);
    } catch (e) { console.error(`[TG Shared] cb:`, e.message); }
  });

  _bot = tg;
  _retryCount = 0; // reset retry counter on success
  console.log(`[TG Shared] Bot started`);

  try {
    const me = await tg.getMe();
    await db.setServerSetting('TG_BOT_USERNAME', me.username || '');
    console.log(`[TG Shared] Bot username: @${me.username}`);
  } catch (_) {}

  try {
    await tg.setMyCommands([
      { command: 'menu', description: '🏠 Главное меню' },
      { command: 'help', description: '📖 Справка' },
    ]);
  } catch (_) {}
}

function stop() {
  if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
  if (_bot) { try { _bot.stopPolling(); } catch (_) {} _bot = null; }
}

function isRunning() { return !!_bot; }
function getToken()  { return _botToken; }

// ═════════════════════════════════════════════════════════════════════════════
//  DEEP LINK: /start CODE
// ═════════════════════════════════════════════════════════════════════════════

async function handleLink(bot, chatId, code, tgFrom) {
  try {
    const userId = await db.consumeTelegramLinkCode(code);
    if (!userId) {
      return await bot.sendMessage(chatId,
        '❌ Код привязки недействителен или истёк.\n\n' +
        '📌 Перейдите в личный кабинет → Уведомления → «Привязать Telegram» для получения нового кода.',
        { parse_mode: 'HTML' });
    }

    // Check if this chatId is already linked to another user
    const existing = await db.getUserByTelegramChatId(String(chatId));
    if (existing && existing.id !== userId) {
      await db.updateUser(existing.id, { telegram_chat_id: null });
    }

    await db.updateUser(userId, { telegram_chat_id: String(chatId) });

    const user = await db.getUserById(userId);
    const name = user?.name || user?.email || 'пользователь';

    const kb = _webAppUrl ? [[ wa('🖥 Панель управления', _webAppUrl) ]] : [];
    await bot.sendMessage(chatId,
      `✅ <b>Telegram привязан!</b>\n\n👤 Аккаунт: <b>${esc(name)}</b>\n\n` +
      'Теперь вы будете получать уведомления о публикациях. Нажмите /menu для управления.',
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: kb, ...RK } });
  } catch (e) {
    console.error('[TG Shared] link error:', e.message);
    await bot.sendMessage(chatId, '❌ Ошибка привязки. Попробуйте ещё раз.');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  COMMANDS
// ═════════════════════════════════════════════════════════════════════════════

async function cmdMenu(bot, cid, cb, user) {
  const st   = await Promise.resolve(cb.getStatus?.()).catch(() => ({})) || {};
  const accs = await Promise.resolve(cb.getAccounts?.()).catch(() => []) || [];
  const cmps = await Promise.resolve(cb.getCampaigns?.()).catch(() => []) || [];
  const jobs = await Promise.resolve(cb.getRecentJobs?.()).catch(() => []) || [];

  const on   = st.running === true;
  const act  = cmps.filter(c => c.is_active).length;
  const done = jobs.filter(j => j.status === 'done').length;
  const fail = jobs.filter(j => j.status === 'failed').length;
  const pend = jobs.filter(j => j.status === 'pending').length;

  const txt = [
    '🎮 <b>Steam Poster Bot</b>',
    `👤 ${esc(user.name || user.email)}`,
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

  if (_webAppUrl) {
    kb.push([ wa('🖥 Панель управления', _webAppUrl) ]);
  }

  await bot.sendMessage(cid, txt, {
    parse_mode: 'HTML', reply_markup: { inline_keyboard: kb, ...RK },
  });
}

async function cmdHelp(bot, cid) {
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

  const kb = _webAppUrl ? [[ wa('🖥 Панель управления', _webAppUrl) ]] : [];
  await bot.sendMessage(cid, txt, {
    parse_mode: 'HTML', reply_markup: { inline_keyboard: kb, ...RK },
  });
}

async function cmdAccounts(bot, cid, cb, user) {
  const accs = await Promise.resolve(cb.getAccounts?.()).catch(() => []) || [];

  if (!accs.length) {
    const kb = _webAppUrl ? [[ wa('➕ Добавить', _webAppUrl) ]] : [];
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
  if (_webAppUrl) kb.push([ wa('➕ Добавить аккаунт', _webAppUrl) ]);
  kb.push([ ib('🏠 Меню', 'go:menu') ]);

  await bot.sendMessage(cid, lines.join('\n'), {
    parse_mode: 'HTML', reply_markup: { inline_keyboard: kb, ...RK },
  });
}

async function cmdCampaigns(bot, cid, cb, user) {
  const cmps = await Promise.resolve(cb.getCampaigns?.()).catch(() => []) || [];

  if (!cmps.length) {
    const kb = _webAppUrl ? [[ wa('➕ Создать', _webAppUrl) ]] : [];
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
  if (_webAppUrl) kb.push([ wa('✏️ Управление', _webAppUrl) ]);
  kb.push([ ib('🏠 Меню', 'go:menu') ]);

  await bot.sendMessage(cid, lines.join('\n'), {
    parse_mode: 'HTML', reply_markup: { inline_keyboard: kb, ...RK },
  });
}

async function cmdJobs(bot, cid, cb) {
  const jobs = await Promise.resolve(cb.getRecentJobs?.()).catch(() => []) || [];
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

async function cmdStats(bot, cid, cb) {
  const jobs = await Promise.resolve(cb.getRecentJobs?.()).catch(() => []) || [];
  const s = { done: 0, failed: 0, pending: 0, running: 0, cancelled: 0 };
  for (const j of jobs) s[j.status] = (s[j.status] || 0) + 1;
  const tot = Object.values(s).reduce((a, b) => a + b, 0) || 1;

  const txt = [
    `📈 <b>Статистика</b>`,
    '',
    `✅ Выполнено: <b>${s.done}</b>  (${(s.done / tot * 100).toFixed(0)}%)`,
    `❌ Ошибок: <b>${s.failed}</b>`,
    `🕒 Ожидают: <b>${s.pending}</b>`,
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

async function handleCb(bot, data, cid, cb, user) {
  if (data === 'bot:start') {
    try {
      cb.startBot();
      await bot.sendMessage(cid, '▶️ <b>Бот запущен!</b> Публикации по расписанию.', { parse_mode: 'HTML' });
    } catch (e) { await bot.sendMessage(cid, `❌ ${esc(e.message)}`, { parse_mode: 'HTML' }); }
    return;
  }
  if (data === 'bot:stop') {
    try {
      cb.stopBot();
      await bot.sendMessage(cid, '⏹ <b>Бот остановлен.</b>', { parse_mode: 'HTML' });
    } catch (e) { await bot.sendMessage(cid, `❌ ${esc(e.message)}`, { parse_mode: 'HTML' }); }
    return;
  }

  if (data.startsWith('acc:')) {
    const id = data.slice(4);
    try {
      const all = await db.getProfiles(user.id);
      const a = all.find(x => x.id === id);
      if (!a) return bot.sendMessage(cid, '❌ Не найден');
      const on = !a.is_active;
      await db.updateProfile(id, user.id, { is_active: on });
      await bot.sendMessage(cid,
        `${on ? '🟢' : '🔴'} <b>${esc(a.name)}</b> ${on ? 'включён' : 'отключён'}`,
        { parse_mode: 'HTML' });
    } catch (e) { await bot.sendMessage(cid, `❌ ${esc(e.message)}`, { parse_mode: 'HTML' }); }
    return;
  }

  if (data.startsWith('camp:')) {
    const id = data.slice(5);
    try {
      const all = await db.getCampaigns(user.id);
      const c = all.find(x => x.id === id);
      if (!c) return bot.sendMessage(cid, '❌ Не найдена');
      const on = !c.is_active;
      await db.updateCampaign(id, user.id, { is_active: on });
      await bot.sendMessage(cid,
        `${on ? '▶️' : '⏸'} <b>${esc(c.name)}</b> ${on ? 'запущена' : 'на паузе'}`,
        { parse_mode: 'HTML' });
    } catch (e) { await bot.sendMessage(cid, `❌ ${esc(e.message)}`, { parse_mode: 'HTML' }); }
    return;
  }

  if (data === 'go:menu')      return cmdMenu(bot, cid, cb, user);
  if (data === 'go:accounts')  return cmdAccounts(bot, cid, cb, user);
  if (data === 'go:campaigns') return cmdCampaigns(bot, cid, cb, user);
  if (data === 'go:jobs')      return cmdJobs(bot, cid, cb);
  if (data === 'go:stats')     return cmdStats(bot, cid, cb);
}

// ═════════════════════════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ═════════════════════════════════════════════════════════════════════════════

async function sendNotification(userId, text, options = {}) {
  if (!_bot) return;
  const user = await db.getUserById(userId);
  if (!user?.telegram_chat_id) return;
  await send(user.telegram_chat_id, text, options);
}

async function notifyJobResult(userId, { success, title, profileName, topicUrl, error } = {}) {
  if (!_bot) return;
  const user = await db.getUserById(userId);
  if (!user?.telegram_chat_id) return;
  if (success && !user.tg_notify_success) return;
  if (!success && !user.tg_notify_errors) return;

  const kb = [];
  if (success && topicUrl)
    kb.push([{ text: '🔗 Открыть тему', url: topicUrl }]);
  if (_webAppUrl)
    kb.push([ wa('📜 Активность', _webAppUrl) ]);

  const txt = success
    ? `✅ <b>Пост опубликован!</b>\n📌 ${esc(title)}\n👤 ${esc(profileName)}` +
      (topicUrl ? `\n🔗 <a href="${topicUrl}">Открыть тему</a>` : '')
    : `❌ <b>Ошибка!</b>\n📌 ${esc(title)}\n👤 ${esc(profileName)}\n⚠️ ${esc(error || '?')}`;

  await send(user.telegram_chat_id, txt, {
    parse_mode: 'HTML', disable_web_page_preview: true,
    reply_markup: kb.length ? { inline_keyboard: kb } : undefined,
  });
}

async function notifyExpiredAccount(userId, profileName) {
  if (!_bot) return;
  const user = await db.getUserById(userId);
  if (!user?.telegram_chat_id || !user.tg_notify_expired) return;
  const kb = _webAppUrl ? [[ wa('🔄 Переавторизовать', _webAppUrl) ]] : [];
  await send(user.telegram_chat_id,
    `⚠️ <b>Аккаунт Steam вылетел!</b>\n👤 ${esc(profileName)}\n\n🔑 Нужно заново войти.`,
    { parse_mode: 'HTML', reply_markup: kb.length ? { inline_keyboard: kb } : undefined }
  );
}

// backward-compat aliases
function stopAll() { stop(); }

module.exports = {
  start, stop, isRunning, getToken, stopAll,
  sendNotification, notifyJobResult, notifyExpiredAccount,
};