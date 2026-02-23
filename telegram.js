'use strict';

/**
 * telegram.js — Telegram-бот с полным управлением Steam Poster Bot
 * через inline-клавиатуру (плиточки).
 *
 * Главное меню (/start, /menu):
 *   ▶/⏹ Бот  │  🔄 Обновить
 *   👤 Аккаунты │ 📋 Кампании
 *   📜 Лог     │ ❌ Ошибки
 *
 * Аккаунты: список, ➕ добавить, вкл/выкл, удалить
 * Кампании: список, детали, ➕ создать (визард 5 шагов), ✏️ изменить, вкл/выкл, удалить
 * Лог / Ошибки: с кнопкой обновить
 *
 * Уведомления (настраиваются в Settings):
 *   ✅ успех  ❌ ошибка  ⚠️ аккаунт вылетел  ▶/⏹ бот старт/стоп
 */

const TelegramBot = require('node-telegram-bot-api');
const logger      = require('./logger');

let tgBot    = null;
let chatIds  = [];    // массив авторизованных chat ID
let webAppUrl = null;
let options = {
  notifyErrors: true, notifySuccess: false,
  notifyExpired: true, notifyBotState: true,
};

// ── Callbacks из main.js ─────────────────────────────────────────────────
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

// ── Wizard state (per chat) ──────────────────────────────────────────────
const wizards = new Map();

// ═══════════════════════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

function start(config, callbacks = {}) {
  stop();
  if (!config.token || !config.chatId) {
    logger.warn('Telegram: не указан token или chatId — бот не запущен.');
    return;
  }
  // Поддержка нескольких chat ID (через запятую, пробел, перенос строки)
  chatIds   = String(config.chatId)
    .split(/[\s,;]+/)
    .map(s => s.trim())
    .filter(Boolean);
  webAppUrl = config.webAppUrl || null;
  options   = { ...options, ...config.notify };
  cb        = { ...cb, ...callbacks };

  try {
    tgBot = new TelegramBot(config.token, { polling: true });
    logger.info('Telegram-бот: polling запущен');
  } catch (err) {
    logger.error(`Telegram: не удалось запустить — ${err.message}`);
    tgBot = null;
    return;
  }

  tgBot.on('polling_error', (e) => logger.warn(`TG poll: ${e.message}`));

  // /start и /menu — главное меню
  tgBot.onText(/\/(start|menu)/, (msg) => {
    if (!isAuth(msg)) return;
    wizards.delete(msg.chat.id);
    sendMainMenu(msg.chat.id);
  });

  // Inline-кнопки
  tgBot.on('callback_query', (q) => {
    if (!isAuth(q)) return;
    routeCallback(q).catch(e => logger.warn(`TG cb err: ${e.message}`));
  });

  // Текстовые сообщения (для визардов)
  tgBot.on('message', (msg) => {
    if (!isAuth(msg)) return;
    if (msg.text && msg.text.startsWith('/')) return;
    onText(msg);
  });
}

function stop() {
  if (tgBot) {
    try { tgBot.stopPolling(); } catch (_) {}
    tgBot = null;
    logger.info('Telegram-бот: остановлен');
  }
  wizards.clear();
}

function isRunning() { return tgBot !== null; }

// ═══════════════════════════════════════════════════════════════════════════
//  ГЛАВНОЕ МЕНЮ
// ═══════════════════════════════════════════════════════════════════════════

function sendMainMenu(cid, mid) {
  const s = cb.getStatus();
  const text = [
    '🎮 *Steam Poster Bot*',
    '',
    `🤖 Бот: ${s.botRunning ? '🟢 работает' : '🔴 остановлен'}`,
    `👤 Аккаунтов: *${s.accountsActive}* / ${s.accountsTotal}`,
    `📋 Кампаний: *${s.campaignsActive}* / ${s.campaignsTotal}`,
    '',
    `📥 Очередь: ${s.pendingJobs}  ·  ✅ ${s.doneToday} сегодня  ·  ❌ ${s.failedToday}`,
  ].join('\n');

  const kb = [
    [
      ibtn(s.botRunning ? '⏹ Остановить' : '▶️ Запустить', s.botRunning ? 'bot_off' : 'bot_on'),
      ibtn('🔄 Обновить', 'menu'),
    ],
    [
      ibtn('👤 Аккаунты', 'accs'),
      ibtn('📋 Кампании', 'camps'),
    ],
    [
      ibtn('📜 Лог', 'logs'),
      ibtn('❌ Ошибки', 'errors'),
    ],
  ];

  // Кнопка Mini App (если URL настроен)
  if (webAppUrl) {
    kb.push([ { text: '🖥 Открыть Mini App', web_app: { url: webAppUrl } } ]);
  }

  return editMsg(cid, mid, text, kb);
}

