'use strict';

/**
 * ngrok.js — автоматический запуск ngrok-туннеля.
 *
 * Запускает ngrok как дочерний процесс, ожидает готовности,
 * получает публичный HTTPS URL через API localhost:4040.
 * Не требует npm-пакета — использует глобально установленный ngrok.
 */

const { spawn }    = require('child_process');
const http         = require('http');
const logger       = require('./logger');

let ngrokProc = null;
let publicUrl = null;

/**
 * Запустить ngrok-туннель на указанный порт.
 * @param {number} port — локальный порт (по умолчанию 3388)
 * @returns {Promise<string|null>} публичный HTTPS URL или null при ошибке
 */
async function start(port = 3388) {
  await stop();

  return new Promise((resolve) => {
    try {
      // Ищем ngrok в PATH
      const cmd = process.platform === 'win32' ? 'ngrok.exe' : 'ngrok';
      ngrokProc = spawn(cmd, ['http', String(port), '--log', 'stdout', '--log-format', 'json'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
      });

      let resolved = false;

      ngrokProc.on('error', (err) => {
        logger.warn(`[ngrok] Не удалось запустить: ${err.message}`);
        ngrokProc = null;
        if (!resolved) { resolved = true; resolve(null); }
      });

      ngrokProc.on('close', (code) => {
        if (code !== null && code !== 0) {
          logger.warn(`[ngrok] Завершился с кодом ${code}`);
        }
        ngrokProc = null;
        publicUrl = null;
        if (!resolved) { resolved = true; resolve(null); }
      });

      // Ждём готовности и получаем URL через API
      // ngrok нужно время на старт — пробуем несколько раз
      let attempts = 0;
      const maxAttempts = 20; // 20 × 500ms = 10 сек максимум
      const interval = setInterval(async () => {
        attempts++;
        try {
          const url = await fetchTunnelUrl();
          if (url) {
            clearInterval(interval);
            publicUrl = url;
            logger.info(`[ngrok] Туннель готов: ${url}`);
            if (!resolved) { resolved = true; resolve(url); }
          } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            logger.warn('[ngrok] Не удалось получить URL за 10 сек');
            if (!resolved) { resolved = true; resolve(null); }
          }
        } catch {
          if (attempts >= maxAttempts) {
            clearInterval(interval);
            logger.warn('[ngrok] Таймаут ожидания API');
            if (!resolved) { resolved = true; resolve(null); }
          }
        }
      }, 500);

    } catch (err) {
      logger.warn(`[ngrok] Ошибка запуска: ${err.message}`);
      resolve(null);
    }
  });
}

/**
 * Остановить ngrok.
 */
async function stop() {
  publicUrl = null;
  if (ngrokProc) {
    try {
      ngrokProc.kill();
    } catch { /* ignore */ }
    ngrokProc = null;
    logger.info('[ngrok] Остановлен');
  }
}

/**
 * Текущий публичный URL (или null).
 */
function getUrl() {
  return publicUrl;
}

/**
 * Проверить, запущен ли ngrok.
 */
function isRunning() {
  return ngrokProc !== null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Внутренние функции
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Получить HTTPS туннель из ngrok API (localhost:4040).
 */
function fetchTunnelUrl() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const tunnel = (json.tunnels || []).find(
            t => t.proto === 'https' || (t.public_url && t.public_url.startsWith('https'))
          );
          resolve(tunnel ? tunnel.public_url : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => reject(new Error('ngrok API недоступен')));
    req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

module.exports = { start, stop, getUrl, isRunning };
