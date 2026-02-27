'use strict';

/**
 * poster.js — Playwright-движок для публикации тем на форуме Steam.
 *
 * Экспортирует:
 *   createForumPost(profile, title, body, options) → topicUrl
 *   addProfileInteractive(name)                    → cookies[]
 */

const { chromium } = require('playwright');
const logger = require('./logger');

// ── Утилиты ────────────────────────────────────────────────────────────────

/** Рандомная задержка [min, max] мс — имитирует «живого» пользователя */
function sleep(min, max) {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** User-agent реального Chrome 121 на Windows */
const REAL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/121.0.0.0 Safari/537.36';

// ── Основная функция постинга ──────────────────────────────────────────────

/**
 * @param {object} profile          — запись из таблицы profiles
 * @param {string} title            — готовый заголовок темы
 * @param {string} body             — готовый текст темы
 * @param {object} [options]
 * @param {boolean} [options.headless=true]
 * @param {number}  [options.slowMo=100]
 * @param {number[]} [options.postDelay=[2000,5000]]  — [min, max] мс между действиями
 * @param {number}  [options.retries=2]
 * @returns {Promise<string>}  URL созданной темы
 */
async function createForumPost(profile, title, body, options = {}) {
  const headless   = options.headless   !== false;
  const slowMo     = options.slowMo     ?? 100;
  const postDelay  = options.postDelay  ?? [2000, 5000];
  const retries    = options.retries    ?? 2;

  const targetUrl = options.targetUrl || null;

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const t0 = Date.now();
    try {
      logger.info(`[${profile.name}] Попытка ${attempt}/${retries} — запуск браузера...`);
      const url = await _doPost(profile, title, body, { headless, slowMo, postDelay, targetUrl });
      logger.info(`[${profile.name}] Попытка ${attempt} успешна за ${((Date.now()-t0)/1000).toFixed(1)}с`);
      return url;
    } catch (err) {
      lastError = err;
      const elapsed = ((Date.now()-t0)/1000).toFixed(1);
      // SESSION_EXPIRED нет смысла ретраить — куки уже не работают
      if (err.message === 'SESSION_EXPIRED') {
        logger.error(`[${profile.name}] Сессия истекла (попытка ${attempt}, ${elapsed}с). Ретрай бессмысленен.`);
        throw err;
      }
      if (attempt < retries) {
        logger.warn(`[${profile.name}] Попытка ${attempt} неудачна (${elapsed}с): ${err.message}. Повтор через 5 сек...`);
        await sleep(5000, 5000);
      } else {
        logger.error(`[${profile.name}] Все ${retries} попытки исчерпаны (последняя ${elapsed}с): ${err.message}`);
      }
    }
  }
  throw lastError;
}

