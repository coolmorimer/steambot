'use strict';

/**
 * bot.js — главный класс Bot.
 *
 * - При start(): сбрасывает зависшие running-джобы, генерирует pending-джобы,
 *   запускает два cron-таска.
 * - Каждую минуту: берёт due-джобы (pending + scheduled_at <= now) и запускает их.
 * - Каждые 5 минут: генерирует новые pending-джобы из активных кампаний.
 */

const cron      = require('node-cron');
const { EventEmitter } = require('events');
const db        = require('./db');
const poster    = require('./poster');
const scheduler = require('./scheduler');
const logger    = require('./logger');

class Bot extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {boolean} [options.headless=true]
   * @param {number}  [options.slowMo=100]
   * @param {number[]} [options.postDelay]
   * @param {number}  [options.retries=2]
   */
  constructor(options = {}) {
    super();
    this.headless   = options.headless   !== false;
    this.slowMo     = options.slowMo     ?? 100;
    this.postDelay  = options.postDelay  ?? [2000, 5000];
    this.retries    = options.retries    ?? 2;
    this._tasks         = [];
    this._running       = false;
    this._busyJobs      = new Set(); // защита от параллельного запуска одного job
    this._busyProfiles  = new Set(); // один профиль = один браузер одновременно
    this._cancelledJobs = new Set(); // джобы, отменённые пользователем в процессе
  }

  /** Отправить лог-событие в UI */
  _log(level, message, meta = {}) {
    const entry = {
      ts:      new Date().toISOString(),
      level,   // 'info' | 'warn' | 'error'
      message,
      ...meta,
    };
    this.emit('log', entry);
  }

  // ── Публичный API ──────────────────────────────────────────────────────

  start() {
    if (this._running) return;
    this._running = true;

    // Сброс джобов, которые зависли в статусе "running" при прошлом запуске
    db.resetRunningJobs();

    // Отменить pending-джобы, время которых просрочено
    const cancelled = db.cancelOverduePendingJobs();
    if (cancelled > 0) {
      logger.info(`Bot: отменено ${cancelled} просроченных pending-джобов.`);
      this._log('warn', `Отменено ${cancelled} просроченных задач`);
    }

    const profiles  = db.getProfiles();
    const activeProfiles  = profiles.filter(p => p.is_active);
    const expiredProfiles = profiles.filter(p => !p.is_active);
    const campaigns = db.getCampaigns().filter(c => c.is_active);
    logger.info(`Bot started. ${profiles.length} профилей (${activeProfiles.length} активных, ${expiredProfiles.length} неактивных), ${campaigns.length} активных кампаний.`);
    this._log('info', `Бот запущен: ${activeProfiles.length} аккаунтов, ${campaigns.length} кампаний`);

    if (expiredProfiles.length > 0) {
      const names = expiredProfiles.map(p => p.name).join(', ');
      this._log('warn', `Неактивные аккаунты (куки истекли): ${names}`);
    }

    // Немедленно сгенерировать первую волну pending-джобов
    // Ждём немного после генерации
    scheduler.generatePendingJobs();
    const pendingCount = db.getDueJobs().length;
    if (pendingCount > 0) {
      this._log('info', `В очереди: ${pendingCount} задач готовы к выполнению`);
    }

    // ── Cron 1: каждую минуту — проверить очередь ──────────────────
    const checkTask = cron.schedule('* * * * *', async () => {
      await this._processQueue();
    });

    // ── Cron 2: каждые 5 минут — пополнить очередь ───────────────
    const genTask = cron.schedule('*/5 * * * *', () => {
      scheduler.generatePendingJobs();
      this._log('info', 'Планировщик: очередь обновлена');
    });

    this._tasks = [checkTask, genTask];

    // Graceful shutdown
    process.on('SIGINT',  () => this._shutdown('SIGINT'));
    process.on('SIGTERM', () => this._shutdown('SIGTERM'));

    logger.info('Планировщик запущен.');
    this._log('info', 'Планировщик запущен, ожидаю задачи...');
  }

  stop() {
    this._tasks.forEach(t => t.stop());
    this._tasks   = [];
    this._running = false;
    this._log('info', 'Бот остановлен');
  }

  // ── Приватные методы ───────────────────────────────────────────────────

  async _processQueue() {
    const dueJobs = db.getDueJobs();
    if (!dueJobs.length) return;

    for (const job of dueJobs) {
      // Пропустить, если этот job уже выполняется в параллельном промисе
      if (this._busyJobs.has(job.id)) continue;

      const campaign = db.getCampaign(job.campaign_id);
      if (campaign && !scheduler.isInWindow(campaign)) {
        logger.info(`[Job ${job.id.slice(0, 8)}] Вне активного окна (${campaign.window_start}–${campaign.window_end}), пропуск`);
        continue;
      }

      // Не открывать второй браузер под тем же аккаунтом
      if (this._busyProfiles.has(job.profile_id)) {
        logger.info(`[Job ${job.id.slice(0, 8)}] Профиль уже занят, пропуск до следующего тика`);
        continue;
      }

      this._busyJobs.add(job.id);
      this._busyProfiles.add(job.profile_id);
      // Запускаем асинхронно, не блокируя следующий cron-тик
      this._runJob(job).finally(() => {
        this._busyJobs.delete(job.id);
        this._busyProfiles.delete(job.profile_id);
      });
    }
  }

  async _runJob(job) {
    const profile  = db.getProfile(job.profile_id);
    const campaign = db.getCampaign(job.campaign_id);

    if (!profile) {
      logger.error(`[Job ${job.id.slice(0, 8)}] Профиль не найден: ${job.profile_id}`);
      this._log('error', `Профиль не найден`, { profileId: job.profile_id });
      db.updateJobStatus(job.id, 'failed', {
        error:      'Профиль не найден в базе',
        executedAt: new Date().toISOString(),
      });
      return;
    }

    // Отметить как running
    db.updateJobStatus(job.id, 'running');
    logger.info(`[${profile.name}] Запускаю джоб: "${job.title}"`);
    this._log('info', `Публикация: ${profile.name} → "${job.title}"`, { profileName: profile.name });
    const t0 = Date.now();

    try {
      const topicUrl = await poster.createForumPost(profile, job.title, job.body, {
        headless:   this.headless,
        slowMo:     this.slowMo,
        postDelay:  this.postDelay,
        retries:    this.retries,
      });

      // Джоб мог быть отменён пока выполнялся — не перезаписывать статус
      if (this._cancelledJobs.has(job.id)) {
        logger.info(`[Job ${job.id.slice(0, 8)}] Завершён, но был отменён пользователем — результат отброшен.`);
        this._cancelledJobs.delete(job.id);
        scheduler.generatePendingJobs();
        return;
      }

      logger.info(`[${profile.name}] ✅ Тема создана: ${topicUrl}`);
      this._log('info', `✅ Успешно: ${profile.name} — тема создана за ${((Date.now()-t0)/1000).toFixed(1)}с`, { profileName: profile.name, url: topicUrl });
      db.updateJobStatus(job.id, 'done', {
        topicUrl,
        executedAt: new Date().toISOString(),
      });

      // Немедленно создать следующий pending-джоб для этой пары
      scheduler.generatePendingJobs();

    } catch (err) {
      // Джоб мог быть отменён пока выполнялся
      if (this._cancelledJobs.has(job.id)) {
        logger.info(`[Job ${job.id.slice(0, 8)}] Ошибка в отменённом джобе — игнорируем.`);
        this._cancelledJobs.delete(job.id);
        scheduler.generatePendingJobs();
        return;
      }

      logger.error(`[${profile.name}] ❌ Ошибка: ${err.message}`);

      // Классификация ошибки для UI
      let errorMsg = err.message;
      let logLevel = 'error';

      if (err.message === 'SESSION_EXPIRED') {
        errorMsg = `Сессия истекла — куки не работают`;
        logger.warn(`[${profile.name}] ⚠️  Куки истекли! Аккаунт деактивирован.`);
        db.setProfileActive(profile.id, false);
        this._log('error', `⚠️ Аккаунт ${profile.name}: куки истекли! Аккаунт деактивирован. Перезайдите в Steam.`, { profileName: profile.name, type: 'session_expired' });
        this.emit('account:expired', { profileId: profile.id, profileName: profile.name });
      } else if (err.message.includes('не удалось загрузить') || err.message.includes('net::')) {
        errorMsg = `Ошибка сети: ${err.message}`;
        this._log('error', `🌐 ${profile.name}: ошибка сети — ${err.message}`, { profileName: profile.name, type: 'network' });
      } else if (err.message.includes('не найдена') || err.message.includes('не появилось')) {
        this._log('error', `🔧 ${profile.name}: ${err.message}`, { profileName: profile.name, type: 'ui_changed' });
      } else if (err.message.includes('Steam отклонил')) {
        this._log('error', `⛔ ${profile.name}: ${err.message}`, { profileName: profile.name, type: 'steam_reject' });
      } else {
        this._log('error', `❌ ${profile.name}: ${err.message}`, { profileName: profile.name });
      }

      db.updateJobStatus(job.id, 'failed', {
        error:      errorMsg,
        executedAt: new Date().toISOString(),
      });

      // Даже при ошибке — запланировать следующую попытку
      scheduler.generatePendingJobs();
    }
  }

  _shutdown(signal) {
    logger.info(`Получен ${signal}. Остановка бота...`);
    this.stop();
    process.exit(0);
  }
}

module.exports = Bot;
