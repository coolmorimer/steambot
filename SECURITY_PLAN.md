# Аудит безопасности и оптимизации — План работ

> Дата аудита: 7 апреля 2026 г.  
> Статус: **полностью реализовано** (фазы 1-4 + HMAC API keys, Steam OAuth CSRF, шифрование в БД, кеш настроек, N+1 оптимизация, 2FA)

---

## Фаза 1 — Критические уязвимости

### 1.1 Валидация секретов при старте сервера

**Файл:** `server/config.js`  
**Проблема:** JWT_SECRET по умолчанию = `'CHANGE_ME_IN_PRODUCTION_32_CHARS_MIN'`, ADMIN_PASSWORD = `'admin123'`. Если оператор забудет настроить `.env`, сервер запустится с дефолтными значениями, и любой сможет подделать JWT или войти в админку.  
**Решение:**  
- При старте сервера проверять, что `JWT_SECRET` не содержит слово `CHANGE_ME` и имеет длину ≥ 32 символа.  
- Проверять, что `ADMIN_PASSWORD` не равен `admin123`.  
- Если проверки не пройдены — падать с понятной ошибкой, не запускать сервер.

```js
// server/app.js — добавить перед listen()
if (config.jwt.secret.includes('CHANGE_ME') || config.jwt.secret.length < 32) {
  console.error('FATAL: JWT_SECRET must be changed and be >= 32 chars');
  process.exit(1);
}
if (config.admin.password === 'admin123') {
  console.error('FATAL: ADMIN_PASSWORD must be changed from default');
  process.exit(1);
}
```

---

### 1.2 Исправление CORS — убрать динамический Host

**Файл:** `server/app.js` (строки 75-79)  
**Проблема:** CORS-whitelist динамически включает значение заголовка `Host` из входящего запроса (`http://${host}`, `https://${host}`). Атакующий с домена `evil.com` отправляет запрос с `Host: evil.com` — и CORS разрешит origin `http://evil.com`. Это полностью обходит CORS-защиту.  
**Решение:**  
- Удалить строки с динамическим добавлением host.  
- Оставить только жёстко прописанные домены: `config.appUrl` + localhost-ы для дева.

```js
const allowed = [
  config.appUrl,
  // только для development:
  ...(config.nodeEnv === 'development'
    ? ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:4000']
    : []),
].filter(Boolean);
```

---

### 1.3 SSL-верификация для PostgreSQL

**Файл:** `server/db/pg.js` (строка 21-23)  
**Проблема:** `rejectUnauthorized: false` отключает проверку сертификата БД. Любой, кто может перехватить трафик между сервером и БД (MITM), получает доступ ко всем данным.  
**Решение:**  
- Для production: `rejectUnauthorized: true` + указать CA-сертификат через переменную `DB_CA_CERT`.  
- Для development: оставить `false`, но явно логировать предупреждение.

```js
ssl: (process.env.DB_SSL === 'true' || poolCfg.ssl)
  ? {
      rejectUnauthorized: config.nodeEnv === 'production',
      ca: process.env.DB_CA_CERT || undefined,
    }
  : false,
```

---

### 1.4 IDOR — проверка владельца ресурса (campaigns, jobs)

**Файлы:** `server/routes/campaigns.js` (строка 33), `server/routes/jobs.js` (строка 11)  
**Проблема:** Endpoint `GET /api/campaigns/:id` возвращает кампанию по ID без проверки, что она принадлежит текущему пользователю. То же с `POST /api/jobs/:id/cancel` и `DELETE /api/jobs/:id`. Пользователь A может просматривать/отменять/удалять ресурсы пользователя B, зная их ID.  
**Решение:**  
- В каждом маршруте, работающем с `:id`, запрашивать ресурс вместе с `user_id` и сверять с `req.userId`.
- В слое БД (`db/index.js`, `db/pg.js`) все функции типа `getCampaignById(id)` должны принимать и проверять `userId`.

```js
// campaigns.js — GET /:id
const campaign = await db.getCampaignById(req.params.id, req.userId);
if (!campaign) return res.status(404).json({ error: 'Кампания не найдена' });

// jobs.js — POST /:id/cancel
const job = await db.getJobById(req.params.id, req.userId);
if (!job) return res.status(404).json({ error: 'Задача не найдена' });
```

---