// ═══════════════════════════════════════════════════════════════════════════
//  CALLBACK ROUTER
// ═══════════════════════════════════════════════════════════════════════════

async function routeCallback(q) {
  const cid  = q.message.chat.id;
  const mid  = q.message.message_id;
  const d    = q.data;

  tgBot.answerCallbackQuery(q.id).catch(() => {});

  // Выход из визарда при любой НЕ-визард кнопке
  if (!d.startsWith('wiz_')) wizards.delete(cid);

  // ── Меню / Бот ─────────────────────────────────────
  if (d === 'menu')     return sendMainMenu(cid, mid);
  if (d === 'noop')     return;
  if (d === 'bot_on')   { cb.startBot();  return sendMainMenu(cid, mid); }
  if (d === 'bot_off')  { cb.stopBot();   return sendMainMenu(cid, mid); }

  // ── Аккаунты ───────────────────────────────────────
  if (d === 'accs')                    return pageAccounts(cid, mid);
  if (d === 'acc_add')                 return wizAccountStart(cid, mid);
  if (d.startsWith('acc_toggle:'))     return accToggle(cid, mid, d.slice(11));
  if (d.startsWith('acc_del:'))        return accDelAsk(cid, mid, d.slice(8));
  if (d.startsWith('acc_del_y:'))      return accDel(cid, mid, d.slice(10));

  // ── Кампании ───────────────────────────────────────
  if (d === 'camps')                   return pageCampaigns(cid, mid);
  if (d === 'camp_new')                return wizCampStart(cid, mid);
  if (d.startsWith('camp_v:'))         return pageCampDetail(cid, mid, d.slice(7));
  if (d.startsWith('camp_toggle:'))    return campToggle(cid, mid, d.slice(12));
  if (d.startsWith('camp_del:'))       return campDelAsk(cid, mid, d.slice(9));
  if (d.startsWith('camp_del_y:'))     return campDel(cid, mid, d.slice(11));
  if (d.startsWith('camp_edit:'))      return wizCampEdit(cid, mid, d.slice(10));

  // ── Визард кампании ────────────────────────────────
  if (d.startsWith('wiz_'))            return wizCallback(cid, mid, d);

  // ── Лог / Ошибки ──────────────────────────────────
  if (d === 'logs')                    return pageLogs(cid, mid);
  if (d === 'errors')                  return pageErrors(cid, mid);
}

// ═══════════════════════════════════════════════════════════════════════════
//  АККАУНТЫ
// ═══════════════════════════════════════════════════════════════════════════

function pageAccounts(cid, mid) {
  const accs = cb.getAccounts();

  const rows = accs.map(a => [
    ibtn(`${a.is_active ? '🟢' : '🔴'} ${a.name}`, 'noop'),
    ibtn(a.is_active ? '⏸' : '▶️', `acc_toggle:${a.id}`),
    ibtn('🗑', `acc_del:${a.id}`),
  ]);
  rows.push([ ibtn('➕ Добавить аккаунт', 'acc_add') ]);
  rows.push([ ibtn('« Меню', 'menu') ]);

  const lines = accs.length
    ? accs.map(a => `${a.is_active ? '🟢' : '🔴'} *${esc(a.name)}*`).join('\n')
    : '_Нет аккаунтов_';

  return editMsg(cid, mid, `👤 *Аккаунты (${accs.length})*\n\n${lines}`, rows);
}

function accToggle(cid, mid, id) {
  const acc = cb.getAccounts().find(a => a.id === id);
  if (acc) cb.toggleAccount(id, acc.is_active ? 0 : 1);
  return pageAccounts(cid, mid);
}

function accDelAsk(cid, mid, id) {
  const acc = cb.getAccounts().find(a => a.id === id);
  return editMsg(cid, mid,
    `⚠️ *Удалить аккаунт «${esc(acc?.name || '?')}»?*\n\nЭто действие нельзя отменить.`,
    [[ ibtn('✅ Да, удалить', `acc_del_y:${id}`), ibtn('❌ Отмена', 'accs') ]]
  );
}

