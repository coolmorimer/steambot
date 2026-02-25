'use strict';

/**
 * server/services/TelegramBotManager.js
 *
 * Управляет пулом Telegram-ботов — по одному на пользователя.
 *
 * Особенности:
 *  - Поддержка 2+ реплик: при 409 Conflict — уступаем, ретрай через 60 с
 *  - suppressNotify — не слать «бот запущен» при авто-восстановлении пода
 *  - Reply Keyboard (нижнее меню) + inline-кнопки
 */

const TelegramBot = require('node-telegram-bot-api');

// userId -> { bot, config, chatIds }
const _bots        = new Map();
// userId -> retryTimer handle (при 409)
const _retryTimers = new Map();

// ── Утилиты ──────────────────────────────────────────────────────────────────

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isAuthorized(chatId, chatIds) {
  return chatIds.includes(String(chatId));
}

async function sendToAll(bot, chatIds, text, opts = {}) {
  for (const cid of chatIds) {
    try { await bot.sendMessage(cid, text, opts); } catch (_) {}
  }
}

// ── Reply Keyboard (нижнее постоянное меню) ───────────────────────────────────

const REPLY_KB = {
  keyboard: [
    ['👤 Аккаунты',  '📋 Кампании'],
    ['📜 Задачи',    '📊 Статус'],
    ['⚙️ Меню'],
  ],
  resize_keyboard: true,
  persistent: true,
};

// ── Запуск бота ──────────────────────────────────────────────────────────────

/**
 * @param {string} userId
 * @param {object} config        — токен, chatIds, notify, коллбеки
 * @param {object} [opts]
 * @param {boolean} [opts.suppressNotify=false] — не слать «запущен» при авторестарте
 */
async function start(userId, config, { suppressNotify = false } = {}) {
  stop(userId);

  if (!config?.token) throw new Error('bot_token обязателен');

  let tgBot;
  try {
    tgBot = new TelegramBot(config.token, { polling: true });
  } catch (err) {
    throw new Error(`Не удалось запустить бот: ${err.message}`);
  }

  // ── 409 Conflict: другой под уже ведёт polling ────────────────────────────
  let _409handled = false;
  tgBot.on('polling_error', (e) => {
    if (e.message?.includes('409 Conflict')) {
      if (_409handled) return; // уже обработали, игнорируем дубли
      _409handled = true;
      console.log(`[TG Bot ${userId}] 409 — другой экземпляр активен. Ретрай через 60 с.`);
      _bots.delete(userId);
      try { tgBot.stopPolling(); } catch (_) {}
      if (!_retryTimers.has(userId)) {
        const timer = setTimeout(() => {
          _retryTimers.delete(userId);
          if (!_bots.has(userId)) {
            console.log(`[TG Bot ${userId}] Попытка перехвата управления...`);
            start(userId, config, { suppressNotify: true }).catch(err =>
              console.error(`[TG Bot ${userId}] retry failed:`, err.message)
            );
          }
        }, 60_000);
        _retryTimers.set(userId, timer);
      }
    } else {
      console.error(`[TG Bot ${userId}] polling error:`, e.message);
    }
  });

  const chatIds = Array.isArray(config.chatIds)
    ? config.chatIds.map(String)
    : [String(config.chatIds || '')].filter(Boolean);

  // ── Сообщения (команды + Reply Keyboard) ─────────────────────────────────
  tgBot.on('message', async (msg) => {
    const cid  = msg.chat.id;
    const text = (msg.text || '').trim();
    if (!isAuthorized(cid, chatIds)) return;
    try {
      if (text.match(/^\/(start|menu)$/i))  return await sendMainMenu(tgBot, cid, config);
      if (text.match(/^\/help$/i))           return await sendHelp(tgBot, cid);
      if (text === '👤 Аккаунты')            return await sendAccountsList(tgBot, cid, config);
      if (text === '📋 Кампании')            return await sendCampaignsList(tgBot, cid, config);
      if (text === '📜 Задачи')              return await sendJobsList(tgBot, cid, config);
      if (text === '📊 Статус')             return await sendStatusMsg(tgBot, cid, config);
      if (text === '⚙️ Меню')               return await sendMainMenu(tgBot, cid, config);
      if (!text.startsWith('/')) {
        await tgBot.sendMessage(cid,
          'Используйте кнопки меню или /menu для управления ботом.',
          { reply_markup: REPLY_KB }
        );
      }
    } catch (e) {
      console.error(`[TG Bot ${userId}] message error:`, e.message);
    }
  });

  // ── Inline callback_query ─────────────────────────────────────────────────
  tgBot.on('callback_query', async (q) => {
    const cid = q.message?.chat?.id || q.from.id;
    if (!isAuthorized(cid, chatIds)) return;
    try {
      await tgBot.answerCallbackQuery(q.id).catch(() => {});
      await handleCallback(tgBot, q.data, cid, config);
    } catch (e) {
      console.error(`[TG Bot ${userId}] callback error:`, e.message);
    }
  });

  _bots.set(userId, { bot: tgBot, config, chatIds });
  console.log(`[TG Bot] Запущен для пользователя ${userId}`);

  // Уведомление «запущен» — только при ручном старте (не авторестарте пода)
  if (!suppressNotify) {
    if (config.notify?.botState) {
      await sendToAll(tgBot, chatIds,
        '▶️ <b>Steam Poster Bot запущен</b>\nИспользуйте /menu для управления.',
        { parse_mode: 'HTML', reply_markup: REPLY_KB }
      );
    } else {
      await sendToAll(tgBot, chatIds, '🎮 Готов к работе. /menu — управление.',
        { reply_markup: REPLY_KB }
      ).catch(() => {});
    }
  }
}

