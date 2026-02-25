'use strict';

/**
 * server/services/SteamLoginManager.js
 *
 * Управляет сессиями входа Steam для веб-дашборда.
 *
 * Два режима:
 *   mode='qr'          — QR-код (скан мобильным приложением Steam)
 *   mode='credentials' — Логин/пароль + Steam Guard
 *
 * Статусы:
 *   starting → loading → waiting (qr) | waiting_credentials (creds)
 *   → checking_credentials → waiting_guard → checking_guard → done
 *   | expired | error | cancelled
 */

const { chromium } = require('playwright');
const crypto       = require('crypto');

let logger;
try { logger = require('../logger'); }
catch { logger = { info: console.log, warn: console.warn, error: console.error }; }

// ── Константы ────────────────────────────────────────────────────────────────

const STEAM_LOGIN_URL = 'https://store.steampowered.com/login/?redir=&redir_ssl=1';
const SESSION_TTL_MS  = 5 * 60 * 1000;
const REAL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/121.0.0.0 Safari/537.36';

const sessions = new Map();

// ── Селекторы ────────────────────────────────────────────────────────────────

const QR_BTN_SEL = [
  'button.qr_sign_in', '[class*="QrCode"]', '[data-testid*="qr"]',
  'button:has-text("QR")', 'button:has-text("Use the Steam Mobile App")',
  'button:has-text("Sign in via QR")', '.QRSignInButton', '[class*="qr"]',
];

const QR_IMG_SEL = [
  // inline data-URI (часто QR рендерится как data:image/png)
  'img[src^="data:image/png"]',
  'img[src^="data:image/svg"]',
  // Классы React SPA
  '[class*="QR"] img', '[class*="qr"] img',
  '[class*="QRCode"] img',
  // Canvas (некоторые реализации QR)
  'canvas',
  // Атрибуты alt
  'img[alt*="QR"]', 'img[alt*="qr"]',
];

const USERNAME_SEL  = 'input[type="text"]:not([type="hidden"]), input[autocomplete="username"], #input_username';
const PASSWORD_SEL  = 'input[type="password"], input[autocomplete="current-password"], #input_password';
const SUBMIT_SEL    = 'button[type="submit"], button:has-text("Войти"), button:has-text("Sign in"), .btn_blue_steamui';
const GUARD_SEL     = 'input[maxlength="5"], input[maxlength="6"], input[autocomplete="one-time-code"], [class*="twofactor" i] input, [class*="guard" i] input';

// ── Внутренние функции ───────────────────────────────────────────────────────

async function _tryClickQR(page) {
  for (const sel of QR_BTN_SEL) {
    try {
      await page.click(sel, { timeout: 1500 });
      logger.info('SteamLoginManager: QR button clicked', { sel });
      await page.waitForTimeout(1200);
      return true;
    } catch { /* next */ }
  }
  return false;
}

async function _destroySession(session) {
  sessions.delete(session.sessionId);
  try { await session.browser.close(); } catch { /* ignore */ }
}