function accDel(cid, mid, id) {
  cb.deleteAccount(id);
  return pageAccounts(cid, mid);
}

// ── Визард: добавить аккаунт ─────────────────────────────────────────────

function wizAccountStart(cid, mid) {
  wizards.set(cid, { type: 'acc', step: 'name' });
  return editMsg(cid, mid,
    '👤 *Добавление аккаунта*\n\nВведите имя для нового аккаунта:',
    [[ ibtn('❌ Отмена', 'accs') ]]
  );
}

async function wizAccountText(cid, text) {
  wizards.delete(cid);
  await tgBot.sendMessage(cid,
    `⏳ Запускаю вход для *${esc(text)}*...\n\n_Откройте окно на ПК и войдите в Steam._`,
    { parse_mode: 'Markdown' }
  );
  try {
    const r = await cb.addAccount(text);
    const msg = r.ok
      ? `✅ Аккаунт *${esc(text)}* успешно добавлен!`
      : `❌ Ошибка: ${esc(r.error || 'unknown')}`;
    tgBot.sendMessage(cid, msg, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[ ibtn('👤 Аккаунты', 'accs'), ibtn('🏠 Меню', 'menu') ]] },
    });
  } catch (err) {
    tgBot.sendMessage(cid, `❌ ${esc(err.message)}`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[ ibtn('👤 Аккаунты', 'accs') ]] },
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  КАМПАНИИ — СПИСОК / ДЕТАЛИ
// ═══════════════════════════════════════════════════════════════════════════

function pageCampaigns(cid, mid) {
  const camps = cb.getCampaigns();

  const rows = camps.map(c => [
    ibtn(`${c.is_active ? '🟢' : '⏸'} ${clip(c.name, 28)}`, `camp_v:${c.id}`),
  ]);
  rows.push([ ibtn('➕ Новая кампания', 'camp_new') ]);
  rows.push([ ibtn('« Меню', 'menu') ]);

  const lines = camps.length
    ? camps.map(c => `${c.is_active ? '🟢' : '⏸'} *${esc(c.name)}*`).join('\n')
    : '_Нет кампаний_';

  return editMsg(cid, mid, `📋 *Кампании (${camps.length})*\n\n${lines}`, rows);
}

function pageCampDetail(cid, mid, id) {
  const c = cb.getCampaigns().find(x => x.id === id);
  if (!c) return pageCampaigns(cid, mid);

  const times = Array.isArray(c.schedule_times) && c.schedule_times.length
    ? c.schedule_times.join(', ')
    : `каждые ${c.schedule_minutes || 60} мин`;

  const profNames = cb.getAccounts()
    .filter(a => (c.profile_ids || []).includes(a.id))
    .map(a => a.name).join(', ') || '—';

  const text = [
    `📋 *${esc(c.name)}*`,
    '',
    c.is_active ? '🟢 Активна' : '⏸ Приостановлена',
    '',
    `📝 *Заголовок:*\n${esc(c.title_template)}`,
    '',
    `📄 *Текст:*\n${esc(clip(c.body_template, 250))}`,
    '',
    `👤 *Аккаунты:* ${esc(profNames)}`,
    `🕐 *Расписание:* ${times}`,
  ].join('\n');

  return editMsg(cid, mid, text, [
    [
      ibtn(c.is_active ? '⏸ Выкл' : '▶️ Вкл', `camp_toggle:${id}`),
      ibtn('✏️ Изменить', `camp_edit:${id}`),
    ],
    [
      ibtn('🗑 Удалить', `camp_del:${id}`),
      ibtn('« Кампании', 'camps'),
    ],
  ]);
}

function campToggle(cid, mid, id) {
  cb.toggleCampaign(id);
  return pageCampDetail(cid, mid, id);
}

function campDelAsk(cid, mid, id) {
  const c = cb.getCampaigns().find(x => x.id === id);
  return editMsg(cid, mid,
    `⚠️ *Удалить кампанию «${esc(c?.name || '?')}»?*`,
    [[ ibtn('✅ Да', `camp_del_y:${id}`), ibtn('❌ Нет', `camp_v:${id}`) ]]
  );
}

function campDel(cid, mid, id) {
  cb.deleteCampaign(id);
  return pageCampaigns(cid, mid);
}

// ═══════════════════════════════════════════════════════════════════════════
//  ВИЗАРД — СОЗДАНИЕ / РЕДАКТИРОВАНИЕ КАМПАНИИ (5 шагов)
// ═══════════════════════════════════════════════════════════════════════════