async function _doPost(profile, title, body, { headless, slowMo, postDelay, targetUrl: optTargetUrl }) {
  const browser = await chromium.launch({ headless, slowMo });

  try {
    const context = await browser.newContext({ userAgent: REAL_UA });
    await context.addCookies(profile.cookies);

    const page = await context.newPage();
    const targetUrl = optTargetUrl || profile.target_url || 'https://steamcommunity.com/app/730/tradingforum/';

    // ── Утилита: скриншот при ошибке ───────────────────────────────────
    async function screenshotOnError(tag) {
      try {
        const fs   = require('fs');
        const path = require('path');
        const base = process.env.APP_USER_DATA || __dirname;
        const dir  = path.join(base, 'logs');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `error_${tag}_${Date.now()}.png`);
        await page.screenshot({ path: file, fullPage: true });
        logger.warn(`[${profile.name}] Скриншот ошибки: ${file}`);
        return file;
      } catch (_) { return null; }
    }

    // ── 1. Открыть страницу форума ──────────────────────────────────────
    logger.info(`[${profile.name}] Открываю форум: ${targetUrl}`);
    try {
      await page.goto(targetUrl, { waitUntil: 'load', timeout: 45_000 });
    } catch (navErr) {
      await screenshotOnError('nav');
      throw new Error(`Не удалось загрузить страницу: ${navErr.message}`);
    }
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    logger.info(`[${profile.name}] Страница загружена, URL: ${page.url()}`);

    // ── 2. Проверить сессию ─────────────────────────────────────────────
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('steampowered.com/login')) {
      await screenshotOnError('session');
      throw new Error('SESSION_EXPIRED');
    }

    // Дополнительная проверка — ищем признаки авторизации
    const loginLink = await page.locator('a[href*="/login"]').count();
    const profileLink = await page.locator('#account_pulldown, .playerAvatar, .user_avatar').count();
    logger.info(`[${profile.name}] Проверка сессии: loginLink=${loginLink}, profileLink=${profileLink}`);
    if (profileLink === 0 && loginLink > 0) {
      await screenshotOnError('session_indirect');
      throw new Error('SESSION_EXPIRED');
    }

    await sleep(...postDelay);

    // ── 3. Открыть форму создания темы ─────────────────────────────────
    // Steam: кнопка «Новое обсуждение» — это <a href="javascript:Forum_CreateTopic(...)">
    // page.goto('javascript:...') не работает — нужно именно КЛИКНУТЬ по элементу.
    logger.info(`[${profile.name}] Ищу кнопку «Новое обсуждение» на странице`);

    const byHrefSel = [
      'a[href*="Forum_CreateTopic"]',
      'a[href*="newtopic"]',
      'a[href*="createtopic"]',
    ].join(', ');

    let createLink = page.locator(byHrefSel).first();
    const hrefCount = await createLink.count();

    if (hrefCount === 0) {
      createLink = page.locator('a').filter({
        hasText: /новое обсуждение|new discussion|create topic/i,
      }).first();
    }

    try {
      await createLink.waitFor({ state: 'visible', timeout: 10_000 });
    } catch (_) {
      await screenshotOnError('no_create_btn');
      throw new Error('Кнопка «Новое обсуждение» не найдена. Возможно, на форуме ограничения или бан.');
    }
    const linkHref = await createLink.getAttribute('href').catch(() => '');
    logger.info(`[${profile.name}] Нажимаю кнопку (href="${linkHref}")`);
    await createLink.click();

    // Дать время инлайн-форме появиться в DOM
    await sleep(1500, 3000);

    // Проверка: куки перестали работать
    if (page.url().includes('login') || page.url().includes('steampowered.com/login')) {
      await screenshotOnError('session_after_click');
      throw new Error('SESSION_EXPIRED');
    }

    // Проверить Steam-ошибки на странице (баны, ограничения)
    const steamError = await page.locator('.error_ctn, .forum_error, .DialogBody').first().textContent().catch(() => null);
    if (steamError && steamError.trim().length > 5) {
      logger.warn(`[${profile.name}] Steam-ошибка на странице: ${steamError.trim().slice(0, 200)}`);
    }

    // ── 4. Заполнить заголовок ──────────────────────────────────────────
    // Steam inline-форма: #newtopic_title / input[name="topictitle"] / input[type="text"]
    logger.info(`[${profile.name}] Жду появления поля заголовка`);
    const titleField = page.locator([
      '#newtopic_title',
      'input[name="topictitle"]',
      'input[name="title"]',
      '#topic_title',
      '.newthread_title',
      'input[type="text"]',
    ].join(', ')).first();
    await titleField.waitFor({ state: 'visible', timeout: 15_000 }).catch(async () => {
      await screenshotOnError('no_title_field');
      throw new Error('Поле заголовка не появилось. Форма создания темы не открылась.');
    });

    logger.info(`[${profile.name}] Ввожу заголовок: "${title}"`);
    await titleField.fill(title);

    await sleep(500, 1500);

    // ── 5. Заполнить тело поста ─────────────────────────────────────────
    // Steam inline-форма: #newtopic_text / textarea[name="topic_details"] / textarea
    logger.info(`[${profile.name}] Ввожу текст поста`);
    const bodyLocator = page.locator([
      '#newtopic_text',
      'textarea[name="topic_details"]',
      'textarea[name="topictext"]',
      'textarea[name="text"]',
      '#topic_text',
      'textarea',
      '[contenteditable="true"]',
    ].join(', ')).first();
    await bodyLocator.waitFor({ state: 'visible', timeout: 10_000 });
    await bodyLocator.fill(body);

    await sleep(...postDelay);

    // ── 6. Отправить форму ──────────────────────────────────────────────
    logger.info(`[${profile.name}] Отправляю форму`);
    const submitBtn = page.locator([
      'input[type="submit"]',
      'button[type="submit"]',
      '.btn_green_steamui',
      'input[value*="Create"]',
      'input[value*="Создать"]',
      'button:has-text("Create")',
      'button:has-text("Создать")',
    ].join(', ')).first();
    await submitBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await submitBtn.click();

    // ── 7. Дождаться URL новой темы ─────────────────────────────────────
    // Steam после создания редиректит на /{forumid}/{topicid}/
    try {
      await page.waitForURL(/\/\d+\/?$/, { timeout: 20_000 });
    } catch (_) {
      // Возможно, Steam показал ошибку вместо редиректа
      const pageText = await page.locator('.error_ctn, .forum_error, .DialogBody').first().textContent().catch(() => null);
      if (pageText) {
        await screenshotOnError('post_error');
        throw new Error(`Steam отклонил публикацию: ${pageText.trim().slice(0, 200)}`);
      }
      await screenshotOnError('no_redirect');
      throw new Error(`Тема не создана — нет редиректа. URL: ${page.url()}`);
    }
    const topicUrl = page.url();

    // Найти ID конкретного поста (OP) на странице — Steam ставит id="c_XXXXXXXXXX"
    let postUrl = topicUrl;
    try {
      await page.waitForSelector('[id^="c_"]', { timeout: 5000 });
      const opId = await page.locator('[id^="c_"]').first().getAttribute('id');
      if (opId) {
        postUrl = topicUrl.replace(/\/?$/, '') + '/#' + opId;
      }
    } catch (_) {
      // Не нашли якорь — используем URL темы
    }
    logger.info(`[${profile.name}] Пост создан: ${postUrl}`);

    return postUrl;
  } finally {
    await browser.close();
  }
}

// ── Интерактивный логин ────────────────────────────────────────────────────

/**
 * Открывает видимый Chromium, ждёт пока пользователь залогинится,
 * возвращает массив cookies для сохранения в БД.
 *
 * @param {string} name — имя профиля (только для лога)
 * @returns {Promise<object[]>} cookies
 */
async function addProfileInteractive(name) {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });

  try {
    const context = await browser.newContext({ userAgent: REAL_UA });
    const page    = await context.newPage();

    await page.goto('https://steamcommunity.com/login/home/', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    console.log('');
    console.log('  🌐 Браузер открыт. Войдите в Steam вручную.');
    console.log('  ⏳ Ожидание входа (до 5 минут)...\n');

    // Ждём пока URL перейдёт на профиль (выйдет со страницы логина)
    await page.waitForFunction(
      () =>
        window.location.hostname.includes('steamcommunity.com') &&
        !window.location.pathname.includes('login'),
      { timeout: 300_000 } // 5 минут на логин
    );

    // Небольшая пауза — дать Steam записать финальные куки
    await sleep(2000, 3000);

    const cookies = await context.cookies();
    return cookies;
  } finally {
    await browser.close();
  }
}

module.exports = { createForumPost, addProfileInteractive };
