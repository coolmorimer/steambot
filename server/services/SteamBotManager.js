'use strict';

/**
 * server/services/SteamBotManager.js
 *
 * Управляет пулом Steam-ботов (постеров) — по одному на пользователя.
 * Каждый бот работает в одном процессе но с изолированным контекстом (userId).
 *
 * API:
 *   start(userId)             — запустить бот
 *   stop(userId)              — остановить бот
 *   getStatus(userId)         — { running, activeJobs, lastActivity }
 *   notifyNewCampaign(userId) — триггер пересчёта очереди
 *   stopAll()                 — остановить все (при shutdown)
 */

const cron   = require('node-cron');
const path   = require('path');
const db     = require('../db');
const config = require('../config');
const TelegramBotManager = require('./TelegramBotManager');

// Инвентарь лениво — не грузить Playwright при каждом запросе
let _fetchInventory;
function getFetchInventory() {
  if (!_fetchInventory) {
    try { _fetchInventory = require(path.join(__dirname, '..', '..', 'inventory.js')).fetchInventory; }
    catch { _fetchInventory = null; }
  }
  return _fetchInventory;
}

const PostTpl = require('./PostTemplateGenerator');

const INV_VAR_RE = /\{(items_count|knives_count|stattrak_count|best_item|top_items|trade_url|full_inventory_post|knives_section|gloves_section|awp_section|ak47_section|m4_section|pistols_section|agents_section|other_section)\}/i;
function hasInventoryVars(t) { return INV_VAR_RE.test(t); }

// Состояние: userId -> { running, tasks, busyJobs, busyProfiles }
const _bots = new Map();

// ── Запуск ────────────────────────────────────────────────────────────────────

function start(userId) {
  if (_bots.has(userId)) return; // уже запущен

  const state = {
    running:      true,
    busyJobs:     new Set(),
    busyProfiles: new Set(),
    tasks:        [],
    lastActivity: null,
  };

  // Сброс зависших jobs
  db.resetRunningJobs(userId);

  // Отмена просроченных pending jobs
  const cancelled = db.cancelOverduePendingJobs(userId);
  if (cancelled > 0) {
    console.log(`[SteamBot ${userId}] Отменено ${cancelled} просроченных задач.`);
  }

  // Немедленно сгенерировать очередь
  generatePendingJobs(userId);

  // Cron 1: каждую минуту — обработать очередь
  const checkTask = cron.schedule('* * * * *', async () => {
    await processQueue(userId, state);
  });

  // Cron 2: каждые 5 минут — пополнить очередь
  const genTask = cron.schedule('*/5 * * * *', () => {
    generatePendingJobs(userId);
  });

  state.tasks = [checkTask, genTask];
  _bots.set(userId, state);

  // Запомнить, что бот был запущен — для автовосстановления после рестарта
  db.setSetting(userId, 'bot_running', '1');

  console.log(`[SteamBot] Запущен для пользователя ${userId}`);

  // Уведомить TG-бот
  TelegramBotManager.sendNotification(userId, '▶️ Steam Poster Bot запущен.');
}

// ── Остановка ─────────────────────────────────────────────────────────────────

function stop(userId) {
  const state = _bots.get(userId);
  if (!state) return;

  state.running = false;
  for (const task of state.tasks) {
    try { task.stop(); } catch (_) {}
  }
  _bots.delete(userId);

  db.setSetting(userId, 'bot_running', '0');

  console.log(`[SteamBot] Остановлен для пользователя ${userId}`);
  TelegramBotManager.sendNotification(userId, '⏹ Steam Poster Bot остановлен.');
}

// ── Статус ────────────────────────────────────────────────────────────────────

function getStatus(userId) {
  const state = _bots.get(userId);
  if (!state) return { running: false };

  const stats = db.getJobStats(userId);
  const statsMap = {};
  for (const r of stats) statsMap[r.status] = r.count;

  return {
    running:      true,
    active_jobs:  state.busyJobs.size,
    last_activity:state.lastActivity,
    stats:        statsMap,
  };
}

// ── Триггер пересчёта очереди ─────────────────────────────────────────────────

function notifyNewCampaign(userId) {
  // Генерировать джобы всегда — они видны в очереди сразу после создания кампании.
  // Выполнять их будет processQueue только когда бот запущен.
  generatePendingJobs(userId).catch(err =>
    console.error(`[SteamBot ${userId}] generatePendingJobs error:`, err.message)
  );
}

// ── Генерация pending jobs ────────────────────────────────────────────────────

