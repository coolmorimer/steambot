'use strict';

/**
 * scheduler.js — логика генерации очереди джобов и проверки временного окна.
 *
 * generatePendingJobs() — вызывается при старте и каждые 5 минут.
 * isInWindow(campaign)  — проверяет, попадает ли текущее время в активное окно.
 * renderTemplate(tpl, vars) — подставляет переменные {date}, {time}, {num}, {profile}, {day}.
 */

const db     = require('./db');
const logger = require('./logger');

// ── Форматирование даты/времени ────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

/** "20 Feb 2026" */
function fmtDate(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** "16:00" */
function fmtTime(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

/** "Friday" */
function fmtDay(d) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return days[d.getDay()];
}

// ── renderTemplate ─────────────────────────────────────────────────────────

/**
 * @param {string} template
 * @param {{ date:string, time:string, num:number, profile:string, day:string }} vars
 */
function renderTemplate(template, vars) {
  return template
    .replace(/\{date\}/gi,    vars.date)
    .replace(/\{time\}/gi,    vars.time)
    .replace(/\{num\}/gi,     String(vars.num))
    .replace(/\{profile\}/gi, vars.profile)
    .replace(/\{day\}/gi,     vars.day)
    // Поддержка русских переменных из ТЗ
    .replace(/\{дата\}/gi,    vars.date)
    .replace(/\{время\}/gi,   vars.time)
    .replace(/\{номер\}/gi,   String(vars.num))
    .replace(/\{день\}/gi,    vars.day);
}

// ── isInWindow ─────────────────────────────────────────────────────────────

/**
 * Проверяет, попадает ли текущее время в активное окно кампании.
 * Поддерживает ночные окна: window_start > window_end ("22:00" – "06:00").
 *
 * @param {{ window_start:string, window_end:string }} campaign
 */
function isInWindow(campaign) {
  if (!campaign.window_start || !campaign.window_end) return true;

  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();

  const [sh, sm] = campaign.window_start.split(':').map(Number);
  const [eh, em] = campaign.window_end.split(':').map(Number);
  const start = sh * 60 + sm;
  const end   = eh * 60 + em;

  if (start <= end) {
    // Обычное окно: 10:00 – 22:00
    return cur >= start && cur <= end;
  } else {
    // Ночное окно: 22:00 – 06:00
    return cur >= start || cur <= end;
  }
}

// ── Режим точных времён ────────────────────────────────────────────────────

/**
 * Вычисляет следующий scheduled_at для кампании с schedule_times (["17:00","21:00"]).
 *
 * Логика:
 *  - Если нет предыдущего джоба: берём первое время из списка, которое ещё
 *    не наступило сегодня. Если все прошли — первое время завтра.
 *  - Если предыдущий джоб есть: берём следующий слот ПОСЛЕ scheduled_at
 *    предыдущего (переходим на следующий день если циклически исчерпан).
 *    Если результат оказался в прошлом (бот выключался) — прыгаем к
 *    ближайшему будущему слоту.
 *
 * @param {object|null} lastJob
 * @param {string[]}    scheduleTimes  – отсортированный массив "HH:MM"
 * @param {Date}        now
 * @returns {Date}
 */
function getNextExactTime(lastJob, scheduleTimes, now) {
  const sorted = [...scheduleTimes].sort(); // ["17:00","21:00"]

  function makeAt(baseDate, hhMM) {
    const d = new Date(baseDate);
    const [h, m] = hhMM.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  }

  if (!lastJob) {
    // Нет истории — берём первый будущий слот сегодня
    for (const t of sorted) {
      const dt = makeAt(now, t);
      if (dt > now) return dt;
    }
    // Все слоты сегодня прошли → первый слот завтра
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return makeAt(tomorrow, sorted[0]);
  }

  // Есть последний джоб — находим следующий слот после его scheduled_at
  const last = new Date(lastJob.scheduled_at);
  const lastHHMM = `${pad(last.getHours())}:${pad(last.getMinutes())}`;

  // Слот строго ПОСЛЕ lastHHMM в отсортированном списке
  const nextIdx = sorted.findIndex(t => t > lastHHMM);
  let candidate;
  if (nextIdx !== -1) {
    // Следующий слот в тот же день, что и lastJob
    candidate = makeAt(last, sorted[nextIdx]);
  } else {
    // Все слоты дня исчерпаны → первый слот следующего дня
    const nextDay = new Date(last);
    nextDay.setDate(nextDay.getDate() + 1);
    candidate = makeAt(nextDay, sorted[0]);
  }

  // Если кандидат уже в прошлом (бот долго не работал) — прыгаем к
  // ближайшему будущему слоту начиная с сегодня
  if (candidate <= now) {
    for (const t of sorted) {
      const dt = makeAt(now, t);
      if (dt > now) return dt;
    }
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return makeAt(tomorrow, sorted[0]);
  }

  return candidate;
}

// ── generatePendingJobs ────────────────────────────────────────────────────

/**
 * Для каждой активной пары (кампания + профиль) создаёт ровно один
 * pending-джоб, если такого ещё нет.
 *
 * Поддерживает два режима:
 *  • Точные времена (schedule_times: ["17:00","21:00"]) — новый
 *  • Интервал (schedule_minutes)                         — устаревший
 */
function generatePendingJobs() {
  const campaigns = db.getCampaigns().filter(c => c.is_active);

  for (const campaign of campaigns) {
    const profileIds = Array.isArray(campaign.profile_ids) ? campaign.profile_ids : [];
    // Определяем режим кампании
    const exactMode = Array.isArray(campaign.schedule_times) && campaign.schedule_times.length > 0;

    for (const profileId of profileIds) {
      const profile = db.getProfile(profileId);
      if (!profile || !profile.is_active) continue;

      // Не создавать дубли
      if (db.hasPendingJob(campaign.id, profileId)) continue;

      const lastJob = db.getLastJob(campaign.id, profileId);
      let scheduledAt;

      if (exactMode) {
        // ── Режим точных времён ────────────────────────────────────────
        scheduledAt = getNextExactTime(lastJob, campaign.schedule_times, new Date());

      } else if (!lastJob) {
        // ── Интервальный режим: первый джоб ───────────────────────────
        // Размазываем старты внутри кампании, чтобы профили не стреляли
        // одновременно в первом круге.
        const profileIndex  = profileIds.indexOf(profileId);
        const totalProfiles = Math.max(profileIds.length, 1);
        const staggerMs = profileIndex * Math.floor(
          (campaign.schedule_minutes * 60 * 1000) / totalProfiles
        );
        scheduledAt = new Date(Date.now() + staggerMs);
      } else {
        // ── Интервальный режим: последующие джобы ─────────────────────
        // ВСЕГДА берём scheduled_at предыдущего джоба (не executed_at!),
        // чтобы сохранить уникальное смещение каждой пары.
        const intervalMs = campaign.schedule_minutes * 60 * 1000;
        const baseTime   = new Date(lastJob.scheduled_at);
        scheduledAt      = new Date(baseTime.getTime() + intervalMs);

        // Если расчётное время уже прошло — перемотать вперёд.
        const now = new Date();
        if (scheduledAt <= now) {
          const elapsed = now.getTime() - scheduledAt.getTime();
          const jumps   = Math.floor(elapsed / intervalMs) + 1;
          scheduledAt   = new Date(scheduledAt.getTime() + jumps * intervalMs);
        }
      }

      // Рендерим шаблоны на момент создания джоба
      const now      = new Date();
      const postNum  = db.getProfilePostCount(profileId) + 1;
      const vars     = {
        date:    fmtDate(now),
        time:    fmtTime(now),
        num:     postNum,
        profile: profile.name,
        day:     fmtDay(now),
      };

      const title = renderTemplate(campaign.title_template, vars);
      const body  = renderTemplate(campaign.body_template,  vars);

      db.createJob({
        campaignId:  campaign.id,
        profileId:   profile.id,
        scheduledAt: scheduledAt.toISOString(),
        title,
        body,
      });

      const timeStr = `${pad(scheduledAt.getHours())}:${pad(scheduledAt.getMinutes())}:${pad(scheduledAt.getSeconds())}`;
      logger.info(`Scheduler: следующий джоб для "${campaign.name}" / ${profile.name} в ${timeStr}`);
    }
  }
}

module.exports = { generatePendingJobs, isInWindow, renderTemplate };
