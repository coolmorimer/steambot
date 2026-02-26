'use strict';

/**
 * server/services/SteamLoginManager.js
 *
 * Управляет сессиями входа Steam через Playwright (headless Chromium).
 *
 * Два режима:
 *   mode='qr'          — QR-код (скан мобильным приложением Steam)
 *   mode='credentials' — Логин/пароль + Steam Guard
 *
 * Статусы:
 *   starting → loading → waiting (qr) | waiting_credentials (creds)
 *   → checking_credentials → waiting_guard | waiting_mobile_confirm → done
 *   | expired | error | cancelled
 *
 * Страница входа: https://steamcommunity.com/login/home/
 * На этой странице НЕТ строки поиска — только форма логина.
 *
 * DOM-структура (steamcommunity.com/login/home/):
 *   Input 0: type=text,     class=_2GBWeup5cttgbTw8FM3tfx  (логин)     — visible
 *   Input 1: type=password, class=_2GBWeup5cttgbTw8FM3tfx  (пароль)    — visible
 *   Input 2: id=authcode                 (Guard email code)             — hidden
 *   Input 5: id=twofactorcode_entry      (Mobile 2FA code)             — hidden
 *   Button:  type=submit, text="Войти"   class=DjSvCZoKKfoNSmarsEcTS
 *   Оба поля внутри <form class="_2v60tM463fW0V7GDe92E5f">
 */

const { chromium } = require('playwright');
const crypto       = require('crypto');

let logger;
try { logger = require('../logger'); }
catch { logger = { info: console.log, warn: console.warn, error: console.error }; }

// ── Константы ────────────────────────────────────────────────────────────────

const STEAM_LOGIN_URL = 'https://steamcommunity.com/login/home/?goto=';
const SESSION_TTL_MS  = 5 * 60 * 1000;   // 5 минут
const REAL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/121.0.0.0 Safari/537.36';

const COOKIE_URLS = [
  'https://store.steampowered.com',
  'https://steamcommunity.com',
  'https://help.steampowered.com',
  'https://login.steampowered.com',
];

const sessions = new Map();

// ── Селекторы ────────────────────────────────────────────────────────────────

// QR-режим
const QR_BTN_SEL = [
  'button:has-text("QR")',
  'button:has-text("Use the Steam Mobile App")',
  'button:has-text("Sign in via QR")',
  '[class*="QrCode"]', '[class*="qr"]',
];

const QR_IMG_SEL = [
  'img[src^="data:image/png"]',
  'img[src^="data:image/svg"]',
  '[class*="QR"] img', '[class*="qr"] img',
  'canvas',
  'img[alt*="QR"]',
];

// Credentials-режим: Кнопки переключения на вкладку логин/пароль
const CREDENTIALS_TAB_SEL = [
  'button:has-text("Sign in with Account Name")',
  'button:has-text("Войти с помощью аккаунта")',
  'button:has-text("Войти с помощью имени")',
  'button:has-text("Use account name")',
  'a:has-text("Sign in with Account Name")',
  'a:has-text("Войти с помощью имени")',
  '[class*="ChangeSignIn"]',
  'button:has-text("account")',
  'button:has-text("аккаунт")',
];

// ── Вспомогательные функции ──────────────────────────────────────────────────

async function _tryClickQR(page) {
  for (const sel of QR_BTN_SEL) {
    try {
      await page.click(sel, { timeout: 1500 });
      logger.info('SteamLogin: QR button clicked', { sel });
      await page.waitForTimeout(1200);
      return true;
    } catch { /* next */ }
  }
  return false;
}

/**
 * Переключиться на вкладку «Логин/пароль» если видна QR-форма.
 */