async function generatePendingJobs(userId) {
  const [allCampaigns, allProfiles] = await Promise.all([
    db.getCampaigns(userId),
    db.getProfiles(userId),
  ]);
  const campaigns = allCampaigns.filter(c => c.is_active);
  const profiles  = allProfiles.filter(p => p.is_active);

  console.log(`[SteamBot ${userId}] generatePendingJobs: кампаний=${campaigns.length}, профилей=${profiles.length}`);

  if (!campaigns.length || !profiles.length) {
    console.log(`[SteamBot ${userId}] Нет активных кампаний или профилей — джобы не создаём.`);
    return;
  }

  // Лимит на кол-во постов в день
  const sub = await db.getActiveSubscription(userId);
  const maxToday = sub ? sub.max_jobs_per_day : 10;
  const doneToday = maxToday === -1 ? 0 : await db.countJobsToday(userId);
  if (maxToday !== -1 && doneToday >= maxToday) return;

  for (const campaign of campaigns) {
    const profileIds = campaign.profile_ids.filter(pid =>
      profiles.some(p => p.id === pid)
    );

    for (const profileId of profileIds) {
      const profileObj = profiles.find(p => p.id === profileId);
      if (!profileObj) continue;

      // Получить последний job для этой кампании + профиля
      const lastJob = await db.getLastJobForCampaignProfile(userId, campaign.id, profileId);

      const nextTime = calcNextScheduledAt(campaign, lastJob);
      if (!nextTime) {
        console.log(`[SteamBot ${userId}] Кампания "${campaign.name}" / профиль ${profileId}: следующее время не вычислено — пропуск.`);
        continue;
      }

      // Не дублировать уже существующий pending job
      const existing = await db.getPendingJobForCampaignProfile(userId, campaign.id, profileId);
      if (existing) {
        console.log(`[SteamBot ${userId}] Кампания "${campaign.name}" / профиль ${profileId}: pending-джоб уже есть — пропуск.`);
        continue;
      }

      const title = renderTemplate(campaign.title_template, {
        date:    fmtDate(new Date()),
        time:    fmtTime(new Date()),
        num:     lastJob ? (lastJob.id ? 1 : 1) : 1,
        profile: profileObj.name,
        day:     fmtDay(new Date()),
      });

      const body = renderTemplate(campaign.body_template, {
        date:    fmtDate(new Date()),
        time:    fmtTime(new Date()),
        num:     1,
        profile: profileObj.name,
        day:     fmtDay(new Date()),
      });

      const jobId = await db.addJob(userId, {
        campaignId:  campaign.id,
        profileId,
        scheduledAt: nextTime.toISOString(),
        title,
        body,
      });
      console.log(`[SteamBot ${userId}] Создан джоб ${jobId}: кампания "${campaign.name}", профиль ${profileId}, время ${nextTime.toISOString()}`);
    }
  }
}

// ── Обработка очереди ─────────────────────────────────────────────────────────

async function processQueue(userId, state) {
  if (!state.running) return;

  const dueJobs = await db.getDueJobs(userId);
  if (!dueJobs.length) return;

  // Лениво грузим poster
  let poster;
  try {
    poster = require(path.join(__dirname, '..', '..', 'poster.js'));
  } catch (e) {
    console.error(`[SteamBot ${userId}] poster.js не найден:`, e.message);
    return;
  }

  for (const job of dueJobs) {
    if (state.busyJobs.has(job.id))       continue;
    if (state.busyProfiles.has(job.profile_id)) continue;

    state.busyJobs.add(job.id);
    state.busyProfiles.add(job.profile_id);

    // Обработка в фоне (не ждём)
    runJob(userId, job, poster, state).finally(() => {
      state.busyJobs.delete(job.id);
      state.busyProfiles.delete(job.profile_id);
    });
  }
}