function wizCampStart(cid, mid) {
  wizards.set(cid, {
    type: 'camp', step: 'name',
    data: { name:'', title_template:'', body_template:'', profile_ids:[], schedule_times:[] },
  });
  return editMsg(cid, mid,
    '📋 *Новая кампания*\n\n📌 *Шаг 1/5* — Введите название:',
    [[ ibtn('❌ Отмена', 'camps') ]]
  );
}

function wizCampEdit(cid, mid, id) {
  const c = cb.getCampaigns().find(x => x.id === id);
  if (!c) return pageCampaigns(cid, mid);

  wizards.set(cid, {
    type: 'camp', step: 'name', editId: id,
    data: {
      name:           c.name,
      title_template: c.title_template,
      body_template:  c.body_template,
      profile_ids:    [...(c.profile_ids || [])],
      schedule_times: c.schedule_times ? [...c.schedule_times] : [],
    },
  });

  return editMsg(cid, mid,
    `✏️ *Редактирование «${esc(c.name)}»*\n\n📌 *Шаг 1/5* — Название\nТекущее: _${esc(c.name)}_\n\nВведите новое или нажмите «Пропустить»:`,
    [[ ibtn('➡️ Пропустить', 'wiz_skip') ], [ ibtn('❌ Отмена', `camp_v:${id}`) ]]
  );
}

// ── Текстовый ввод визарда ───────────────────────────────────────────────

function onText(msg) {
  const cid = msg.chat.id;
  const wiz = wizards.get(cid);
  if (!wiz) return;
  const text = (msg.text || '').trim();
  if (!text) return;

  if (wiz.type === 'acc')  return wizAccountText(cid, text);
  if (wiz.type === 'camp') return wizCampText(cid, text, wiz);
}

function wizCampText(cid, text, wiz) {
  const { step, data } = wiz;

  if (step === 'name')  { data.name = text;           return wizCampGo(cid, wiz, 'title'); }
  if (step === 'title') { data.title_template = text;  return wizCampGo(cid, wiz, 'body'); }
  if (step === 'body')  { data.body_template = text;   return wizCampGo(cid, wiz, 'accounts'); }

  if (step === 'times') {
    const m = text.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return tgBot.sendMessage(cid, '⚠️ Формат: `HH:MM` (например 14:30)', { parse_mode: 'Markdown' });
    const h = parseInt(m[1], 10), mn = parseInt(m[2], 10);
    if (h > 23 || mn > 59) return tgBot.sendMessage(cid, '⚠️ Некорректное время');
    const t = `${String(h).padStart(2,'0')}:${String(mn).padStart(2,'0')}`;
    if (!data.schedule_times.includes(t)) {
      data.schedule_times.push(t);
      data.schedule_times.sort();
    }
    return stepTimes(cid, wiz);
  }
}

// ── Inline-кнопки визарда ────────────────────────────────────────────────

function wizCallback(cid, mid, d) {
  const wiz = wizards.get(cid);
  if (!wiz || wiz.type !== 'camp') return;

  if (d === 'wiz_skip') {
    const order = ['name','title','body','accounts','times','confirm'];
    const idx   = order.indexOf(wiz.step);
    return wizCampGo(cid, wiz, order[Math.min(idx + 1, order.length - 1)], mid);
  }

  if (d.startsWith('wiz_acc:')) {
    const aid = d.slice(8);
    const idx = wiz.data.profile_ids.indexOf(aid);
    if (idx >= 0) wiz.data.profile_ids.splice(idx, 1);
    else wiz.data.profile_ids.push(aid);
    return stepAccounts(cid, wiz, mid);
  }
  if (d === 'wiz_accs_ok') {
    if (!wiz.data.profile_ids.length) return;
    return wizCampGo(cid, wiz, 'times', mid);
  }
  if (d.startsWith('wiz_tdel:')) {
    wiz.data.schedule_times = wiz.data.schedule_times.filter(x => x !== d.slice(9));
    return stepTimes(cid, wiz, mid);
  }
  if (d === 'wiz_times_ok') return wizCampGo(cid, wiz, 'confirm', mid);
  if (d === 'wiz_save')     return wizCampSave(cid, wiz, mid);
}

// ── Навигация по шагам ──────────────────────────────────────────────────