async function _runSession(session) {
  const { page, context, sessionId, mode } = session;
  try {
    session.status = 'loading';

    await page.goto(STEAM_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForTimeout(2500);

    if (mode === 'qr') {
      await _tryClickQR(page);
      session.status = 'waiting';
    } else {
      session.status = 'waiting_credentials';
    }

    // Ждём выхода со страницы входа (работает для обоих режимов)
    await page.waitForFunction(
      () => {
        const h = window.location.href;
        return (
          !h.includes('store.steampowered.com/login') &&
          !h.includes('steamcommunity.com/login') &&
          (h.includes('steampowered.com') || h.includes('steamcommunity.com'))
        );
      },
      { timeout: SESSION_TTL_MS },
    );

    await page.waitForTimeout(2000);
    session.cookies = await context.cookies();
    session.status  = 'done';

    logger.info('SteamLoginManager: login done', { sessionId, userId: session.userId });
  } catch (err) {
    if (!['cancelled', 'expired'].includes(session.status)) {
      logger.error('SteamLoginManager: error', { sessionId, err: err.message });
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

  const page = await context.newPage();

  const session = {
    sessionId, browser, context, page,
    status: 'starting', mode,
    userId, name, targetUrl,
    cookies: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    error: null, _savedProfileId: null,
  };

  sessions.set(sessionId, session);

  setTimeout(() => {
    const s = sessions.get(sessionId);
    if (s && !['done', 'cancelled'].includes(s.status)) {
      s.status = 'expired';
      _destroySession(s);
    }
  }, SESSION_TTL_MS);

  _runSession(session).catch(err =>
    logger.error('SteamLoginManager: unhandled', { err: err.message }),
  );

  return sessionId;
}

/**
 * Скриншот только QR-элемента (png base64).
 * Пробует найти элемент по селекторам; если не нашёл — обрезает правую
 * часть страницы, где Steam обычно показывает QR.
 */
async function getQRCode(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (['done', 'expired', 'error', 'cancelled'].includes(session.status)) return null;

  const { page } = session;

  // Пробуем найти конкретный QR-элемент
  for (const sel of QR_IMG_SEL) {
    try {
      const loc = page.locator(sel).first();
      const visible = await loc.isVisible({ timeout: 800 }).catch(() => false);
      if (!visible) continue;

      const bb = await loc.boundingBox();
      // QR-код — квадратный, обычно 80–400 пикселей
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
    } catch { /* next selector */ }
  }

  // Fallback: правая треть страницы (там QR у Steam)
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

/** Полный скриншот страницы (jpeg base64). */
async function getScreenshot(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (['done', 'expired', 'error', 'cancelled'].includes(session.status)) return null;
  try {
    const buf = await session.page.screenshot({ type: 'jpeg', quality: 82 });
    return buf.toString('base64');
  } catch { return null; }
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

/**
 * Заполнить форму входа (режим credentials).
 * @returns {{ needsGuard: boolean }}
 */
async function fillCredentials(sessionId, username, password) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error('Сессия не найдена');

  const activeStatuses = ['waiting_credentials', 'loading', 'waiting', 'starting'];
  if (!activeStatuses.includes(session.status)) {
    throw new Error(`Нельзя заполнить форму — статус: ${session.status}`);
  }

  const { page } = session;

  try {
    // Ждём поле логина (страница ещё может грузиться)
    const usernameInput = page.locator(USERNAME_SEL).first();
    await usernameInput.waitFor({ state: 'visible', timeout: 15_000 });
    await usernameInput.click();
    await page.waitForTimeout(200);
    await usernameInput.fill(username);
    await page.waitForTimeout(400);

    const passwordInput = page.locator(PASSWORD_SEL).first();
    await passwordInput.waitFor({ state: 'visible', timeout: 5_000 });
    await passwordInput.click();
    await page.waitForTimeout(200);
    await passwordInput.fill(password);
    await page.waitForTimeout(400);

    // Отправляем форму
    const submitBtn = page.locator(SUBMIT_SEL).first();
    await submitBtn.click({ timeout: 5_000 });
    session.status = 'checking_credentials';

    // Ждём реакции страницы
    await page.waitForTimeout(2800);

    // Если уже ушли со страницы входа — _runSession поймает
    const url = page.url();
    if (!url.includes('/login')) return { needsGuard: false };

    // Проверяем — нужен ли Steam Guard
    const guardInput = page.locator(GUARD_SEL).first();
    const guardVisible = await guardInput.isVisible({ timeout: 1500 }).catch(() => false);
    if (guardVisible) {
      session.status = 'waiting_guard';
      return { needsGuard: true };
    }

    // Проверяем ошибку
    const errEl = page.locator('[class*="error" i], .error_ctn, [data-error]').first();
    const errVisible = await errEl.isVisible({ timeout: 800 }).catch(() => false);
    if (errVisible) {
      const txt = (await errEl.textContent({ timeout: 800 }).catch(() => ''))?.trim();
      const msg = txt || 'Неверный логин или пароль';
      session.status = 'error';
      session.error  = msg;
      throw new Error(msg);
    }

    return { needsGuard: false };
  } catch (err) {
    if (!['done', 'expired', 'cancelled'].includes(session.status)) {
      session.status = 'error';
      session.error  = err.message;
    }
    throw err;
  }
}

/**
 * Ввести Steam Guard / Mobile Authenticator код.
 */
async function fillGuardCode(sessionId, code) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error('Сессия не найдена');

  const { page } = session;
  try {
    const guardInput = page.locator(GUARD_SEL).first();
    await guardInput.waitFor({ state: 'visible', timeout: 8_000 });
    await guardInput.fill(code.trim());
    await page.waitForTimeout(300);

    // Отправить — кнопка или Enter
    const submitBtn = page.locator(SUBMIT_SEL).first();
    const submitVisible = await submitBtn.isVisible({ timeout: 800 }).catch(() => false);
    if (submitVisible) {
      await submitBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }
    session.status = 'checking_guard';
  } catch (err) {
    session.status = 'error';
    session.error  = err.message;
    throw err;
  }
}

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

module.exports = {
  startSession, getQRCode, getScreenshot, getStatus,
  fillCredentials, fillGuardCode,
  cancelSession, activeSessions, markSaved, getSavedProfileId,
};
