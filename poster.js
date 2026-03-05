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
      const isRateLimit = err.message === 'RATE_LIMITED' || err.message.startsWith('RATE_LIMITED');
      if (attempt < retries) {
        const waitMs = isRateLimit ? 90_000 : 5_000;
        const waitLabel = isRateLimit ? '90 сек (rate limit)' : '5 сек';
        logger.warn(`[${profile.name}] Попытка ${attempt} неудачна (${elapsed}с): ${err.message}. Повтор через ${waitLabel}...`);
        await sleep(waitMs, waitMs);
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
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    } catch (navErr) {
      // Retry once with longer timeout
      logger.warn(`[${profile.name}] Первая попытка загрузки не удалась, повторяю...`);
      try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      } catch (retryErr) {
        await screenshotOnError('nav');
        throw new Error(`Не удалось загрузить страницу: ${retryErr.message}`);
      }
    }
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
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

    // Запомним существующие ID тем ДО отправки (для fallback)
    const existingTopicIds = await page.evaluate(() => {
      const ids = new Set();
      for (const a of document.querySelectorAll('a[href]')) {
        const m = a.href.match(/\/(\d{10,})\/?$/);
        if (m) ids.add(m[1]);
      }
      return [...ids];
    });
    logger.info(`[${profile.name}] Существующих тем на странице: ${existingTopicIds.length}`);

    // Подписываемся на AJAX-ответ создания темы (Steam делает POST → возвращает JSON/redirect)
    let ajaxTopicUrl = null;
    let ajaxCreateFailed = null; // null | 'RATE_LIMIT' | 'ERROR'
    const responsePromise = page.waitForResponse(
      resp => {
        const url = resp.url();
        return (url.includes('/createtopic') || url.includes('/newtopic') ||
                url.includes('Forum_CreateTopic') || /tradingforum\/?$/.test(url)) &&
               resp.request().method() === 'POST';
      },
      { timeout: 25_000 }
    ).then(async resp => {
      try {
        const contentType = resp.headers()['content-type'] || '';
        // Steam может вернуть redirect (302) — URL будет в response headers
        const redirectUrl = resp.headers()['location'];
        if (redirectUrl && /\/\d{10,}\/?$/.test(redirectUrl)) {
          ajaxTopicUrl = redirectUrl.startsWith('http') ? redirectUrl : `https://steamcommunity.com${redirectUrl}`;
          logger.info(`[${profile.name}] AJAX redirect header: ${ajaxTopicUrl}`);
          return;
        }
        // Или JSON-ответ с topic ID
        if (contentType.includes('json')) {
          const json = await resp.json().catch(() => null);
          if (json) {
            logger.info(`[${profile.name}] AJAX JSON ответ: ${JSON.stringify(json).slice(0, 300)}`);
            logger.info(`[${profile.name}] AJAX JSON ключи: ${Object.keys(json).join(', ')}`);
            // json.gid НЕ используем — он возвращает GID форума/подфорума, а не темы
            const gid = json.gidnewtopic || json.topic_gid || json.gidforumtopic || json.topicid;
            if (gid) {
              const base = targetUrl.replace(/\/+$/, '');
              ajaxTopicUrl = `${base}/${gid}/`;
              logger.info(`[${profile.name}] Topic GID из AJAX: ${gid}`);
            } else {
              // Нет GID — проверяем код ответа
              const errMsg = json.strError || json.message || json.error || '';
              if (json.success === 84) {
                ajaxCreateFailed = 'RATE_LIMIT';
                logger.warn(`[${profile.name}] Steam rate limit (success=84) — тема НЕ создана`);
              } else if (json.success !== 1 && json.success !== true) {
                ajaxCreateFailed = 'ERROR';
                logger.warn(`[${profile.name}] Steam success=${json.success} без GID темы${errMsg ? ': ' + errMsg : ''}`);
              }
              if (errMsg && !ajaxCreateFailed) {
                ajaxCreateFailed = 'ERROR';
                logger.error(`[${profile.name}] Steam ошибка: ${errMsg}`);
              }
            }
          }
        }
      } catch (e) {
        logger.warn(`[${profile.name}] Ошибка разбора AJAX ответа: ${e.message}`);
      }
    }).catch(() => {
      logger.warn(`[${profile.name}] AJAX-ответ создания темы не перехвачен`);
    });

    // Кликаем submit и ловим навигацию (Steam может перейти на тему или остаться)
    await Promise.all([
      page.waitForNavigation({ timeout: 25_000 }).catch(() => null),
      submitBtn.click(),
    ]);

    // Ждём завершения перехвата AJAX
    await responsePromise;

    // ── 6b. Ранняя проверка: если AJAX вернул ошибку — не искать тему ────
    if (ajaxCreateFailed && !ajaxTopicUrl) {
      // Проверим видимые ошибки на странице для деталей
      const visErr = await page.locator('.error_ctn, .forum_error, .DialogBody')
        .first().textContent({ timeout: 2000 }).catch(() => null);
      const detail = visErr && visErr.trim().length > 5 ? `: ${visErr.trim().slice(0, 200)}` : '';
      if (ajaxCreateFailed === 'RATE_LIMIT') {
        throw new Error(`RATE_LIMITED${detail}`);
      }
      throw new Error(`Steam не создал тему (AJAX-ответ без GID)${detail}`);
    }

    // ── 7. Дождаться URL новой темы ─────────────────────────────────────
    let topicUrl;
    const afterSubmitUrl = page.url();

    if (ajaxTopicUrl) {
      // Способ 1: URL из AJAX-ответа (прямой ответ сервера — самый надёжный)
      topicUrl = ajaxTopicUrl;
      logger.info(`[${profile.name}] Тема из AJAX: ${topicUrl}`);
      if (/\/\d{10,}\/?$/.test(afterSubmitUrl) && afterSubmitUrl !== ajaxTopicUrl) {
        logger.warn(`[${profile.name}] Redirect URL (${afterSubmitUrl}) отличается от AJAX — используем AJAX`);
      }
    } else if (/\/\d{10,}\/?$/.test(afterSubmitUrl)) {
      // Способ 2: Браузер редиректнул на URL с числовым ID
      topicUrl = afterSubmitUrl;
      logger.info(`[${profile.name}] Редирект на тему: ${topicUrl}`);
    } else {
      // Способ 3: Ждём отложенный JS-редирект
      logger.warn(`[${profile.name}] Нет редиректа (URL: ${afterSubmitUrl}). Ждём JS-редирект...`);
      try {
        await page.waitForURL(/\/\d{10,}\/?$/, { timeout: 10_000 });
        topicUrl = page.url();
        logger.info(`[${profile.name}] Отложенный редирект: ${topicUrl}`);
      } catch (_) {
        // Способ 4: Перезагружаем форум и ищем НОВУЮ тему (которой не было до отправки)
        logger.warn(`[${profile.name}] Редирект не произошёл. Ищу новую тему на форуме...`);

        // Проверяем ошибки Steam на странице
        const steamErr = await page.locator('.error_ctn, .forum_error, .DialogBody')
          .first().textContent().catch(() => null);
        if (steamErr && steamErr.trim().length > 10) {
          await screenshotOnError('post_error');
          throw new Error(`Steam отклонил публикацию: ${steamErr.trim().slice(0, 200)}`);
        }

        // Перезагружаем список форума
        const forumListUrl = targetUrl.replace(/\/\d{10,}\/?$/, '/');
        await page.goto(forumListUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await sleep(2000, 3000);

        // Ищем тему, ID которой НЕТ в existingTopicIds (т.е. она новая)
        const knownIds = existingTopicIds;
        const newTopicHref = await page.evaluate(known => {
          for (const a of document.querySelectorAll('a[href]')) {
            const m = a.href.match(/\/(\d{10,})\/?$/);
            if (m && !known.includes(m[1])) {
              return a.href;
            }
          }
          return null;
        }, knownIds);

        if (newTopicHref) {
          topicUrl = newTopicHref.startsWith('http') ? newTopicHref : `https://steamcommunity.com${newTopicHref}`;
          logger.info(`[${profile.name}] Новая тема найдена (fallback по ID): ${topicUrl}`);
        } else {
          await screenshotOnError('no_redirect');
          throw new Error(`Тема не создана — нет редиректа и новая тема не найдена. URL: ${afterSubmitUrl}`);
        }
      }
    }

    // ── 8. Валидация URL темы ──────────────────────────────────────────
    logger.info(`[${profile.name}] Валидация URL темы: ${topicUrl}`);
    try {
      // Переходим на найденный URL
      const curNorm = page.url().replace(/\/?#.*$/, '').replace(/\/?$/, '');
      const topNorm = topicUrl.replace(/\/?#.*$/, '').replace(/\/?$/, '');
      if (curNorm !== topNorm) {
        await page.goto(topicUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await sleep(1500, 2500);
      }

      // Проверяем: это страница темы (есть посты) или листинг форума?
      const hasPostContent = await page.locator('[id^="c_"], .commentthread_comment_content, .forum_op').first().count();
      if (hasPostContent === 0) {
        const isForumListing = await page.evaluate(() => {
          return !!document.querySelector('.forum_topics_container, .forum_paging, .forum_topic');
        });

        if (isForumListing) {
          logger.warn(`[${profile.name}] URL ведёт на раздел форума, а не на тему! Ищу новую тему по ID...`);

          // Перейдём на основную страницу форума и найдём новую тему по ID
          const forumListUrl = targetUrl.replace(/\/\d{10,}\/?$/, '/').replace(/\/+$/, '/');
          if (page.url().replace(/\/?$/, '/') !== forumListUrl) {
            await page.goto(forumListUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
            await sleep(2000, 3000);
          }

          const correctedHref = await page.evaluate(known => {
            for (const a of document.querySelectorAll('a[href]')) {
              const m = a.href.match(/\/(\d{10,})\/?$/);
              if (m && !known.includes(m[1])) return a.href;
            }
            return null;
          }, existingTopicIds);

          if (correctedHref) {
            topicUrl = correctedHref.startsWith('http') ? correctedHref : `https://steamcommunity.com${correctedHref}`;
            logger.info(`[${profile.name}] Тема найдена (валидация → fallback по ID): ${topicUrl}`);
            await page.goto(topicUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
            await sleep(1000, 2000);
          } else {
            logger.warn(`[${profile.name}] Не удалось найти новую тему после валидации`);
          }
        }
      }
    } catch (valErr) {
      logger.warn(`[${profile.name}] Ошибка валидации URL: ${valErr.message}`);
    }

    // ── 9. Проверка заголовка темы ──────────────────────────────────────
    try {
      const chkCur = page.url().replace(/\/?#.*$/, '').replace(/\/?$/, '');
      const chkTop = topicUrl.replace(/\/?#.*$/, '').replace(/\/?$/, '');
      if (chkCur !== chkTop) {
        await page.goto(topicUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await sleep(1500, 2500);
      }

      const titleMatch = await page.evaluate((expected) => {
        const norm = expected.trim();
        if (document.title.includes(norm)) return true;
        const els = document.querySelectorAll(
          '.topicTitle, .topic_title, .forum_op_topic_title, ' +
          '[class*="TopicTitle"], [class*="topic_title"], ' +
          '.forum_op h1, .forum_op h2, .topicsubject'
        );
        for (const el of els) {
          if (el.textContent.trim() === norm) return true;
        }
        return false;
      }, title);

      if (!titleMatch) {
        logger.warn(`[${profile.name}] Заголовок "${title.slice(0, 60)}" не найден на ${topicUrl}. Ищу правильную тему...`);

        const forumList = targetUrl.replace(/\/\d{10,}\/?$/, '/').replace(/\/+$/, '/');
        await page.goto(forumList, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await sleep(2000, 3000);

        const correctUrl = await page.evaluate((expected) => {
          const norm = expected.trim().toLowerCase();
          const prefix = norm.slice(0, 40);
          for (const a of document.querySelectorAll('a[href]')) {
            if (!/\/\d{10,}\/?$/.test(a.href)) continue;
            const t = a.textContent.trim().toLowerCase();
            if (t === norm || t.startsWith(prefix)) return a.href;
          }
          return null;
        }, title);

        if (correctUrl) {
          const fixed = correctUrl.startsWith('http') ? correctUrl : `https://steamcommunity.com${correctUrl}`;
          logger.info(`[${profile.name}] ✓ Правильная тема найдена по заголовку: ${fixed}`);
          topicUrl = fixed;
          await page.goto(topicUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          await sleep(1000, 2000);
        } else if (!ajaxTopicUrl && !/\/\d{10,}\/?$/.test(afterSubmitUrl)) {
          // URL получен через fallback (не AJAX и не redirect) и заголовок не подтверждён — скорее всего чужая тема
          throw new Error(`Не удалось подтвердить публикацию: тема "${title.slice(0, 60)}" не найдена на форуме`);
        } else {
          logger.warn(`[${profile.name}] Заголовок не подтверждён на форуме, но URL получен из AJAX/redirect — оставляем`);
        }
      } else {
        logger.info(`[${profile.name}] Заголовок темы подтверждён ✓`);
      }
    } catch (titleErr) {
      // Пробрасываем критические ошибки (не удалось подтвердить публикацию)
      if (titleErr.message.startsWith('Не удалось подтвердить')) throw titleErr;
      logger.warn(`[${profile.name}] Ошибка проверки заголовка: ${titleErr.message}`);
    }

    // ── 10. Найти якорь OP-поста ───────────────────────────────────────
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