async function _tryClickCredentialsTab(page) {
  // Проверяем наличие поля пароля (= форма уже на credentials)
  try {
    const pwdVisible = await page.locator('input[type="password"]').first()
      .isVisible({ timeout: 2000 }).catch(() => false);
    if (pwdVisible) {
      logger.info('SteamLogin: credentials form already visible');
      return true;
    }
  } catch { /* ignore */ }

  // Кликаем кнопки переключения
  for (const sel of CREDENTIALS_TAB_SEL) {
    try {
      await page.click(sel, { timeout: 1500 });
      logger.info('SteamLogin: credentials tab clicked', { sel });
      await page.waitForTimeout(1500);
      return true;
    } catch { /* next */ }
  }

  // Fallback: текстовый скан кнопок
  try {
    const buttons = page.locator('button');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const text = ((await btn.textContent().catch(() => '')) || '').toLowerCase().trim();
      if (text.includes('sign in') || text.includes('войти') || text.includes('account') || text.includes('имен')) {
        await btn.click({ timeout: 2000 });
        logger.info('SteamLogin: found credentials button by text', { text });
        await page.waitForTimeout(1500);
        return true;
      }
    }
  } catch { /* ignore */ }

  logger.warn('SteamLogin: could not find credentials tab');
  return false;
}

/**
 * Сделать debug-скриншот и сохранить в сессию.
 */
async function _takeDebugScreenshot(session) {
  try {
    const buf = await session.page.screenshot({ type: 'jpeg', quality: 40, timeout: 5000 });
    session._debugScreenshot = buf.toString('base64');
  } catch { /* page closed */ }
}

/**
 * Проверить steamLoginSecure cookie.
 */
async function _checkLoginCookie(context) {
  try {
    const ck = await context.cookies(COOKIE_URLS);
    return ck.find(c => c.name === 'steamLoginSecure' && c.value) || null;
  } catch {
    return null;
  }
}

async function _destroySession(session) {
  sessions.delete(session.sessionId);
  try { await session.browser.close(); } catch { /* ignore */ }
}

// ── Основной цикл сессии ────────────────────────────────────────────────────