// ── Остановка ────────────────────────────────────────────────────────────────

function stop(userId) {
  if (_retryTimers.has(userId)) {
    clearTimeout(_retryTimers.get(userId));
    _retryTimers.delete(userId);
  }
  const entry = _bots.get(userId);
  if (entry) {
    try { entry.bot.stopPolling(); } catch (_) {}
    _bots.delete(userId);
    console.log(`[TG Bot] Остановлен для пользователя ${userId}`);
  }
}

async function restart(userId, config) {
  await start(userId, config);
}

function isRunning(userId) { return _bots.has(userId); }

// ── Уведомления ──────────────────────────────────────────────────────────────

async function sendNotification(userId, text, options = {}) {
  const entry = _bots.get(userId);
  if (!entry) return;
  await sendToAll(entry.bot, entry.chatIds, text, options);
}

/**
 * Отправить уведомление из ядра бота (при завершении джоба и т.п.)
 * Вызывается из SteamBotManager.
 */
async function notifyJobResult(userId, { success, title, profileName, topicUrl, error } = {}) {
  const entry = _bots.get(userId);
  if (!entry) return;
  const { notify } = entry.config;
  if (success  && !notify?.success) return;
  if (!success && !notify?.errors)  return;

  const text = success
    ? `✅ <b>Пост опубликован!</b>\n📌 ${escHtml(title)}\n👤 ${escHtml(profileName)}` +
      (topicUrl ? `\n🔗 <a href="${topicUrl}">Открыть тему</a>` : '')
    : `❌ <b>Ошибка публикации!</b>\n📌 ${escHtml(title)}\n👤 ${escHtml(profileName)}\n⚠️ ${escHtml(error || 'Неизвестная ошибка')}`;

  await sendToAll(entry.bot, entry.chatIds, text,
    { parse_mode: 'HTML', disable_web_page_preview: true }
  );
}

async function notifyExpiredAccount(userId, profileName) {
  const entry = _bots.get(userId);
  if (!entry || !entry.config.notify?.expired) return;
  await sendToAll(entry.bot, entry.chatIds,
    `⚠️ <b>Аккаунт Steam вышел из системы:</b> ${escHtml(profileName)}\nПереавторизуйтесь в личном кабинете.`,
    { parse_mode: 'HTML' }
  );
}

function stopAll() {
  for (const [userId] of _bots) stop(userId);
}

// ════════════════════════════════════════════════════════════════════════════
//  МЕНЮ
// ════════════════════════════════════════════════════════════════════════════