### 1.5 Проверка подписи webhook-ов (YooKassa, СБП)

**Файлы:** `server/routes/balance.js` (строка 78), `server/routes/payments.js` (строка 108)  
**Проблема:** YooKassa и СБП webhook-endpoints принимают POST-запросы и активируют оплату/подписку **без проверки подписи**. Любой может отправить фейковый webhook и получить бесплатную подписку или зачислить баланс.  
**Решение:**  
- **YooKassa:** Проверять IP-адрес источника (whitelist IP YooKassa) + Basic Auth или подпись через HMAC из секретного ключа.  
- **СБП:** Реализовать валидацию подписи (HMAC-SHA256 от тела запроса + секретный ключ из личного кабинета банка).  
- Добавить rate limiting (10 req/min) на webhook-endpoints.  
- Логировать все входящие webhook-вызовы в audit log.

```js
// balance.js — YooKassa webhook
const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
const YOOKASSA_IPS = ['185.71.76.0/27', '185.71.77.0/27', '77.75.153.0/25'];
if (!isIpInRanges(ip, YOOKASSA_IPS)) {
  logger.warn('YooKassa webhook from unknown IP', { ip });
  return res.status(403).json({ error: 'Forbidden' });
}
```

---

### 1.6 Race condition при обновлении баланса

**Файл:** `server/routes/balance.js` (строка 45), `server/db/pg.js`  
**Проблема:** `updateUserBalance(userId, amount)` читает текущий баланс и записывает новый без блокировки. При одновременных запросах (два webhook-а подряд) оба прочитают старый баланс, и одно зачисление потеряется.  
**Решение:**  
- Обернуть обновление баланса в транзакцию с `SELECT ... FOR UPDATE`.

```sql
BEGIN;
SELECT balance_kopecks FROM users WHERE id = $1 FOR UPDATE;
UPDATE users SET balance_kopecks = balance_kopecks + $2 WHERE id = $1
  RETURNING balance_kopecks;
COMMIT;
```

---

### 1.7 Шифрование секретов в БД (bot_token, cookies)

**Файл:** `server/db/schema.js` (строки 105, 136)  
**Проблема:** Telegram-токены ботов и Steam-cookies хранятся в plaintext. При утечке БД (SQL dump, бэкап, взлом) все аккаунты пользователей компрометируются.  
**Решение:**  
- Зашифровать поля `bot_token` и `cookies` с помощью AES-256-GCM.  
- Ключ шифрования хранить только в переменной окружения `ENCRYPTION_KEY` (не в БД и не в конфиге).  
- Создать утилиту `server/utils/crypto.js` с функциями `encrypt(plaintext)` → `iv:tag:ciphertext` и `decrypt(encrypted)`.

```js
// server/utils/crypto.js
const crypto = require('crypto');
const ALGO = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // 32 bytes

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  let enc = cipher.update(text, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${enc}`;
}

function decrypt(data) {
  const [ivHex, tagHex, enc] = data.split(':');
  const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let dec = decipher.update(enc, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}
```

- Написать миграцию: прочитать все plaintext-значения → зашифровать → обновить строки.

---

### 1.8 Указать algorithm в JWT

**Файлы:** `server/middleware/auth.js` (строка 26), `server/routes/auth.js`, `server/routes/bot.js`  
**Проблема:** `jwt.verify(token, secret)` без опции `algorithms` уязвим к атаке algorithm confusion (подмена HS256 на RS256 или `none`). Атакующий может подделать токен.  
**Решение:**  
- Во всех `jwt.verify()` добавить `{ algorithms: ['HS256'] }`.  
- Во всех `jwt.sign()` явно указать `{ algorithm: 'HS256' }`.

```js
// middleware/auth.js
const decoded = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });

// routes/auth.js
const accessToken = jwt.sign(payload, config.jwt.secret, {
  algorithm: 'HS256',
  expiresIn: config.jwt.accessExpiry,
});
```

---

### 1.9 Включить Content Security Policy

**Файл:** `server/app.js` (строка 59)  
**Проблема:** `contentSecurityPolicy: false` — полностью отключена защита от XSS через CSP. Если атакующий внедрит скрипт (через stored XSS в campaign template), браузер выполнит его без ограничений.  
**Решение:**  
- Включить CSP с whitelist для своего домена.

```js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // для Tailwind
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", config.appUrl],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
```

---

## Фаза 2 — Высокие уязвимости

### 2.1 Двухфакторная аутентификация (2FA) по Email / Telegram

**Файлы:** новый `server/routes/twofa.js`, `server/db/schema.js`, `server/routes/auth.js`  
**Проблема:** Единственный фактор аутентификации — пароль. При утечке пароля (фишинг, повторное использование) аккаунт полностью компрометируется.  
**Решение:**  
- Добавить таблицу `two_factor_settings` со столбцами: `user_id`, `method` (email | telegram), `enabled`, `created_at`.  
- При включении 2FA:
  - **Email:** отправлять 6-значный OTP-код на email пользователя при каждом логине.
  - **Telegram:** отправлять OTP-код через Telegram-бота пользователя.
- Коды живут 5 минут, максимум 5 попыток ввода, после — блокировка на 15 минут.
- Хранить коды в таблице `two_factor_codes`: `user_id`, `code_hash` (SHA256), `expires_at`, `attempts`.

**Флоу логина с 2FA:**
```
1. POST /api/auth/login  { email, password }
   → Если 2FA включена: вернуть { requires_2fa: true, method: 'email', session_token: '...' }
   → session_token — короткоживущий (5 мин), без доступа к API

2. POST /api/auth/verify-2fa  { session_token, code }
   → Проверить OTP, вернуть полноценные access + refresh токены
```

**Endpoints:**
```
POST   /api/auth/2fa/enable    — включить 2FA (отправит тестовый код)
POST   /api/auth/2fa/confirm   — подтвердить включение (ввести тестовый код)
POST   /api/auth/2fa/disable   — отключить 2FA (потребует текущий пароль)
GET    /api/auth/2fa/status     — статус 2FA
POST   /api/auth/verify-2fa    — проверка OTP при логине
```

---

### 2.2 HMAC+salt для API keys

**Файл:** `server/middleware/apiKeyAuth.js` (строка 9)  
**Проблема:** API-ключи хешируются простым `SHA256` без соли. При утечке БД атакующий может использовать rainbow tables для восстановления ключей.  
**Решение:**  
- Использовать HMAC-SHA256 с серверным секретом из переменной окружения.  
- Генерировать уникальную соль для каждого ключа (сохранять рядом в таблице).

```js
function hashKey(key) {
  return crypto.createHmac('sha256', process.env.API_KEY_SECRET)
    .update(key)
    .digest('hex');
}
```

- Написать миграцию для пересоздания хешей существующих ключей (потребует регенерацию ключей пользователями — предупредить заранее).

---

### 2.3 CSRF-защита Steam OAuth

**Файл:** `server/routes/oauth.js` (строка 49)  
**Проблема:** Steam OpenID flow не использует `state` параметр. Атакующий может подставить свой Steam-аккаунт в чужой профиль через CSRF.  
**Решение:**  
- Генерировать случайный `state` перед редиректом на Steam.  
- Сохранять его в сессии (или JWT) пользователя.  
- При callback-е проверять, что `state` совпадает.

```js
// Перед редиректом:
const state = crypto.randomBytes(16).toString('hex');
// Сохранить state в БД или подписать JWT с state
const stateToken = jwt.sign({ state, userId: req.userId }, config.jwt.secret, {
  algorithm: 'HS256', expiresIn: '10m'
});
// Добавить state= в URL

// В callback:
const { state: returnedState } = req.query;
const decoded = jwt.verify(req.query.state_token, config.jwt.secret, { algorithms: ['HS256'] });
if (decoded.state !== returnedState) return res.status(403).json({ error: 'Invalid state' });
```

---

### 2.4 Rate limiting на auth/refresh и webhooks

**Файлы:** `server/app.js` (строки 127-139), `server/routes/balance.js`, `server/routes/payments.js`  
**Проблема:** Endpoint `/api/auth/refresh` не имеет rate limiting — атакующий может брутфорсить refresh-токены. Webhook-endpoints также не ограничены.  
**Решение:**  
- `/api/auth/refresh`: 10 запросов / 15 минут по IP.  
- `/api/auth/verify-2fa`: 5 запросов / 15 минут по IP.  
- Webhook endpoints: 30 запросов / минуту по IP.

```js
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
app.use('/api/auth/refresh', refreshLimiter);