async function _runSession(session) {
  const { page, context, sessionId, mode } = session;
  try {
    session.status = 'loading';

    // Навигация на страницу логина
    await page.goto(STEAM_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForTimeout(2500);

    const afterUrl = page.url();
    logger.info('SteamLogin: page loaded', { sessionId, url: afterUrl });

    // Если Steam редиректнул — пробуем ещё раз
    if (!afterUrl.includes('/login')) {
      logger.warn('SteamLogin: redirected, retrying', { sessionId, url: afterUrl });
      await page.goto(STEAM_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(3000);
    }

    if (mode === 'qr') {
      await _tryClickQR(page);
      session.status = 'waiting';
    } else {
      session.status = 'waiting_credentials';
    }

    // ── Ожидание авторизации ─────────────────────────────────────
    // Единственный критерий: cookie steamLoginSecure
    const deadline = Date.now() + SESSION_TTL_MS;
    let lastLoggedUrl    = '';
    let lastScreenshot   = 0;
    let lastCookieLog    = 0;

    while (Date.now() < deadline) {
      if (['cancelled', 'expired'].includes(session.status)) return;

      try {
        const now = Date.now();

        // Debug screenshot каждые 5 сек
        if (now - lastScreenshot > 5000) {
          lastScreenshot = now;
          await _takeDebugScreenshot(session);
        }

        // Log cookies каждые 10 сек
        if (now - lastCookieLog > 10_000) {
          lastCookieLog = now;
          try {
            const allCk = await context.cookies(COOKIE_URLS);
            const names = allCk.map(c => `${c.name}@${c.domain}`).join(', ');
            logger.info('SteamLogin: cookies', { sessionId, count: allCk.length, names });
          } catch { /* ignore */ }
        }

        // Cookie check
        const loginCookie = await _checkLoginCookie(context);
        if (loginCookie) {
          logger.info('SteamLogin: steamLoginSecure found!', { sessionId, domain: loginCookie.domain });
          break;
        }

        // URL change log
        const curUrl = page.url();
        if (curUrl !== lastLoggedUrl) {
          lastLoggedUrl = curUrl;
          logger.info('SteamLogin: page at', { sessionId, url: curUrl });
        }
      } catch { /* browser closed */ break; }

      await page.waitForTimeout(1500);
    }

    // ── Финальная проверка ────────────────────────────────────────
    let loginCookie = await _checkLoginCookie(context);

    // Если cookie нет, пробуем перейти на store (может установит cookie)
    if (!loginCookie) {
      try {
        await page.goto('https://store.steampowered.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForTimeout(2000);
      } catch { /* ignore */ }
      loginCookie = await _checkLoginCookie(context);
    }

    if (!loginCookie) {
      if (!['cancelled', 'expired'].includes(session.status)) {
        session.status = 'expired';
      }
      return;
    }

    // Успех!
    await page.waitForTimeout(1500);
    session.cookies = await context.cookies(COOKIE_URLS).catch(() => []);
    session.status  = 'done';
    logger.info('SteamLogin: done!', { sessionId, userId: session.userId });

  } catch (err) {
    if (!['cancelled', 'expired'].includes(session.status)) {
      logger.error('SteamLogin: error', { sessionId, err: err.message });
      session.status = 'error';
      session.error  = err.message;
    }
  }
  setTimeout(() => _destroySession(session), 30_000);
}

// ── Публичный API ─────────────────────────────────────────────────────────────

async function startSession(userId, name, targetUrl = null, mode = 'qr') {
  const sessionId = crypto.randomUUID();

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const context = await browser.newContext({
    userAgent:  REAL_UA,
    viewport:   { width: 1280, height: 860 },
    locale:     'ru-RU',
    timezoneId: 'Europe/Moscow',
  });

  context.setDefaultTimeout(30_000);
  context.setDefaultNavigationTimeout(SESSION_TTL_MS);

  const page = await context.newPage();

  const session = {
    sessionId, browser, context, page,
    status: 'starting', mode,
    userId, name, targetUrl,
    cookies: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    error: null, _savedProfileId: null,
    _debugScreenshot: null,
  };

  sessions.set(sessionId, session);

  // Авто-экспирация
  setTimeout(() => {
    const s = sessions.get(sessionId);
    if (s && !['done', 'cancelled'].includes(s.status)) {
      s.status = 'expired';
      _destroySession(s);
    }
  }, SESSION_TTL_MS);

  _runSession(session).catch(err =>
    logger.error('SteamLogin: unhandled', { err: err.message }),
  );

  return sessionId;
}

/**
 * Скриншот QR-элемента (png base64).
 */
async function getQRCode(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (['done', 'expired', 'error', 'cancelled'].includes(session.status)) return null;

  const { page } = session;

  for (const sel of QR_IMG_SEL) {
    try {
      const loc = page.locator(sel).first();
      const visible = await loc.isVisible({ timeout: 800 }).catch(() => false);
      if (!visible) continue;

      const bb = await loc.boundingBox();
      if (!bb || bb.width < 60 || bb.width > 500 || Math.abs(bb.width - bb.height) > bb.width * 0.3) continue;

      const pad = 14;
      const buf = await page.screenshot({
        type: 'png',
        clip: {
          x: Math.max(0, bb.x - pad),
          y: Math.max(0, bb.y - pad),
          width:  bb.width  + pad * 2,
          height: bb.height + pad * 2,
        },
      });
      return buf.toString('base64');
    } catch { /* next */ }
  }

  // Fallback: правая треть страницы
  try {
    const vp = page.viewportSize();
    if (vp) {
      const buf = await page.screenshot({
        type: 'png',
        clip: { x: vp.width * 0.52, y: vp.height * 0.25, width: vp.width * 0.42, height: vp.height * 0.55 },
      });
      return buf.toString('base64');
    }
  } catch { /* ignore */ }

  return null;
}

/** Полный скриншот страницы */
async function getScreenshot(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (['done', 'expired', 'error', 'cancelled'].includes(session.status)) {
    return session._debugScreenshot || null;
  }
  try {
    const buf = await session.page.screenshot({ type: 'jpeg', quality: 82 });
    return buf.toString('base64');
  } catch {
    return session._debugScreenshot || null;
  }
}

function getStatus(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return { status: 'not_found' };
  return {
    status:    session.status,
    mode:      session.mode,
    userId:    session.userId,
    name:      session.name,
    cookies:   session.status === 'done' ? session.cookies : undefined,
    targetUrl: session.targetUrl,
    expiresAt: session.expiresAt,
    error:     session.error || undefined,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// fillCredentials — ЛОГИН / ПАРОЛЬ
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Заполнить логин/пароль и отправить.
 *
 * Стратегия:
 *   1. Переключить на вкладку credentials (если QR)
 *   2. Найти поле пароля (input[type=password]) — уникальный маркер
 *   3. Через DOM-анализ: найти input[type=text] внутри того же <form>
 *   4. Заполнить, отправить
 *   5. Подождать 15 сек: cookie / Guard / mobile auth / ошибка
 *   6. НЕ блокировать навигацию — cookie polling в _runSession поймает результат
 */
async function fillCredentials(sessionId, username, password) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error('Сессия не найдена');

  if (['done', 'expired', 'cancelled'].includes(session.status)) {
    throw new Error(`Сессия завершена (${session.status})`);
  }
  if (session.status === 'error') {
    session.status = 'waiting_credentials';
    session.error  = null;
  }

  const { page, context } = session;
  const OP = 10_000;

  try {
    logger.info('SteamLogin: fillCredentials start', { sessionId, url: page.url() });

    // ── 1. Убедиться что мы на странице логина ──────────────────
    if (!page.url().includes('/login')) {
      logger.warn('SteamLogin: not on login page, navigating', { sessionId });
      await page.goto(STEAM_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(3000);
    }

    // ── 2. Переключить на credentials-табу ──────────────────────
    await _tryClickCredentialsTab(page);

    // ── 3. Дождаться поля пароля ────────────────────────────────
    const passwordLoc = page.locator('input[type="password"]').first();
    await passwordLoc.waitFor({ state: 'visible', timeout: 30_000 });
    logger.info('SteamLogin: password field visible', { sessionId });

    // ── 4. Найти поле логина через DOM (рядом с паролем) ────────
    //    steamcommunity.com/login: оба поля в одном <form>,
    //    нет строки поиска — input[type=text] единственный видимый.
    const usernameHandle = await page.evaluateHandle(() => {
      const pwd = document.querySelector('input[type="password"]');
      if (!pwd) return null;

      // Стратегия A: ближайший <form>, внутри — input[type=text]
      const form = pwd.closest('form');
      if (form) {
        const el = form.querySelector('input[type="text"]');
        if (el) return el;
      }

      // Стратегия B: тот же CSS-класс что у пароля
      const cls = pwd.className ? pwd.className.split(' ')[0] : '';
      if (cls) {
        const all = document.querySelectorAll('input[type="text"].' + CSS.escape(cls));
        if (all.length) return all[0];
      }

      // Стратегия C: первый видимый text-input (кроме скрытых и поиска)
      const inputs = document.querySelectorAll('input[type="text"]:not([name="term"]):not([type="hidden"])');
      for (const inp of inputs) {
        if (inp.offsetParent !== null) return inp;
      }
      return null;
    });

    const usernameEl = usernameHandle.asElement();
    if (!usernameEl) {
      await _takeDebugScreenshot(session);
      throw new Error('Не удалось найти поле логина');
    }
    logger.info('SteamLogin: username field found via DOM', { sessionId });

    // ── 5. Заполнить логин ──────────────────────────────────────
    await usernameEl.click({ force: true, timeout: OP });
    await usernameEl.fill('', { force: true, timeout: OP });
    await usernameEl.fill(username, { force: true, timeout: OP });
    logger.info('SteamLogin: username filled', { sessionId });

    // ── 6. Заполнить пароль ─────────────────────────────────────
    await passwordLoc.click({ force: true, timeout: OP });
    await passwordLoc.fill(password, { force: true, timeout: OP });
    logger.info('SteamLogin: password filled', { sessionId });

    // ── 7. Скриншот перед отправкой (для диагностики) ────────────
    await _takeDebugScreenshot(session);

    // ── 8. Отправить форму ──────────────────────────────────────
    const submitBtn = page.locator('button[type="submit"], button:has-text("Войти"), button:has-text("Sign in")').first();
    await submitBtn.click({ force: true, timeout: OP });
    session.status = 'checking_credentials';
    logger.info('SteamLogin: form submitted', { sessionId });

    // ── 9. Ждём реакции Steam (15 сек) ──────────────────────────
    //    Не блокируем навигацию! Пусть Steam делает что хочет.
    //    Cookie polling в _runSession подберёт steamLoginSecure.
    let result = 'unknown';
    const checkEnd = Date.now() + 15_000;

    while (Date.now() < checkEnd) {
      await page.waitForTimeout(600);

      // Скриншот для UI
      await _takeDebugScreenshot(session);

      // Cookie уже есть → логин мгновенный
      const cookie = await _checkLoginCookie(context);
      if (cookie) {
        logger.info('SteamLogin: instant login (cookie found)', { sessionId });
        return { needsGuard: false };
      }

      // Guard — видимые элементы (надёжный способ)
      // Guard email (id=authcode)
      try {
        const guardVis = await page.locator('#authcode').isVisible({ timeout: 800 }).catch(() => false);
        if (guardVis) { result = 'guard'; logger.info('SteamLogin: #authcode visible', { sessionId }); break; }
      } catch { /* ignore */ }

      // Guard 2FA (id=twofactorcode_entry)
      try {
        const tfVis = await page.locator('#twofactorcode_entry').isVisible({ timeout: 800 }).catch(() => false);
        if (tfVis) { result = 'guard'; logger.info('SteamLogin: #twofactorcode_entry visible', { sessionId }); break; }
      } catch { /* ignore */ }

      // Общий guard-селектор (на случай если id сменится)
      try {
        const guardSel = 'input[maxlength="5"], input[maxlength="6"], input[autocomplete="one-time-code"]';
        const gVis = await page.locator(guardSel).first().isVisible({ timeout: 600 }).catch(() => false);
        if (gVis) { result = 'guard'; logger.info('SteamLogin: guard input (maxlength) visible', { sessionId }); break; }
      } catch { /* ignore */ }

      // Текстовая детекция — сначала MOBILE, потом guard
      // textContent('body') включает текст из СКРЫТЫХ элементов,
      // поэтому "введите код здесь" (placeholder hidden inputs) нельзя использовать.
      try {
        const bodyText = await page.textContent('body', { timeout: 1000 }).catch(() => '');

        // Mobile auth — проверяем ПЕРВЫМ (приоритет)
        if (/мобильн(ое|ый) приложение|мобильн(ый|ого) аутентификатор|steam mobile app|confirm.*sign.?in|check your phone/i.test(bodyText)) {
          result = 'mobile';
          logger.info('SteamLogin: mobile detected by text', { sessionId });
          break;
        }

        // Guard email — только уникальные маркеры email guard
        // (без "введите код здесь" — он в скрытых placeholder'ах всегда!)
        if (/электронн(ой|ый|ую) почт|email.*code|код.*полученный.*адрес|аутентификатор.*почт|guard.*code/i.test(bodyText)) {
          result = 'guard';
          logger.info('SteamLogin: guard detected by text', { sessionId });
          break;
        }
      } catch { /* ignore */ }

      // Ошибка входа
      try {
        const errSel = '[class*="FormError"], [class*="Error" i], .error_ctn, [data-error]';
        const errEl = page.locator(errSel).first();
        const errVis = await errEl.isVisible({ timeout: 300 }).catch(() => false);
        if (errVis) {
          const txt = (await errEl.textContent({ timeout: 1000 }).catch(() => ''))?.trim();
          if (txt && txt.length > 2) {
            session.status = 'error';
            session.error  = txt;
            throw new Error(txt);
          }
        }
      } catch (e) {
        if (e.message && !e.message.includes('Timeout')) throw e;
      }

      // Страница ушла с /login → credentials приняты
      // Проверяем guard на новой странице перед тем как считать mobile
      if (!page.url().includes('/login')) {
        logger.info('SteamLogin: navigated away from login', { sessionId, url: page.url() });
        // Может быть guard-страница (email code)
        try {
          const guardVis = await page.locator('#authcode').isVisible({ timeout: 1000 }).catch(() => false);
          if (guardVis) { result = 'guard'; break; }
        } catch { /* ignore */ }
        try {
          const tfVis = await page.locator('#twofactorcode_entry').isVisible({ timeout: 800 }).catch(() => false);
          if (tfVis) { result = 'guard'; break; }
        } catch { /* ignore */ }
        try {
          const bodyText = await page.textContent('body', { timeout: 1000 }).catch(() => '');
          if (/электронн(ой|ый|ую) почт|email.*code|аутентификатор.*почт|введите.*код/i.test(bodyText)) {
            result = 'guard';
            break;
          }
        } catch { /* ignore */ }
        result = 'mobile';
        break;
      }
    }

    // ── 10. Обработка результата ─────────────────────────────────
    switch (result) {
      case 'guard':
        session.status = 'waiting_guard';
        logger.info('SteamLogin: guard code required', { sessionId });
        return { needsGuard: true };

      case 'mobile':
        session.status = 'waiting_mobile_confirm';
        logger.info('SteamLogin: mobile confirm required', { sessionId });
        return { needsMobileConfirm: true };

      default:
        // Ни guard, ни mobile, ни cookie за 15 сек.
        // Предполагаем mobile auth — _runSession продолжит polling.
        session.status = 'waiting_mobile_confirm';
        logger.info('SteamLogin: no clear signal, assuming mobile auth', { sessionId });
        return { needsMobileConfirm: true };
    }

  } catch (err) {
    await _takeDebugScreenshot(session);
    logger.error('SteamLogin: fillCredentials error', { sessionId, err: err.message, url: page.url() });

    if (!['done', 'expired', 'cancelled', 'error'].includes(session.status)) {
      session.status = 'waiting_credentials';
    }
    throw err;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// fillGuardCode — Steam Guard / 2FA
// ──────────────────────────────────────────────────────────────────────────────

async function fillGuardCode(sessionId, code) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error('Сессия не найдена');

  const { page } = session;
  const OP = 10_000;

  try {
    // Пробуем конкретные ID + общие селекторы
    const guardSelectors = [
      '#twofactorcode_entry',
      '#authcode',
      'input[maxlength="5"]',
      'input[maxlength="6"]',
      'input[autocomplete="one-time-code"]',
      '[class*="twofactor" i] input',
      '[class*="guard" i] input',
      '[class*="authcode" i] input',
      'input[type="tel"]',
    ];

    let guardInput = null;
    for (const sel of guardSelectors) {
      try {
        const loc = page.locator(sel).first();
        const vis = await loc.isVisible({ timeout: 1500 }).catch(() => false);
        if (vis) {
          guardInput = loc;
          logger.info('SteamLogin: guard input found', { sessionId, sel });
          break;
        }
      } catch { /* next */ }
    }

    if (!guardInput) {
      await _takeDebugScreenshot(session);
      throw new Error('Не найдено поле для ввода кода Guard');
    }

    // Заполняем код
    await guardInput.click({ force: true, timeout: OP });
    await guardInput.fill('', { force: true, timeout: OP });
    await guardInput.fill(code.trim(), { force: true, timeout: OP });
    logger.info('SteamLogin: guard code filled', { sessionId });

    await page.waitForTimeout(500);

    // Отправить
    const submitBtn = page.locator('button[type="submit"], button:has-text("Войти"), button:has-text("Sign in"), button:has-text("Submit"), button:has-text("Подтвердить")').first();
    const submitVis = await submitBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (submitVis) {
      await submitBtn.click({ force: true, timeout: OP });
    } else {
      await page.keyboard.press('Enter');
    }

    session.status = 'checking_guard';
    logger.info('SteamLogin: guard code submitted', { sessionId });

  } catch (err) {
    await _takeDebugScreenshot(session);
    logger.error('SteamLogin: fillGuardCode error', { sessionId, err: err.message });
    if (!['done', 'expired', 'cancelled'].includes(session.status)) {
      session.status = 'waiting_guard';
    }
    throw err;
  }
}

// ── Управление сессиями ──────────────────────────────────────────────────────

async function cancelSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.status = 'cancelled';
  await _destroySession(session);
}

function activeSessions() { return sessions.size; }

function markSaved(sessionId, profileId) {
  const s = sessions.get(sessionId);
  if (s) s._savedProfileId = profileId;
}

function getSavedProfileId(sessionId) {
  return sessions.get(sessionId)?._savedProfileId;
}

function getDebugScreenshot(sessionId) {
  return sessions.get(sessionId)?._debugScreenshot || null;
}

module.exports = {
  startSession, getQRCode, getScreenshot, getStatus,
  fillCredentials, fillGuardCode,
  cancelSession, activeSessions, markSaved, getSavedProfileId,
  getDebugScreenshot,
};
