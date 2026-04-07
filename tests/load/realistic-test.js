import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

/*  ═══════════════════════════════════════════════════════════════
    ТЕСТ РЕАЛЬНОЙ НАГРУЗКИ: имтиация реальных пользователей
    ═══════════════════════════════════════════════════════════════
    Рампа: 10 → 25 → 50 → 25 → 0 пользователей
    Каждый VU — реальный сценарий: зашёл, подождал, кликнул,
    посмотрел страницы, подождал, ушёл. Think-time 2-8 сек.
*/

const BASE = __ENV.BASE_URL || 'https://communityrig.ru';

const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration', true);
const pageLoads = new Counter('page_loads');

export const options = {
  stages: [
    { duration: '1m',  target: 10 },   // утренние ранние пользователи
    { duration: '2m',  target: 10 },   // hold
    { duration: '1m',  target: 25 },   // обед — рост
    { duration: '3m',  target: 25 },   // hold
    { duration: '1m',  target: 50 },   // пик
    { duration: '3m',  target: 50 },   // hold
    { duration: '1m',  target: 75 },   // максимум
    { duration: '2m',  target: 75 },   // hold
    { duration: '1m',  target: 25 },   // уход
    { duration: '1m',  target: 0 },    // спад
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],   // p95 < 2s
    errors:            ['rate<0.05'],     // ошибок < 5%
    http_req_failed:   ['rate<0.05'],
  },
  userAgent: 'k6-realistic-user/1.0',
};

const params = {
  headers: { 'Content-Type': 'application/json' },
  timeout: '15s',
};

// Реалистичная задержка (think time)
function thinkTime(minSec = 2, maxSec = 6) {
  sleep(Math.random() * (maxSec - minSec) + minSec);
}

// Случайный выбор из массива
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function () {
  const scenario = pick(['dashboard_user', 'miniapp_user', 'visitor']);

  if (scenario === 'dashboard_user') {
    dashboardUserFlow();
  } else if (scenario === 'miniapp_user') {
    miniappUserFlow();
  } else {
    visitorFlow();
  }
}

// ═══ Сценарий 1: Пользователь дашборда ═══
function dashboardUserFlow() {
  group('Dashboard Flow', () => {
    // 1. Открыл главную
    let res = http.get(`${BASE}/`, { tags: { name: 'GET /' } });
    check(res, { 'dashboard loaded': (r) => r.status === 200 });
    errorRate.add(res.status >= 500);
    apiDuration.add(res.timings.duration);
    pageLoads.add(1);

    thinkTime(1, 3);

    // 2. Попытка логина (будет 401 — нет тестового юзера)
    res = http.post(`${BASE}/api/auth/login`, JSON.stringify({
      email: `user${__VU}@example.com`,
      password: 'password123',
    }), { ...params, tags: { name: 'POST /api/auth/login' } });
    check(res, { 'login response': (r) => r.status === 401 || r.status === 429 || r.status === 200 });
    errorRate.add(res.status >= 500);
    apiDuration.add(res.timings.duration);

    thinkTime(2, 5);

    // 3. Смотрит health (SPA рефреш)
    res = http.get(`${BASE}/health`, { tags: { name: 'GET /health' } });
    check(res, { 'health ok': (r) => r.status === 200 });
    errorRate.add(res.status >= 500);
    apiDuration.add(res.timings.duration);

    thinkTime(3, 8);

    // 4. Ещё одна страница
    res = http.get(`${BASE}/accounts`, { tags: { name: 'GET /accounts (SPA)' } });
    check(res, { 'accounts page': (r) => r.status === 200 });
    errorRate.add(res.status >= 500);
    apiDuration.add(res.timings.duration);
    pageLoads.add(1);

    thinkTime(2, 5);
  });
}

// ═══ Сценарий 2: Пользователь мини-аппа (TG) ═══
function miniappUserFlow() {
  group('MiniApp Flow', () => {
    // 1. Открыл miniapp
    let res = http.get(`${BASE}/miniapp`, { tags: { name: 'GET /miniapp' } });
    check(res, { 'miniapp loaded': (r) => r.status === 200 });
    errorRate.add(res.status >= 500);
    apiDuration.add(res.timings.duration);
    pageLoads.add(1);

    thinkTime(1, 3);

    // 2. Попытка авторизации miniapp (без initData — провалится, но нагрузит)
    res = http.post(`${BASE}/api/bot/miniapp/auth`, JSON.stringify({
      init_data: 'test_init_data_vu_' + __VU,
    }), { ...params, tags: { name: 'POST /api/bot/miniapp/auth' } });
    check(res, { 'miniapp auth response': (r) => r.status < 500 });
    errorRate.add(res.status >= 500);
    apiDuration.add(res.timings.duration);

    thinkTime(2, 4);

    // 3. Health check (polling эмуляция)
    for (let i = 0; i < 3; i++) {
      res = http.get(`${BASE}/health`, { tags: { name: 'GET /health (poll)' } });
      check(res, { 'poll ok': (r) => r.status === 200 });
      errorRate.add(res.status >= 500);
      apiDuration.add(res.timings.duration);
      sleep(2);
    }

    thinkTime(3, 6);
  });
}