const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
app.use('/api/payments/sbp/callback', webhookLimiter);
app.use('/api/balance/yookassa/webhook', webhookLimiter);
```

---

### 2.5 Не возвращать секреты в API-ответах

**Файлы:** `server/routes/profiles.js` (строка 15), `server/routes/telegram.js`  
**Проблема:** API возвращает Steam-cookies и Telegram bot_token клиенту в полном виде. Если фронтенд уязвим для XSS — все секреты утекают.  
**Решение:**  
- В ответах API **никогда** не возвращать `cookies`, `bot_token` целиком.  
- Вместо этого возвращать маскированные значения: `"cookies": "[настроены]"`, `"bot_token": "123456:AAAA...XXXX"` (первые 6 + последние 4 символа).  
- Если фронтенду нужно знать «есть ли cookies» — возвращать boolean `has_cookies: true`.

```js
function maskToken(token) {
  if (!token || token.length < 12) return '***';
  return token.slice(0, 6) + '...' + token.slice(-4);
}
```

---

### 2.6 Уменьшить лимит body до 2MB

**Файл:** `server/app.js` (строка 102)  
**Проблема:** `express.json({ limit: '10mb' })` — слишком большой лимит. Атакующий может отправить тысячи 10MB-запросов и исчерпать память сервера.  
**Решение:**  
- Глобальный лимит: `2mb` (достаточно для импорта профилей с cookies).  
- Для конкретных endpoints, где нужно больше — отдельные middleware с повышенным лимитом.

```js
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb', parameterLimit: 50 }));
```

---

### 2.7 Исправить admin email case sensitivity

**Файл:** `server/routes/admin.js` (строка 130)  
**Проблема:** Сравнение `req.dbUser.email === config.admin.email` — case-sensitive. Если в БД `Admin@test.com`, а в конфиге `admin@test.com`, проверка не пройдёт.  
**Решение:**  

```js
if (req.dbUser.email.toLowerCase() !== config.admin.email.toLowerCase()) {
  return res.status(403).json({ error: 'Только системный администратор' });
}
```

---

### 2.8 Защита от удаления admin-аккаунтов

**Файл:** `server/routes/admin.js` (строка 88)  
**Проблема:** Администратор может удалить другого администратора (включая системного) через `DELETE /api/admin/users/:id` — проверяется только «нельзя удалить себя».  
**Решение:**  

```js
router.delete('/users/:id', requireAdmin, async (req, res) => {
  if (req.params.id === req.userId)
    return res.status(400).json({ error: 'Нельзя удалить себя' });

  const target = await db.getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  if (target.role === 'admin' && req.dbUser.email.toLowerCase() !== config.admin.email.toLowerCase())
    return res.status(403).json({ error: 'Только sysadmin может удалять администраторов' });

  await db.deleteUser(req.params.id);
  res.json({ ok: true });
});
```

---

### 2.9 Санитизация XSS в campaign templates

**Файл:** `server/middleware/validate.js` (строка 33)  
**Проблема:** `body_template` принимает до 5000 символов произвольного текста. Если шаблон используется в веб-интерфейсе без экранирования — stored XSS.  
**Решение:**  
- При записи в БД: экранировать HTML-теги через `he.encode()` или strip tags.  
- При рендеринге на фронте: React автоматически экранирует, но **не использовать `dangerouslySetInnerHTML`** с этими данными.  
- Добавить серверную валидацию: отклонять `<script>`, `javascript:`, `on*=` паттерны.

```js
const FORBIDDEN_PATTERNS = /<script|javascript:|on\w+\s*=/i;
body_template: z.string().min(1).max(5000).refine(
  val => !FORBIDDEN_PATTERNS.test(val),
  { message: 'Шаблон содержит запрещённые конструкции' }
),
```

---

## Фаза 3 — Средние проблемы

### 3.1 HSTS в Express

**Файл:** `server/app.js`  
**Проблема:** При прямом доступе к порту 4000 (минуя Nginx) трафик не зашифрован, нет HSTS-заголовка.  
**Решение:**  
- Helmet уже поддерживает HSTS — убедиться, что он включён.  
- Добавить middleware для редиректа HTTP → HTTPS в production.

```js
app.use(helmet({
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  // ...
}));