function wizCampGo(cid, wiz, next, mid) {
  wiz.step = next;

  if (next === 'name') {
    return sendStep(cid, mid,
      '📌 *Шаг 1/5* — Введите название кампании:',
      [[ ibtn('❌ Отмена', 'camps') ]]
    );
  }
  if (next === 'title') {
    const cur = wiz.data.title_template ? `\nТекущее: _${esc(wiz.data.title_template)}_` : '';
    const skip = wiz.editId ? [[ ibtn('➡️ Пропустить', 'wiz_skip') ]] : [];
    return sendStep(cid, mid,
      `📌 *Шаг 2/5* — Заголовок поста:${cur}\n\n💡 Переменные: \`{num}\`, \`{date}\`, \`{account}\``,
      [...skip, [ ibtn('❌ Отмена', 'camps') ]]
    );
  }
  if (next === 'body') {
    const cur = wiz.data.body_template ? `\nТекущее: _${esc(clip(wiz.data.body_template, 120))}_` : '';
    const skip = wiz.editId ? [[ ibtn('➡️ Пропустить', 'wiz_skip') ]] : [];
    return sendStep(cid, mid,
      `📌 *Шаг 3/5* — Текст поста:${cur}\n\n💡 Переменные: \`{num}\`, \`{date}\`, \`{account}\``,
      [...skip, [ ibtn('❌ Отмена', 'camps') ]]
    );
  }
  if (next === 'accounts') return stepAccounts(cid, wiz, mid);
  if (next === 'times')    return stepTimes(cid, wiz, mid);
  if (next === 'confirm')  return stepConfirm(cid, wiz, mid);
}

function stepAccounts(cid, wiz, mid) {
  const accs = cb.getAccounts().filter(a => a.is_active);
  const sel  = wiz.data.profile_ids;

  const rows = accs.map(a => [
    ibtn(`${sel.includes(a.id) ? '✅' : '⬜'} ${a.name}`, `wiz_acc:${a.id}`),
  ]);
  rows.push([ ibtn(`✔️ Готово (${sel.length})`, 'wiz_accs_ok') ]);
  rows.push([ ibtn('❌ Отмена', 'camps') ]);

  return sendStep(cid, mid, '📌 *Шаг 4/5* — Выберите аккаунты:', rows);
}

function stepTimes(cid, wiz, mid) {
  const times = wiz.data.schedule_times;
  const chips = times.length
    ? times.map(t => `🕐 ${t}`).join('  ')
    : '_Пусто — будет интервал каждые 60 мин_';

  // Кнопки удаления (по 4 в ряд)
  const dels = times.map(t => ibtn(`❌ ${t}`, `wiz_tdel:${t}`));
  const delRows = [];
  for (let i = 0; i < dels.length; i += 4) delRows.push(dels.slice(i, i + 4));

  return sendStep(cid, mid,
    `📌 *Шаг 5/5* — Время публикаций:\n\n${chips}\n\nОтправьте время в формате \`HH:MM\`\nНапример: \`09:30\``,
    [...delRows, [ ibtn(`✔️ Готово (${times.length})`, 'wiz_times_ok') ], [ ibtn('❌ Отмена', 'camps') ]]
  );
}

function stepConfirm(cid, wiz, mid) {
  const d = wiz.data;
  const profNames = cb.getAccounts()
    .filter(a => d.profile_ids.includes(a.id))
    .map(a => a.name).join(', ') || '—';
  const times = d.schedule_times.length
    ? d.schedule_times.join(', ')
    : 'каждые 60 мин (по умолчанию)';

  const text = [
    wiz.editId ? '✏️ *Подтверждение изменений*' : '📋 *Новая кампания*',
    '',
    `📌 *Название:* ${esc(d.name)}`,
    `📝 *Заголовок:* ${esc(d.title_template)}`,
    `📄 *Текст:* ${esc(clip(d.body_template, 200))}`,
    `👤 *Аккаунты:* ${esc(profNames)}`,
    `🕐 *Расписание:* ${times}`,
    '',
    '✅ Сохранить?',
  ].join('\n');

  return sendStep(cid, mid, text, [
    [ ibtn('✅ Сохранить', 'wiz_save'), ibtn('❌ Отмена', 'camps') ],
  ]);
}