// ═══ Сценарий 3: Просто зашёл — посмотрел ═══
function visitorFlow() {
  group('Visitor Flow', () => {
    // 1. Главная
    let res = http.get(`${BASE}/`, { tags: { name: 'GET / (visitor)' } });
    check(res, { 'visitor index': (r) => r.status === 200 });
    errorRate.add(res.status >= 500);
    apiDuration.add(res.timings.duration);
    pageLoads.add(1);

    thinkTime(3, 8);

    // 2. Health
    res = http.get(`${BASE}/health`, { tags: { name: 'GET /health (visitor)' } });
    check(res, { 'visitor health': (r) => r.status === 200 });
    errorRate.add(res.status >= 500);
    apiDuration.add(res.timings.duration);

    thinkTime(5, 15); // долго читает, потом уходит
  });
}

export function handleSummary(data) {
  const lines = [];
  lines.push('');
  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║         РЕЗУЛЬТАТЫ ТЕСТА РЕАЛЬНОЙ НАГРУЗКИ                 ║');
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');

  const m = data.metrics;
  const maxVU = m.vus_max?.values?.max || '?';
  const totalReqs = m.http_reqs?.values?.count || 0;
  const rps = m.http_reqs?.values?.rate?.toFixed(1) || '?';
  const dur = m.http_req_duration?.values || {};
  const failRate = m.http_req_failed?.values?.rate || 0;
  const errRate = m.errors?.values?.rate || 0;
  const pages = m.page_loads?.values?.count || 0;
  const dataRecv = m.data_received?.values?.count || 0;

  lines.push(`  Макс. одновременных VU:   ${maxVU}`);
  lines.push(`  Всего запросов:           ${totalReqs}`);
  lines.push(`  Страниц загружено:        ${pages}`);
  lines.push(`  Запросов/сек (RPS):       ${rps}`);
  lines.push(`  Получено данных:          ${(dataRecv / 1024 / 1024).toFixed(1)} MB`);
  lines.push('');
  lines.push('  ── Время ответа ──');
  lines.push(`  avg:  ${dur.avg?.toFixed(0) || '?'} ms`);
  lines.push(`  p50:  ${dur['p(50)']?.toFixed(0) || dur.med?.toFixed(0) || '?'} ms`);
  lines.push(`  p90:  ${dur['p(90)']?.toFixed(0) || '?'} ms`);
  lines.push(`  p95:  ${dur['p(95)']?.toFixed(0) || '?'} ms`);
  lines.push(`  max:  ${dur.max?.toFixed(0) || '?'} ms`);
  lines.push('');
  lines.push(`  HTTP ошибки:   ${(failRate * 100).toFixed(2)}%`);
  lines.push(`  App ошибки:    ${(errRate * 100).toFixed(2)}%`);

  lines.push('');
  lines.push('──────────────────────────────────────────────────────────────');

  const p95 = dur['p(95)'] || 0;
  if (p95 < 300 && errRate < 0.01) {
    lines.push('  ✅ ОТЛИЧНО: Площадка выдержит эту нагрузку без проблем');
  } else if (p95 < 1000 && errRate < 0.03) {
    lines.push('  ⚠️ ХОРОШО: Работает стабильно, но есть задержки');
  } else if (p95 < 2000 && errRate < 0.05) {
    lines.push('  ⚠️ ДОПУСТИМО: Нужна оптимизация');
  } else {
    lines.push('  ❌ ПРОБЛЕМЫ: Площадка не справляется с нагрузкой');
  }

  // Оценка реальных пользователей
  const rpsNum = parseFloat(rps) || 1;
  const avgReqsPerUser = 5; // ~5 запросов на сессию
  const avgSessionSec = 30; // ~30 сек сессия
  const concurrentUsers = Math.round(rpsNum * avgSessionSec / avgReqsPerUser);

  lines.push('');
  lines.push(`  📊 Оценка: при ${maxVU} VU, RPS=${rps}`);
  lines.push(`     Это ~${concurrentUsers} одновременных реальных пользователей`);
  lines.push(`     Или ~${concurrentUsers * 60} пользователей в час (при avg. сессии ${avgSessionSec}s)`);
  lines.push('');

  console.log(lines.join('\n'));

  return {
    'tests/load/realistic-results.json': JSON.stringify(data, null, 2),
  };
}