// Redirect HTTP → HTTPS в production
if (config.nodeEnv === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}
```

---

### 3.2 Rate limit на webhooks

**Файлы:** `server/routes/balance.js`, `server/routes/payments.js`  
**Описание:** Webhook endpoints без rate limit могут быть заспамлены → забивают логи, нагружают БД. Решение описано в п. 2.4.

---

### 3.3 Исправить optionalAuth

**Файл:** `server/middleware/auth.js` (строка 54)  
**Проблема:** `catch (_) { /* игнорируем */ }` — перехватывает и скрывает ВСЕ исключения, включая ошибки БД и логические баги.  
**Решение:**  

```js
async function optionalAuth(req, res, next) {
  try {
    // ... verify token
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      // Невалидный или просроченный токен — нормально для optional
      return next();
    }
    // Остальные ошибки (БД, логика) — пробрасываем
    return next(err);
  }
  next();
}
```

---

### 3.4 Request ID для трейсирования

**Файл:** `server/app.js`  
**Проблема:** Невозможно связать логи между собой при расследовании инцидентов.  
**Решение:**  

```js
const { randomUUID } = require('crypto');
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});
```

- Прокидывать `req.id` во все вызовы `logger.*()`.

---

## Фаза 4 — Оптимизация производительности

### 4.1 Compression middleware

**Файл:** `server/app.js`  
**Проблема:** JSON-ответы не сжимаются на уровне Express. Nginx может сжимать, но если идёт прямой запрос — ответы тяжёлые.  
**Решение:**  

```bash
npm install compression
```

```js
const compression = require('compression');
app.use(compression({ threshold: 1024, level: 6 }));
```

---

### 4.2 Оптимизация getAdminUserList (N+1 → JOIN)

**Файл:** `server/db/pg.js` (строки 876-903)  
**Проблема:** 3 коррелированных подзапроса (`SELECT COUNT(*)`) выполняются для каждой строки user — при 1000 пользователях это ~3000 дополнительных операций.  
**Решение:**  

```sql
SELECT u.*,
  s.plan_id, s.status as sub_status, s.expires_at, s.trial_ends_at,
  p.name as plan_name,
  COALESCE(pr.cnt, 0) as profiles_count,
  COALESCE(c.cnt, 0) as campaigns_count,
  COALESCE(j.cnt, 0) as jobs_done
FROM users u
LEFT JOIN subscriptions s ON s.user_id = u.id
LEFT JOIN plans p ON p.id = s.plan_id
LEFT JOIN (SELECT user_id, COUNT(*) as cnt FROM profiles GROUP BY user_id) pr ON pr.user_id = u.id
LEFT JOIN (SELECT user_id, COUNT(*) as cnt FROM campaigns GROUP BY user_id) c ON c.user_id = u.id
LEFT JOIN (SELECT user_id, COUNT(*) as cnt FROM jobs WHERE status = 'done' GROUP BY user_id) j ON j.user_id = u.id
WHERE ($1 = '' OR u.email ILIKE $1 OR u.username ILIKE $1)
ORDER BY u.created_at DESC
LIMIT $2 OFFSET $3;
```

---

### 4.3 Кеширование getServerSetting()

**Файл:** `server/routes/telegram.js` (строка 12)  
**Проблема:** `getServerSetting('TG_BOT_USERNAME')` вызывается на каждый запрос — лишний SELECT в БД.  
**Решение:**  

```js
// server/utils/settingsCache.js
const cache = new Map();
const TTL = 5 * 60 * 1000; // 5 минут

async function getCachedSetting(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < TTL) return cached.value;

  const value = await db.getServerSetting(key);
  cache.set(key, { value, ts: Date.now() });
  return value;
}

