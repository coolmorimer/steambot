import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

/*  ═══════════════════════════════════════════════════════════
    СТРЕСС-ТЕСТ: максимальное число одновременных пользователей
    ═══════════════════════════════════════════════════════════
    Плавно поднимаем VU от 1 → 50 → 100 → 200 → 300 → 500 → 200 → 0
    Ищем точку, когда p95 > 2s или ошибок > 5%
*/

const BASE = __ENV.BASE_URL || 'https://communityrig.ru';

// Кастомные метрики
const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration', true);
const healthChecks = new Counter('health_checks');

export const options = {
  stages: [
    // Прогрев
    { duration: '30s', target: 10 },
    // Наращиваем
    { duration: '1m',  target: 50 },
    { duration: '1m',  target: 50 },   // hold
    { duration: '1m',  target: 100 },
    { duration: '1m',  target: 100 },  // hold
    { duration: '1m',  target: 200 },
    { duration: '1m',  target: 200 },  // hold
    { duration: '1m',  target: 300 },
    { duration: '1m',  target: 300 },  // hold
    { duration: '1m',  target: 500 },
    { duration: '1m',  target: 500 },  // hold
    // Спад
    { duration: '1m',  target: 200 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],   // p95 < 3s
    errors:            ['rate<0.10'],     // ошибок < 10%
    http_req_failed:   ['rate<0.10'],
  },
  noConnectionReuse: false,
  userAgent: 'k6-stress-test/1.0',
};

const params = {
  headers: { 'Content-Type': 'application/json' },
  timeout: '15s',
};

export default function () {
  // ── 1. Health check (лёгкий) ──
  group('health', () => {
    const res = http.get(`${BASE}/health`, { ...params, tags: { name: 'GET /health' } });
    check(res, {
      'health 200': (r) => r.status === 200,
      'health body ok': (r) => {
        try { return JSON.parse(r.body).status === 'ok'; } catch { return false; }
      },
    });
    errorRate.add(res.status !== 200);
    apiDuration.add(res.timings.duration);
    healthChecks.add(1);
  });

  sleep(0.3);

  // ── 2. Статические ресурсы (dashboard) ──
  group('static', () => {
    const res = http.get(`${BASE}/`, { ...params, tags: { name: 'GET /' } });
    check(res, { 'dashboard 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);
    apiDuration.add(res.timings.duration);
  });

  sleep(0.3);

  // ── 3. Miniapp ──
  group('miniapp', () => {
    const res = http.get(`${BASE}/miniapp`, { ...params, tags: { name: 'GET /miniapp' } });
    check(res, { 'miniapp 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);
    apiDuration.add(res.timings.duration);
  });

  sleep(0.3);

  // ── 4. API login attempt (нагрузка на auth + DB) ──
  group('api_login', () => {
    const payload = JSON.stringify({
      email: `loadtest${__VU}@test.com`,
      password: 'wrongpassword123',
    });
    const res = http.post(`${BASE}/api/auth/login`, payload, {
      ...params,
      tags: { name: 'POST /api/auth/login' },
    });
    // 401 — ожидаемо (неверные данные), 429 — rate limit
    check(res, {
      'login response': (r) => r.status === 401 || r.status === 429,
    });
    errorRate.add(res.status >= 500);
    apiDuration.add(res.timings.duration);
  });

  sleep(0.5);

  // ── 5. Public API / несуществующий маршрут (404 нагрузка) ──
  group('api_404', () => {
    const res = http.get(`${BASE}/api/nonexistent`, { ...params, tags: { name: 'GET /api/404' } });
    check(res, { '404 response': (r) => r.status === 404 || r.status === 429 });
    errorRate.add(res.status >= 500);
    apiDuration.add(res.timings.duration);
  });

  sleep(Math.random() * 1 + 0.5);
}

export function handleSummary(data) {
  const lines = [];
  lines.push('');
  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║            РЕЗУЛЬТАТЫ СТРЕСС-ТЕСТА                         ║');
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');

  const m = data.metrics;

  // VUs
  const maxVU = m.vus_max?.values?.max || '?';
  lines.push(`  Макс. одновременных VU:  ${maxVU}`);

  // Запросы
  const totalReqs = m.http_reqs?.values?.count || 0;
  const rps = m.http_reqs?.values?.rate?.toFixed(1) || '?';
  lines.push(`  Всего запросов:          ${totalReqs}`);
  lines.push(`  Запросов/сек (RPS):      ${rps}`);

  // Длительность
  const dur = m.http_req_duration?.values || {};
  lines.push(`  Время ответа (avg):      ${dur.avg?.toFixed(0) || '?'} ms`);
  lines.push(`  Время ответа (p50):      ${dur['p(50)']?.toFixed(0) || dur.med?.toFixed(0) || '?'} ms`);
  lines.push(`  Время ответа (p90):      ${dur['p(90)']?.toFixed(0) || '?'} ms`);
  lines.push(`  Время ответа (p95):      ${dur['p(95)']?.toFixed(0) || '?'} ms`);
  lines.push(`  Время ответа (max):      ${dur.max?.toFixed(0) || '?'} ms`);

  // Ошибки
  const failRate = m.http_req_failed?.values?.rate || 0;
  const errRate = m.errors?.values?.rate || 0;
  lines.push(`  HTTP ошибки (%):         ${(failRate * 100).toFixed(2)}%`);
  lines.push(`  App ошибки (%):          ${(errRate * 100).toFixed(2)}%`);

  // Пропускная способность
  const dataRecv = m.data_received?.values?.count || 0;
  const dataSent = m.data_sent?.values?.count || 0;
  lines.push(`  Получено данных:         ${(dataRecv / 1024 / 1024).toFixed(1)} MB`);
  lines.push(`  Отправлено данных:       ${(dataSent / 1024 / 1024).toFixed(1)} MB`);

  lines.push('');
  lines.push('──────────────────────────────────────────────────────────────');

  // оценка
  const p95 = dur['p(95)'] || 0;
  if (p95 < 500 && errRate < 0.01) {
    lines.push('  ✅ ОТЛИЧНО: p95 < 500ms, ошибок < 1%');
  } else if (p95 < 2000 && errRate < 0.05) {
    lines.push('  ⚠️ НОРМАЛЬНО: p95 < 2s, ошибок < 5%');
  } else {
    lines.push('  ❌ ПРОБЛЕМЫ: высокая задержка или много ошибок');
  }
  lines.push(`  Макс. устойчивая нагрузка: ~${maxVU} VU`);
  lines.push('');

  console.log(lines.join('\n'));

  return {
    'tests/load/stress-results.json': JSON.stringify(data, null, 2),
  };
}
