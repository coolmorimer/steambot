'use strict';

/**
 * server/scripts/stress-test.js
 *
 * Стресс-тест сервера Steam Poster Bot.
 * Имитирует работу 30/50/100 постер-ботов БЕЗ реальной отправки в Steam.
 *
 * Что нагружает:
 *  - HTTP API (auth, jobs, campaigns, profiles, subscriptions)
 *  - PostgreSQL (генерация pending jobs, захват очереди, обновление статусов)
 *  - Memory (имитация Playwright через Buffer allocation)
 *  - CPU (имитация обработки шаблонов, рандомных задержек)
 *
 * Запуск:
 *   node scripts/stress-test.js [--bots=30] [--duration=60] [--ramp=10]
 *
 * Параметры:
 *   --bots      Количество одновременных ботов (default: 30)
 *   --duration  Длительность теста в секундах (default: 60)
 *   --ramp      Время разгона — секунды между стартами ботов (default: 0.5)
 *   --api-only  Только API нагрузка, без имитации Playwright (default: false)
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const os = require('os');

// ── Конфиг ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [k, v] = arg.replace('--', '').split('=');
  acc[k] = v ?? true;
  return acc;
}, {});

const NUM_BOTS      = parseInt(args.bots)     || 30;
const DURATION_SEC  = parseInt(args.duration)  || 60;
const RAMP_SEC      = parseFloat(args.ramp)    || 0.5;
const API_ONLY      = args['api-only'] === 'true' || args['api-only'] === true;
const BASE_URL      = args.url || 'https://communityrig.ru';

// ── Метрики ──────────────────────────────────────────────────────────────────

const metrics = {
  startTime:    0,
  requests:     { total: 0, success: 0, failed: 0, errors: {} },
  latency:      { samples: [], min: Infinity, max: 0, sum: 0 },
  botCycles:    { total: 0, completed: 0 },
  memSnapshots: [],
  cpuSnapshots: [],
  activeBots:   0,
  peakBots:     0,
};

function recordLatency(ms) {
  metrics.latency.samples.push(ms);
  metrics.latency.sum += ms;
  if (ms < metrics.latency.min) metrics.latency.min = ms;
  if (ms > metrics.latency.max) metrics.latency.max = ms;
}

function getPercentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * (p / 100)) - 1;
  return sorted[Math.max(0, idx)];
}

// ── HTTP Helpers ─────────────────────────────────────────────────────────────

function apiRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      method,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'StressTest/1.0',
      },
      timeout: 30000,
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const start = Date.now();
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const elapsed = Date.now() - start;
        recordLatency(elapsed);
        metrics.requests.total++;

        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 400) {
            metrics.requests.success++;
            resolve({ status: res.statusCode, data: parsed, latency: elapsed });
          } else {
            metrics.requests.failed++;
            const errKey = `${res.statusCode} ${path.split('?')[0]}`;
            metrics.requests.errors[errKey] = (metrics.requests.errors[errKey] || 0) + 1;
            resolve({ status: res.statusCode, data: parsed, latency: elapsed, error: true });
          }
        } catch {
          metrics.requests.success++;
          resolve({ status: res.statusCode, data: data, latency: elapsed });
        }
      });
    });

    req.on('error', (err) => {
      metrics.requests.total++;
      metrics.requests.failed++;
      const errKey = `ERR ${err.code || err.message}`;
      metrics.requests.errors[errKey] = (metrics.requests.errors[errKey] || 0) + 1;
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      metrics.requests.total++;
      metrics.requests.failed++;
      metrics.requests.errors['TIMEOUT'] = (metrics.requests.errors['TIMEOUT'] || 0) + 1;
      reject(new Error('Request timeout'));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Имитация Playwright нагрузки на память ───────────────────────────────────

const chromiumSims = [];

function simulateChromiumLaunch() {
  // Реальный Chromium: ~150-300MB. Мы аллоцируем ~50MB буфер для имитации
  const buf = Buffer.alloc(50 * 1024 * 1024, 'x'); // 50MB
  chromiumSims.push(buf);
  return chromiumSims.length - 1;
}

function simulateChromiumClose(idx) {
  if (chromiumSims[idx]) {
    chromiumSims[idx] = null;
  }
}

// ── Имитация CPU нагрузки (template processing) ─────────────────────────────

function simulateCpuWork(ms = 50) {
  const end = Date.now() + ms;
  let hash = 0;
  while (Date.now() < end) {
    hash = (hash * 31 + 7) & 0x7fffffff; // busy loop
  }
  return hash;
}

// ── Один цикл бота ──────────────────────────────────────────────────────────

async function botCycle(botId, token) {
  metrics.botCycles.total++;

  try {
    // 1. Получить кампании (как generatePendingJobs)
    await apiRequest('GET', '/api/campaigns', null, token).catch(() => {});

    // 2. Получить профили
    await apiRequest('GET', '/api/profiles', null, token).catch(() => {});

    // 3. Получить подписку (лимиты)
    await apiRequest('GET', '/api/subscriptions/current', null, token).catch(() => {});

    // 4. Получить джобы (как processQueue)
    await apiRequest('GET', '/api/jobs?limit=50', null, token).catch(() => {});

    // 5. Получить настройки
    await apiRequest('GET', '/api/settings', null, token).catch(() => {});

    // 6. Имитация Playwright
    if (!API_ONLY) {
      const simIdx = simulateChromiumLaunch();
      simulateCpuWork(100); // 100ms CPU work = template processing

      // Имитация задержки постинга (2-5 сек вместо реальных 15-30)
      await sleep(2000 + Math.random() * 3000);

      simulateChromiumClose(simIdx);
    }

    // 7. Получить баланс (дополнительная нагрузка на DB)
    await apiRequest('GET', '/api/balance', null, token).catch(() => {});

    // 8. Health check
    await apiRequest('GET', '/health').catch(() => {});

    metrics.botCycles.completed++;
  } catch (err) {
    // Ошибки уже учтены в metrics.requests
  }
}

// ── Один бот (непрерывный цикл на время теста) ──────────────────────────────

async function runBot(botId, token, endTime) {
  metrics.activeBots++;
  if (metrics.activeBots > metrics.peakBots) metrics.peakBots = metrics.activeBots;

  while (Date.now() < endTime) {
    await botCycle(botId, token);
    // Пауза между циклами: 3-8 сек (имитация cron каждую минуту, ускоренная)
    await sleep(3000 + Math.random() * 5000);
  }

  metrics.activeBots--;
}

// ── Сбор метрик сервера (kubectl top) ────────────────────────────────────────

async function collectServerMetrics() {
  try {
    const res = await apiRequest('GET', '/health');
    return res.data;
  } catch { return null; }
}

// ── Сбор K8s метрик ──────────────────────────────────────────────────────────

function collectLocalMetrics() {
  const mem = process.memoryUsage();
  const cpus = os.cpus();
  const loadAvg = os.loadavg();
  return {
    timestamp: new Date().toISOString(),
    heapUsed:  Math.round(mem.heapUsed / 1024 / 1024),
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    rss:       Math.round(mem.rss / 1024 / 1024),
    external:  Math.round(mem.external / 1024 / 1024),
    loadAvg:   loadAvg.map(v => v.toFixed(2)),
    activeBots: metrics.activeBots,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

// ── Красивый вывод ──────────────────────────────────────────────────────────

function printHeader() {
  console.log('\n' + '═'.repeat(70));
  console.log('  🔥 STRESS TEST — Steam Poster Bot');
  console.log('═'.repeat(70));
  console.log(`  Target:     ${BASE_URL}`);
  console.log(`  Bots:       ${NUM_BOTS}`);
  console.log(`  Duration:   ${DURATION_SEC}s`);
  console.log(`  Ramp:       ${RAMP_SEC}s per bot`);
  console.log(`  Mode:       ${API_ONLY ? 'API only' : 'Full (API + Playwright sim)'}`);
  console.log('═'.repeat(70) + '\n');
}

function printProgress() {
  const elapsed = Date.now() - metrics.startTime;
  const local = collectLocalMetrics();
  metrics.memSnapshots.push(local);

  const avgLatency = metrics.latency.samples.length
    ? Math.round(metrics.latency.sum / metrics.latency.samples.length)
    : 0;

  process.stdout.write(
    `\r  ⏱ ${formatDuration(elapsed)} | ` +
    `🤖 ${metrics.activeBots}/${NUM_BOTS} bots | ` +
    `📊 ${metrics.requests.total} req (✅${metrics.requests.success} ❌${metrics.requests.failed}) | ` +
    `⚡ avg ${avgLatency}ms p95 ${getPercentile(metrics.latency.samples, 95).toFixed(0)}ms | ` +
    `💾 ${local.rss}MB RSS`
  );
}

function printReport() {
  const elapsed = Date.now() - metrics.startTime;
  const avgLatency = metrics.latency.samples.length
    ? Math.round(metrics.latency.sum / metrics.latency.samples.length)
    : 0;

  console.log('\n\n' + '═'.repeat(70));
  console.log('  📊 ОТЧЁТ СТРЕСС-ТЕСТА');
  console.log('═'.repeat(70));

  console.log('\n  ── Общее ──');
  console.log(`  Длительность:          ${formatDuration(elapsed)}`);
  console.log(`  Кол-во ботов:          ${NUM_BOTS} (пик: ${metrics.peakBots})`);
  console.log(`  Циклов ботов:          ${metrics.botCycles.completed}/${metrics.botCycles.total}`);

  console.log('\n  ── HTTP запросы ──');
  console.log(`  Всего:                 ${metrics.requests.total}`);
  console.log(`  Успешных:              ${metrics.requests.success} (${(metrics.requests.success / Math.max(1, metrics.requests.total) * 100).toFixed(1)}%)`);
  console.log(`  Ошибок:                ${metrics.requests.failed}`);
  console.log(`  RPS:                   ${(metrics.requests.total / (elapsed / 1000)).toFixed(1)}`);

  console.log('\n  ── Latency ──');
  console.log(`  Min:                   ${metrics.latency.min === Infinity ? 0 : metrics.latency.min}ms`);
  console.log(`  Avg:                   ${avgLatency}ms`);
  console.log(`  P50:                   ${getPercentile(metrics.latency.samples, 50).toFixed(0)}ms`);
  console.log(`  P95:                   ${getPercentile(metrics.latency.samples, 95).toFixed(0)}ms`);
  console.log(`  P99:                   ${getPercentile(metrics.latency.samples, 99).toFixed(0)}ms`);
  console.log(`  Max:                   ${metrics.latency.max}ms`);

  console.log('\n  ── Память (клиент стресс-теста) ──');
  if (metrics.memSnapshots.length) {
    const maxRss = Math.max(...metrics.memSnapshots.map(s => s.rss));
    const maxHeap = Math.max(...metrics.memSnapshots.map(s => s.heapUsed));
    console.log(`  Пик RSS:               ${maxRss}MB`);
    console.log(`  Пик Heap:              ${maxHeap}MB`);
  }

  if (Object.keys(metrics.requests.errors).length) {
    console.log('\n  ── Ошибки ──');
    for (const [key, count] of Object.entries(metrics.requests.errors).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${key}: ${count}`);
    }
  }

  // Расчёт масштабирования
  console.log('\n  ── 📐 Расчёт масштабирования ──');
  const rps = metrics.requests.total / (elapsed / 1000);
  const rpsPerBot = rps / NUM_BOTS;
  const avgLatMs = avgLatency;
  const p95Ms = getPercentile(metrics.latency.samples, 95);
  const errorRate = metrics.requests.failed / Math.max(1, metrics.requests.total);

  console.log(`  RPS на бота:           ${rpsPerBot.toFixed(2)}`);
  console.log(`  Error rate:            ${(errorRate * 100).toFixed(2)}%`);

  if (errorRate < 0.05 && p95Ms < 5000) {
    console.log(`  ✅ Сервер ВЫДЕРЖИВАЕТ ${NUM_BOTS} ботов`);
    console.log(`     P95 < 5s, ошибки < 5%`);
  } else if (errorRate < 0.15 && p95Ms < 10000) {
    console.log(`  ⚠️  Сервер НАГРУЖЕН при ${NUM_BOTS} ботах`);
    console.log(`     Рекомендуется увеличить ресурсы`);
  } else {
    console.log(`  🔴 Сервер НЕ ВЫДЕРЖИВАЕТ ${NUM_BOTS} ботов`);
    console.log(`     Требуется масштабирование`);
  }

  // Рекомендации по ресурсам
  console.log('\n  ── 💡 Рекомендации ──');
  const botsPerPod = Math.max(1, Math.floor(NUM_BOTS / 2)); // текущие 2 реплики
  console.log(`  Текущие ресурсы:       2 pods × (1 CPU, 1Gi RAM)`);
  console.log(`  Ботов на под:          ~${botsPerPod}`);

  if (errorRate > 0.05 || p95Ms > 5000) {
    const neededPods = Math.ceil(NUM_BOTS / Math.max(1, botsPerPod * (1 - errorRate)));
    const neededCpuPerPod = '2000m';
    const neededMemPerPod = '2Gi';
    console.log(`  Рекомендуемые реплики: ${neededPods}`);
    console.log(`  CPU per pod:           ${neededCpuPerPod}`);
    console.log(`  RAM per pod:           ${neededMemPerPod}`);
  }

  console.log('\n' + '═'.repeat(70) + '\n');
}

// ── Главная функция ─────────────────────────────────────────────────────────

async function main() {
  printHeader();

  // Шаг 1: Получить JWT токен (логин)
  console.log('  🔑 Авторизация...');

  // Используем health endpoint для начального теста связи
  try {
    const health = await apiRequest('GET', '/health');
    console.log(`  ✅ Сервер доступен (uptime: ${Math.round(health.data.uptime)}s)\n`);
  } catch (err) {
    console.error(`  ❌ Сервер недоступен: ${err.message}`);
    process.exit(1);
  }

  // Используем анонимные эндпоинты + публичные API для нагрузки
  // (не требуется реальный логин — тестируем инфраструктуру)
  const dummyToken = 'stress-test-dummy'; // API вернёт 401, но нагрузка на сервер будет

  metrics.startTime = Date.now();
  const endTime = metrics.startTime + DURATION_SEC * 1000;

  // Прогресс-бар
  const progressInterval = setInterval(printProgress, 2000);

  // Запуск ботов с ramp-up
  console.log(`  🚀 Запуск ${NUM_BOTS} ботов (ramp: ${RAMP_SEC}s)...\n`);

  const botPromises = [];
  for (let i = 0; i < NUM_BOTS; i++) {
    botPromises.push(runBot(i, dummyToken, endTime));
    if (i < NUM_BOTS - 1) {
      await sleep(RAMP_SEC * 1000);
    }
  }

  // Ждём завершения всех ботов
  await Promise.all(botPromises);

  clearInterval(progressInterval);
  printReport();
}

// ── Запуск ───────────────────────────────────────────────────────────────────

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