function invalidateCache(key) {
  if (key) cache.delete(key);
  else cache.clear();
}
```

- Вызывать `invalidateCache()` при обновлении настроек через admin panel.

---

### 4.4 Обязательная pagination на списковых endpoints

**Файлы:** `server/routes/campaigns.js`, `server/routes/jobs.js`, `server/routes/profiles.js`  
**Проблема:** Если пользователь имеет 10 000 кампаний, запрос `GET /api/campaigns` вернёт все разом.  
**Решение:**  
- Максимум: 100 элементов за запрос.  
- Дефолт: 20 элементов.  
- Обязательный ответ с метаданными: `{ data: [...], total, limit, offset }`.

```js
const limit = Math.min(parseInt(req.query.limit) || 20, 100);
const offset = Math.max(parseInt(req.query.offset) || 0, 0);
```

---

### 4.5 Request timeout

**Файл:** `server/app.js`  
**Проблема:** Нет таймаута на обработку запроса. Долгий запрос (например, Playwright завис) удерживает соединение бесконечно.  
**Решение:**  

```js
const http = require('http');
const server = http.createServer(app);
server.timeout = 120_000;       // hard kill через 2 мин
server.keepAliveTimeout = 65_000; // больше чем Nginx (60s)
server.headersTimeout = 66_000;
```

---

### 4.6 Health check с проверкой зависимостей

**Файл:** `server/app.js` (строки 157-164)  
**Проблема:** `/health` возвращает `{ status: 'ok' }` даже когда БД лежит. Load balancer продолжает слать трафик на мёртвый инстанс.  
**Решение:**  

```js
app.get('/health', async (req, res) => {
  const checks = {};
  try {
    await db.raw('SELECT 1'); // или db.getPool().query('SELECT 1')
    checks.db = 'ok';
  } catch {
    checks.db = 'fail';
  }
  const allOk = Object.values(checks).every(v => v === 'ok');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    checks,
    version: '2.0.0',
    uptime: process.uptime(),
  });
});
```

---

### 4.7 Playwright: гарантия закрытия браузера

**Файл:** `server/services/SteamBotManager.js` (строка 165)  
**Проблема:** Если Playwright-задача падает с ошибкой, `browser.close()` может не вызваться — утечка памяти и процессов.  
**Решение:**  

```js
let browser;
try {
  browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  // ... работа
} finally {
  if (browser) {
    await browser.close().catch(err =>
      logger.error('Failed to close browser', { err: err.message })
    );
  }
}
```

---

### 4.8 DB pool и keepAlive

**Файл:** `server/db/pg.js` (строка 24)  
**Проблема:** Дефолт pool = 10 коннектов, нет keepAlive. При нагрузке >10 одновременных запросов — очередь.  
**Решение:**  

```js
const pool = new Pool({
  max: Number(process.env.DB_POOL_MAX || 20),
  min: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  // ...
});
```

---

### 4.9 Увеличить ротацию логов

**Файл:** `server/logger.js` (строки 20-31)  
**Проблема:** 5 файлов × 10MB = 50MB max — слишком мало для production с активным трафиком.  
**Решение:**  

```js
new DailyRotateFile({
  dirname: logsDir,
  filename: 'app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '50m',
  maxFiles: '30d',   // хранить 30 дней
  zippedArchive: true,
});
```

Или при текущем File transport:
```js
maxsize: 50 * 1024 * 1024,  // 50 MB
maxFiles: 20,
tailable: true,
```

---

### 4.10 Бесконечный retry TelegramBotManager

**Файл:** `server/services/TelegramBotManager.js` (строка 120)  
**Проблема:** При polling_error 409 бот перезапускается через 60 секунд бесконечно, ошибки подавляются `catch(() => {})`.  
**Решение:**  
- Добавить максимальное количество ретраев (5).  
- Экспоненциальный backoff (60s → 120s → 240s → ...).  
- Логировать каждую попытку.

```js
let _retryCount = 0;
const MAX_RETRIES = 5;

tg.on('polling_error', (e) => {
  if (e.message?.includes('409 Conflict')) {
    if (_retryCount >= MAX_RETRIES) {
      logger.error('TG bot max retries exceeded, stopping');
      return;
    }
    const delay = 60_000 * Math.pow(2, _retryCount);
    _retryCount++;
    logger.warn(`TG bot retry #${_retryCount} in ${delay / 1000}s`);
    setTimeout(() => start(opts).catch(err =>
      logger.error('TG bot retry failed', { err: err.message })
    ), delay);
  }
});
```

---

## Сводка

| Фаза | Кол-во задач | Приоритет |
|------|-------------|-----------|
| **Фаза 1** — Критические | 9 | Немедленно |
| **Фаза 2** — Высокие     | 9 | В течение недели |
| **Фаза 3** — Средние      | 4 | В течение 2 недель |
| **Фаза 4** — Оптимизация  | 10 | По мере возможности |
| **Итого**                  | **32** | |