function wizCampSave(cid, wiz, mid) {
  const d = wiz.data;
  const r = cb.saveCampaign({
    id:               wiz.editId || undefined,
    name:             d.name,
    title_template:   d.title_template,
    body_template:    d.body_template,
    schedule_minutes: d.schedule_times.length ? 0 : 60,
    schedule_times:   d.schedule_times.length ? d.schedule_times : null,
    window_start:     '00:00',
    window_end:       '23:59',
    profile_ids:      d.profile_ids,
  });
  wizards.delete(cid);

  const text = r.ok
    ? `✅ Кампания *${esc(d.name)}* ${wiz.editId ? 'обновлена' : 'создана'}!`
    : `❌ Ошибка: ${esc(r.error || 'unknown')}`;

  return sendStep(cid, mid, text, [
    [ ibtn('📋 Кампании', 'camps'), ibtn('🏠 Меню', 'menu') ],
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
//  ЛОГ / ОШИБКИ
// ═══════════════════════════════════════════════════════════════════════════

function pageLogs(cid, mid) {
  const jobs  = cb.getRecentJobs().slice(0, 20);
  const icons = { done:'✅', failed:'❌', running:'⏳', pending:'🕒', cancelled:'🚫' };

  const lines = jobs.length
    ? jobs.map(j => {
        const ts = fmtTime(j.executed_at || j.scheduled_at);
        return `${icons[j.status]||'·'} ${ts}  ${esc(j.profile_name||'?')} — ${esc(clip(j.title||'',35))}`;
      }).join('\n')
    : '_Нет записей_';

  return editMsg(cid, mid, `📜 *Лог (${jobs.length})*\n\n${lines}`, [
    [ ibtn('🔄 Обновить', 'logs'), ibtn('« Меню', 'menu') ],
  ]);
}

function pageErrors(cid, mid) {
  const jobs = cb.getRecentJobs().filter(j => j.status === 'failed').slice(0, 10);

  const lines = jobs.length
    ? jobs.map(j => {
        const ts = fmtTime(j.executed_at);
        return `❌ ${ts} | *${esc(j.profile_name||'?')}*\n   _${esc(clip(j.error||'?', 80))}_`;
      }).join('\n\n')
    : '_✅ Ошибок нет_';

  return editMsg(cid, mid, `❌ *Ошибки*\n\n${lines}`, [
    [ ibtn('🔄 Обновить', 'errors'), ibtn('« Меню', 'menu') ],
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
//  УВЕДОМЛЕНИЯ
// ═══════════════════════════════════════════════════════════════════════════

function notify(text) {
  if (!tgBot || !chatIds.length) return;
  for (const cid of chatIds) {
    tgBot.sendMessage(cid, text, { parse_mode: 'Markdown' }).catch(e =>
      logger.warn(`TG notify err [${cid}]: ${e.message}`)
    );
  }
}

function notifySuccess(profileName, title, url) {
  if (!options.notifySuccess) return;
  notify(`✅ *Пост создан*\n👤 ${esc(profileName)}\n📝 ${esc(title)}\n🔗 ${url || '—'}`);
}

function notifyError(profileName, title, error) {
  if (!options.notifyErrors) return;
  notify(`❌ *Ошибка публикации*\n👤 ${esc(profileName)}\n📝 ${esc(title)}\n⚠️ ${esc(error)}`);
}

function notifyAccountExpired(profileName) {
  if (!options.notifyExpired) return;
  notify(`⚠️ *Аккаунт вылетел!*\n👤 ${esc(profileName)}\nКуки истекли — аккаунт деактивирован.`);
}

function notifyBotState(running) {
  if (!options.notifyBotState) return;
  notify(running ? '▶️ Бот *запущен*' : '⏹ Бот *остановлен*');
}

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function isAuth(msg) {
  const id = String(msg.chat?.id || msg.from?.id || '');
  return chatIds.includes(id);
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/[_*\[\]()~`>#+=|{}.!\\-]/g, '\\$&');
}

function clip(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function fmtTime(iso) {
  if (!iso) return '——';
  try { return new Date(iso).toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' }); }
  catch { return '——'; }
}

function ibtn(text, data) {
  return { text, callback_data: data };
}

/** editMessageText → fallback → sendMessage */
function editMsg(cid, mid, text, kb) {
  const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } };
  if (mid) {
    return tgBot.editMessageText(text, { ...opts, chat_id: cid, message_id: mid })
      .catch(() => tgBot.sendMessage(cid, text, opts));
  }
  return tgBot.sendMessage(cid, text, opts);
}

function sendStep(cid, mid, text, kb) { return editMsg(cid, mid, text, kb); }

// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  start, stop, isRunning, notify,
  notifySuccess, notifyError, notifyAccountExpired, notifyBotState,
};