async function runJob(userId, job, poster, state) {
  const profile = await db.getProfile(job.profile_id, userId);
  if (!profile) {
    await db.updateJobStatus(job.id, userId, 'failed', { error: 'Профиль не найден' });
    return;
  }
  if (!profile.is_active) {
    await db.updateJobStatus(job.id, userId, 'cancelled', { error: 'Профиль деактивирован' });
    return;
  }

  await db.updateJobStatus(job.id, userId, 'running');

  // Резолвим инвентарь-переменные, если они есть в шаблоне
  let jobTitle = job.title;
  let jobBody  = job.body;

  if (hasInventoryVars(jobTitle) || hasInventoryVars(jobBody)) {
    const fetchInv = getFetchInventory();
    if (fetchInv) {
      try {
        const invData = await fetchInv(profile);
        const invVars = buildInventoryVars(invData);
        jobTitle = applyInventoryVars(jobTitle, invVars);
        jobBody  = applyInventoryVars(jobBody,  invVars);
      } catch (e) {
        console.warn(`[SteamBot ${userId}] inventory fetch failed:`, e.message);
      }
    }
  }

  const posterConfig = config.playwright;

  try {
    // createForumPost(profile, title, body, options) — возвращает URL темы (строку)
    const topicUrl = await poster.createForumPost(
      profile,
      jobTitle,
      jobBody,
      {
        headless: posterConfig.headless !== false,
        slowMo:   posterConfig.slowMo   ?? 100,
        retries:  posterConfig.retries  ?? 2,
      },
    );

    await db.updateJobStatus(job.id, userId, 'done', { topic_url: topicUrl || null });
    state.lastActivity = new Date().toISOString();

    // Уведомить TG
    TelegramBotManager.notifyJobResult(userId, {
      success:     true,
      title:       jobTitle,
      profileName: profile.name,
      topicUrl,
    });

  } catch (err) {
    console.error(`[SteamBot ${userId}] Job ${job.id} failed:`, err.message);

    // SESSION_EXPIRED или явный признак протухших куки — деактивируем профиль
    if (err.message === 'SESSION_EXPIRED' ||
        err.message?.includes('не авторизован') ||
        err.message?.toLowerCase().includes('login')) {
      await db.updateProfile(profile.id, userId, { is_active: 0 });
      await db.updateJobStatus(job.id, userId, 'failed', { error: 'Куки истекли' });
      TelegramBotManager.notifyExpiredAccount(userId, profile.name);
      return;
    }

    await db.updateJobStatus(job.id, userId, 'failed', { error: err.message });
    TelegramBotManager.notifyJobResult(userId, {
      success:     false,
      title:       jobTitle,
      profileName: profile.name,
      error:       err.message,
    });
  }
}

// ── Stop all ─────────────────────────────────────────────────────────────────

function stopAll() {
  for (const [userId] of _bots) stop(userId);
}

// ════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════════════════

function calcNextScheduledAt(campaign, lastJob) {
  const now = new Date();

  if (campaign.schedule_times && campaign.schedule_times.length > 0) {
    return getNextExactTime(lastJob, campaign.schedule_times, now);
  }

  const mins = campaign.schedule_minutes || 60;
  if (!lastJob) {
    return isInWindow(campaign, now) ? now : null;
  }

  const lastTs = new Date(lastJob.scheduled_at);
  const next   = new Date(lastTs.getTime() + mins * 60000);
  if (next <= now) return isInWindow(campaign, now) ? now : null;
  if (!isInWindow(campaign, next)) return null;
  return next;
}

function getNextExactTime(lastJob, scheduleTimes, now) {
  const sorted  = [...scheduleTimes].sort();
  const toMins  = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const curMins = now.getHours() * 60 + now.getMinutes();

  // Хелпер: первый слот сегодня >= minMins
  function slotToday(minMins) {
    const slot = sorted.find(t => toMins(t) >= minMins);
    if (!slot) return null;
    const d = new Date(now);
    const [h, m] = slot.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  }

  // Хелпер: первый слот завтра
  function firstSlotTomorrow() {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    const [h, m] = sorted[0].split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  }

  // Нет предыдущего джоба — ближайший слот >= сейчас (включая текущую минуту)
  if (!lastJob) {
    return slotToday(curMins) || firstSlotTomorrow();
  }

  const lastTs  = new Date(lastJob.scheduled_at);
  const sameDay = lastTs.toDateString() === now.toDateString();

  // Последний джоб был в другой день — планируем ближайший слот сегодня
  if (!sameDay) {
    return slotToday(curMins) || firstSlotTomorrow();
  }

  // Последний джоб был сегодня — ищем следующий слот ПОСЛЕ него
  const lastMins  = lastTs.getHours() * 60 + lastTs.getMinutes();
  const nextSlot  = sorted.find(t => toMins(t) > lastMins);
  if (!nextSlot) return firstSlotTomorrow(); // все сегодняшние слоты выполнены

  const d = new Date(now);
  const [h, m] = nextSlot.split(':').map(Number);
  d.setHours(h, m, 0, 0);

  // Слот ещё не наступил — возвращаем его
  if (d >= now) return d;

  // Слот уже прошёл (например, бот был остановлен) — следующий будущий слот сегодня
  const futureSlot = sorted.find(t => toMins(t) > lastMins && toMins(t) >= curMins);
  if (futureSlot) {
    const fd = new Date(now);
    const [fh, fm] = futureSlot.split(':').map(Number);
    fd.setHours(fh, fm, 0, 0);
    return fd;
  }

  return firstSlotTomorrow();
}