async function sendMainMenu(bot, chatId, config) {
  const status    = config.getStatus?.() || {};
  const running   = status.running;
  const accounts  = await Promise.resolve(config.getAccounts?.()  || []).catch(() => []);
  const campaigns = await Promise.resolve(config.getCampaigns?.() || []).catch(() => []);
  const jobs      = await Promise.resolve(config.getRecentJobs?.() || []).catch(() => []);

  const activeCampaigns = (campaigns || []).filter(c => c.is_active).length;
  const doneJobs        = (jobs || []).filter(j => j.status === 'done').length;
  const failedJobs      = (jobs || []).filter(j => j.status === 'failed').length;
  const pendingJobs     = (jobs || []).filter(j => j.status === 'pending').length;

  const text = [
    '🎮 <b>Steam Poster Bot</b>',
    '',
    running ? '🟢 <b>Бот работает</b>' : '🔴 <b>Бот остановлен</b>',
    '',
    `👤 Аккаунтов: <b>${(accounts || []).length}</b>   📋 Кампаний: <b>${activeCampaigns}</b>`,
    `✅ Выполнено: <b>${doneJobs}</b>   ❌ Ошибок: <b>${failedJobs}</b>   🕐 Очередь: <b>${pendingJobs}</b>`,
  ].join('\n');

  const keyboard = {
    inline_keyboard: [
      [
        { text: running ? '⏹ Остановить бота' : '▶️ Запустить бота',
          callback_data: running ? 'bot:stop' : 'bot:start' },
        { text: '🔄 Обновить', callback_data: 'menu:refresh' },
      ],
      [
        { text: '👤 Аккаунты',   callback_data: 'accounts:list' },
        { text: '📋 Кампании',   callback_data: 'campaigns:list' },
      ],
      [
        { text: '📜 Задачи',     callback_data: 'jobs:list' },
        { text: '📊 Статистика', callback_data: 'jobs:stats' },
      ],
      ...(config.webAppUrl ? [[
        { text: '🌐 Открыть Dashboard', web_app: { url: config.webAppUrl } },
      ]] : []),
    ],
  };

  await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard });
}

async function sendHelp(bot, chatId) {
  const text = [
    '📖 <b>Справка Steam Poster Bot</b>',
    '',
    '<b>Команды:</b>',
    '/menu — главное меню',
    '/help — эта справка',
    '',
    '<b>Кнопки нижнего меню:</b>',
    '👤 Аккаунты — список Steam аккаунтов',
    '📋 Кампании — список кампаний',
    '📜 Задачи — последние 10 задач',
    '📊 Статус — текущий статус бота',
    '⚙️ Меню — открыть главное меню',
    '',
    '<b>Уведомления</b> настраиваются в Dashboard → Telegram.',
  ].join('\n');
  await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: REPLY_KB });
}

async function sendStatusMsg(bot, chatId, config) {
  const running = config.getStatus?.()?.running;
  const text = running
    ? '🟢 <b>Бот работает</b>'
    : '🔴 <b>Бот остановлен</b>\n\nЗапустите через /menu → ▶️ Запустить бота';
  await bot.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[
      { text: running ? '⏹ Остановить' : '▶️ Запустить',
        callback_data: running ? 'bot:stop' : 'bot:start' },
      { text: '« Меню', callback_data: 'menu:main' },
    ]] },
  });
}

async function sendAccountsList(bot, chatId, config) {
  const accounts = await Promise.resolve(config.getAccounts?.() || []).catch(() => []);
  if (!(accounts || []).length) {
    return bot.sendMessage(chatId, '👤 Аккаунты не добавлены.\nДобавьте через Dashboard.',
      { reply_markup: { inline_keyboard: [[{ text: '« Меню', callback_data: 'menu:main' }]] } }
    );
  }
  const lines = ['👤 <b>Steam аккаунты:</b>', ''];
  for (const [i, a] of (accounts || []).entries()) {
    lines.push(`${i + 1}. ${a.is_active ? '🟢' : '🔴'} <b>${escHtml(a.name)}</b>`);
  }
  await bot.sendMessage(chatId, lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '« Меню', callback_data: 'menu:main' }]] },
  });
}

async function sendCampaignsList(bot, chatId, config) {
  const campaigns = await Promise.resolve(config.getCampaigns?.() || []).catch(() => []);
  if (!(campaigns || []).length) {
    return bot.sendMessage(chatId, '📋 Кампании не созданы.\nСоздайте через Dashboard.',
      { reply_markup: { inline_keyboard: [[{ text: '« Меню', callback_data: 'menu:main' }]] } }
    );
  }
  const lines = ['📋 <b>Кампании:</b>', ''];
  for (const [i, c] of (campaigns || []).entries()) {
    const times = Array.isArray(c.schedule_times) && c.schedule_times.length
      ? c.schedule_times.join(', ') : '—';
    lines.push(`${i + 1}. ${c.is_active ? '🟢' : '🔴'} <b>${escHtml(c.name)}</b>`);
    lines.push(`   🕐 ${times}`);
  }
  await bot.sendMessage(chatId, lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '« Меню', callback_data: 'menu:main' }]] },
  });
}

async function sendJobsList(bot, chatId, config) {
  const jobs   = await Promise.resolve(config.getRecentJobs?.() || []).catch(() => []);
  const recent = (jobs || []).slice(0, 10);
  if (!recent.length) {
    return bot.sendMessage(chatId, '📜 Задач пока нет.',
      { reply_markup: { inline_keyboard: [[{ text: '« Меню', callback_data: 'menu:main' }]] } }
    );
  }
  const icons = { done: '✅', failed: '❌', running: '⏳', pending: '🕐', cancelled: '🚫' };
  const lines = ['📜 <b>Последние задачи:</b>', ''];
  for (const j of recent) {
    const t  = new Date(j.scheduled_at || j.created_at);
    const ts = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
    lines.push(
      `${icons[j.status] || '•'} <b>${escHtml((j.title || '—').slice(0, 40))}</b>`,
      `   <i>${escHtml(j.profile_name || '?')}</i> · ${ts}`,
    );
  }
  await bot.sendMessage(chatId, lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[
      { text: '🔄 Обновить', callback_data: 'jobs:list' },
      { text: '« Меню', callback_data: 'menu:main' },
    ]] },
  });
}

async function handleCallback(bot, data, chatId, config) {
  if (data === 'menu:refresh' || data === 'menu:main') return sendMainMenu(bot, chatId, config);

  if (data === 'bot:start') {
    config.startBot?.();
    return bot.sendMessage(chatId, '▶️ <b>Бот запущен.</b>', { parse_mode: 'HTML' });
  }
  if (data === 'bot:stop') {
    config.stopBot?.();
    return bot.sendMessage(chatId, '⏹ <b>Бот остановлен.</b>', { parse_mode: 'HTML' });
  }

  if (data === 'accounts:list')  return sendAccountsList(bot, chatId, config);
  if (data === 'campaigns:list') return sendCampaignsList(bot, chatId, config);
  if (data === 'jobs:list')      return sendJobsList(bot, chatId, config);

  if (data === 'jobs:stats') {
    const jobs  = await Promise.resolve(config.getRecentJobs?.() || []).catch(() => []);
    const stats = { done: 0, failed: 0, pending: 0, running: 0, cancelled: 0 };
    for (const j of (jobs || [])) stats[j.status] = (stats[j.status] || 0) + 1;
    const text = [
      '📊 <b>Статистика задач (последние 20):</b>', '',
      `✅ Выполнено: <b>${stats.done}</b>`,
      `❌ Ошибки:    <b>${stats.failed}</b>`,
      `🕐 В очереди: <b>${stats.pending}</b>`,
      `⏳ Работают:  <b>${stats.running}</b>`,
      `🚫 Отменено:  <b>${stats.cancelled}</b>`,
    ].join('\n');
    return bot.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '« Меню', callback_data: 'menu:main' }]] },
    });
  }
}

module.exports = {
  start, stop, restart, isRunning,
  sendNotification, notifyJobResult, notifyExpiredAccount,
  stopAll,
};