function isInWindow(campaign, d = new Date()) {
  if (!campaign.window_start || !campaign.window_end) return true;
  const cur   = d.getHours()*60 + d.getMinutes();
  const [sh,sm] = campaign.window_start.split(':').map(Number);
  const [eh,em] = campaign.window_end.split(':').map(Number);
  const start = sh*60+sm, end = eh*60+em;
  return start <= end ? (cur>=start && cur<=end) : (cur>=start || cur<=end);
}

function renderTemplate(tpl, vars) {
  return tpl
    .replace(/\{date\}/gi,    vars.date    || '')
    .replace(/\{time\}/gi,    vars.time    || '')
    .replace(/\{num\}/gi,     String(vars.num ?? 1))
    .replace(/\{profile\}/gi, vars.profile || '')
    .replace(/\{day\}/gi,     vars.day     || '')
    .replace(/\{дата\}/gi,    vars.date    || '')
    .replace(/\{время\}/gi,   vars.time    || '')
    .replace(/\{номер\}/gi,   String(vars.num ?? 1))
    .replace(/\{день\}/gi,    vars.day     || '');
}

/** Строит объект с инвентарь-переменными из результата fetchInventory.
 *  items отсортированы по редкости — первый = лучший */
function buildInventoryVars({ items = [], tradeUrl = null } = {}) {
  const knives   = items.filter(i => i.category === 'knife');
  const stattrak = items.filter(i => i.stattrak);
  const best     = items[0]?.name || '';
  const top      = items.slice(0, 5).map(i => i.name).join(', ');

  // Вариант полного поста: случайный emoji-стиль при каждом запуске (0=💔 1=💜 2=💙)
  const variant  = Math.floor(Math.random() * 3);
  const fullPost = PostTpl.buildFullPost(items, tradeUrl || '', variant);

  return {
    items_count:    String(items.length),
    knives_count:   String(knives.length),
    stattrak_count: String(stattrak.length),
    best_item:      best,
    top_items:      top,
    trade_url:      tradeUrl || '',
    // Полный пост (весь body целиком)
    full_inventory_post: fullPost,
    // Отдельные секции
    knives_section:   PostTpl.buildCategorySection(items, 'knife'),
    gloves_section:   PostTpl.buildCategorySection(items, 'gloves'),
    awp_section:      PostTpl.buildCategorySection(items, 'awp'),
    ak47_section:     PostTpl.buildCategorySection(items, 'ak47'),
    m4_section:       PostTpl.buildCategorySection(items, 'm4'),
    pistols_section:  PostTpl.buildCategorySection(items, 'pistol'),
    agents_section:   PostTpl.buildCategorySection(items, 'agent'),
    other_section:    PostTpl.buildCategorySection(items, 'other'),
  };
}

function applyInventoryVars(tpl, inv) {
  return tpl
    .replace(/\{items_count\}/gi,         inv.items_count)
    .replace(/\{knives_count\}/gi,        inv.knives_count)
    .replace(/\{stattrak_count\}/gi,      inv.stattrak_count)
    .replace(/\{best_item\}/gi,           inv.best_item)
    .replace(/\{top_items\}/gi,           inv.top_items)
    .replace(/\{trade_url\}/gi,           inv.trade_url)
    .replace(/\{full_inventory_post\}/gi, inv.full_inventory_post)
    .replace(/\{knives_section\}/gi,      inv.knives_section)
    .replace(/\{gloves_section\}/gi,      inv.gloves_section)
    .replace(/\{awp_section\}/gi,         inv.awp_section)
    .replace(/\{ak47_section\}/gi,        inv.ak47_section)
    .replace(/\{m4_section\}/gi,          inv.m4_section)
    .replace(/\{pistols_section\}/gi,     inv.pistols_section)
    .replace(/\{agents_section\}/gi,      inv.agents_section)
    .replace(/\{other_section\}/gi,       inv.other_section);
}

function fmtDate(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2,'0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtTime(d) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function fmtDay(d) {
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { start, stop, getStatus, notifyNewCampaign, stopAll };
