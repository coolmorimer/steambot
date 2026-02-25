# Steam Poster Bot — SaaS Architecture

## Обзор проекта

Многопользовательский SaaS-сервис для автоматического постинга в форумы Steam.
Пользователи регистрируются, выбирают тариф, подключают свои Steam-аккаунты и Telegram-ботов.

---

## Архитектура

```
                        ┌──────────────────────────────────┐
                        │           Nginx (HTTPS)           │
                        │    *.your-domain.com:443/80       │
                        └──────────────┬───────────────────┘
                                       │
                        ┌──────────────▼───────────────────┐
                        │       SaaS Express Server         │
                        │          server/app.js            │
                        │                                   │
                        │  ┌─────────┐   ┌──────────────┐  │
                        │  │  REST   │   │  Static SPA  │  │
                        │  │  /api/* │   │  dashboard/  │  │
                        │  └────┬────┘   └──────────────┘  │
                        │       │                           │
                        │  ┌────▼──────────────────────┐   │
                        │  │       SQLite (multi-tenant)│   │
                        │  │  users / profiles /        │   │
                        │  │  campaigns / jobs /        │   │
                        │  │  subscriptions             │   │
                        │  └───────────────────────────┘   │
                        │                                   │
                        │  ┌─────────────────────────────┐ │
                        │  │   TelegramBotManager         │ │
                        │  │   (pool per user)            │ │
                        │  └─────────────────────────────┘ │
                        │                                   │
                        │  ┌─────────────────────────────┐ │
                        │  │   SteamBotManager            │ │
                        │  │   (cron + Playwright pool)   │ │
                        │  └─────────────────────────────┘ │
                        └──────────────────────────────────┘
                                       │
                               ┌───────┴────────┐
                               │                │
                        ┌──────▼──┐      ┌──────▼──────┐
                        │ Telegram │      │ Steam Forum  │
                        │   API    │      │  (Playwright)│
                        └─────────┘      └─────────────┘
```

---

## Структура проекта

```
steambot/
├── server/                    ← ВСЯ серверная логика
│   ├── app.js                 ← Главный Express сервер
│   ├── config.js              ← Конфигурация (env vars)
│   ├── package.json           ← Зависимости сервера
│   ├── .env.example           ← Шаблон переменных
│   │
│   ├── db/
│   │   ├── schema.js          ← Многопользовательская схема SQLite
│   │   ├── index.js           ← Data Access Layer (все запросы)
│   │   └── seeds.js           ← Начальные данные (планы + admin)
│   │
│   ├── middleware/
│   │   ├── auth.js            ← JWT-аутентификация
│   │   └── subscription.js    ← Проверка лимитов плана
│   │
│   ├── routes/
│   │   ├── auth.js            ← /api/auth/*
│   │   ├── profiles.js        ← /api/profiles/*
│   │   ├── campaigns.js       ← /api/campaigns/*
│   │   ├── jobs.js            ← /api/jobs/*
│   │   ├── settings.js        ← /api/settings
│   │   ├── telegram.js        ← /api/telegram/*
│   │   ├── subscriptions.js   ← /api/subscriptions/*
│   │   ├── payments.js        ← /api/payments/webhook (Stripe)
│   │   ├── bot.js             ← /api/bot/*
│   │   └── admin.js           ← /api/admin/*
│   │
│   ├── services/
│   │   ├── TelegramBotManager.js  ← Пул TG-ботов (по одному на юзера)
│   │   ├── SteamBotManager.js     ← Пул Steam-постеров (cron per user)
│   │   └── SubscriptionService.js ← Логика тарифов + Stripe
│   │
│   └── dashboard/             ← (создать) React SPA веб-дашборд
│       ├── src/               ← Адаптированный frontend
│       └── dist/              ← Сборка (отдаётся Nginx/Express)
│
├── poster.js                  ← Playwright постер (shared)
├── docker-compose.yml         ← Docker продакшен
├── Dockerfile.server          ← Docker образ сервера
├── nginx.conf                 ← Nginx конфиг (SSL + proxy)
└── .env.docker                ← Переменные для Docker
```

---

## Планы подписок

| Параметр              | Free  | Starter | Pro   | Enterprise |
|-----------------------|-------|---------|-------|------------|
| Цена/мес              | $0    | $9.99   | $24.99| $79.99     |
| Цена/год              | $0    | $99.99  | $249.99| $799.99   |
| Steam аккаунтов       | 1     | 3       | 10    | ∞          |
| Кампаний              | 1     | 5       | 20    | ∞          |
| Постов в день         | 5     | 50      | 200   | ∞          |
| Telegram-бот          | ✗     | ✓       | ✓     | до 5       |
| Mini App              | ✗     | ✓       | ✓     | ✓          |
| AI-шаблоны            | ✗     | ✗       | ✓     | ✓          |
| Аналитика             | ✗     | ✗       | ✓     | ✓          |
| Приоритетная поддержка| ✗     | ✗       | ✗     | ✓          |
| REST API              | ✗     | ✗       | ✗     | ✓          |

---

## API Endpoints

### Auth
```
POST   /api/auth/register          Регистрация
POST   /api/auth/login             Вход
POST   /api/auth/refresh           Обновить токен
POST   /api/auth/logout            Выход
GET    /api/auth/me                Текущий пользователь
PATCH  /api/auth/profile           Обновить профиль / пароль
POST   /api/auth/password/forgot   Запросить сброс пароля
POST   /api/auth/password/reset    Установить новый пароль
```

### Steam аккаунты
```
GET    /api/profiles               Список аккаунтов
POST   /api/profiles               Добавить (Playwright)
POST   /api/profiles/import        Импорт кук из JSON
PATCH  /api/profiles/:id           Обновить
DELETE /api/profiles/:id           Удалить
POST   /api/profiles/:id/toggle    Вкл/выкл
```

### Кампании
```
GET    /api/campaigns              Список
POST   /api/campaigns              Создать
GET    /api/campaigns/:id          Деталь
PATCH  /api/campaigns/:id          Обновить
DELETE /api/campaigns/:id          Удалить
POST   /api/campaigns/:id/toggle   Вкл/выкл
```

### Steam Бот
```
GET    /api/bot/status             Статус постера
POST   /api/bot/start              Запустить
POST   /api/bot/stop               Остановить
```

### Задачи (Jobs)
```
GET    /api/jobs                   История задач
GET    /api/jobs/stats             Статистика
POST   /api/jobs/:id/cancel        Отменить задачу
DELETE /api/jobs/:id               Удалить
```

### Telegram
```
GET    /api/telegram               Конфиг бота
PUT    /api/telegram               Сохранить конфиг
POST   /api/telegram/start         Запустить
POST   /api/telegram/stop          Остановить
POST   /api/telegram/test          Тестовое сообщение
DELETE /api/telegram               Удалить
```

### Подписки
```
GET    /api/subscriptions/plans          Все тарифы
GET    /api/subscriptions/current        Текущий тариф
GET    /api/subscriptions/history        История подписок
GET    /api/subscriptions/transactions   История платежей
POST   /api/subscriptions/upgrade        Перейти на тариф (+ Stripe)
POST   /api/subscriptions/cancel         Отменить подписку
POST   /api/subscriptions/portal         Stripe Customer Portal
```

### Настройки
```
GET    /api/settings               Все настройки
PATCH  /api/settings               Обновить настройки
```

### Платежи (Stripe Webhook)
```
POST   /api/payments/webhook       Stripe events
```

### Admin (только role=admin)
```
GET    /api/admin/stats                     Статистика платформы
GET    /api/admin/users                     Список пользователей
GET    /api/admin/users/:id                 Детали пользователя
PATCH  /api/admin/users/:id                 Изменить (ban/unban, role)
DELETE /api/admin/users/:id                 Удалить
POST   /api/admin/users/:id/subscription    Назначить подписку
GET    /api/admin/plans                     Все тарифы
PUT    /api/admin/plans/:id                 Создать/обновить тариф
DELETE /api/admin/plans/:id                 Деактивировать тариф
```

---

## Развёртывание (Deploy)

### Шаг 1: Подготовка VPS
```bash
# Ubuntu 22.04+ / Debian 12+
apt update && apt install -y docker.io docker-compose-plugin git
```

### Шаг 2: Клонирование и настройка
```bash
git clone https://your-repo/steambot.git
cd steambot

# Создать .env из шаблона
cp .env.docker .env
nano .env                    # заполнить JWT_SECRET, ADMIN_PASSWORD, APP_URL
```

### Шаг 3: SSL-сертификат (Let's Encrypt)
```bash
mkdir -p ssl/letsencrypt
certbot certonly --standalone -d your-domain.com -d www.your-domain.com
# Скопировать сертификаты в ssl/
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/
cp /etc/letsencrypt/live/your-domain.com/privkey.pem   ssl/

# В nginx.conf заменить your-domain.com на ваш домен
```

### Шаг 4: Запуск
```bash
docker compose up -d --build

# Инициализировать БД (только первый раз)
docker exec steambot-server node db/seeds.js

# Проверить статус
docker compose ps
curl https://your-domain.com/health
```

### Шаг 5: Обновление
```bash
git pull
docker compose up -d --build --no-deps server
```

---

## Разработка локально

```bash
# Установить зависимости сервера
cd server
npm install

# Настроить .env
cp .env.example .env
# Отредактировать .env (минимум: JWT_SECRET)

# Инициализировать БД
node db/seeds.js

# Запустить сервер
npm run dev        # с nodemon
# или
npm start          # без hot-reload

# Сервер доступен на http://localhost:4000
```

---

## Frontend Dashboard — что нужно создать

Существующий React (src/) использует Electron IPC.
Для веб-версии нужно создать `server/dashboard/` на Vite + React:

```bash
cd server
npm create vite@latest dashboard -- --template react
cd dashboard
npm install
```

Создать `src/api/client.js`:
```javascript
const BASE = import.meta.env.VITE_API_URL || '';

export async function request(method, path, body) {
  const token = localStorage.getItem('access_token');
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    // Попытка refresh
    const refreshed = await refreshToken();
    if (!refreshed) { window.location = '/login'; return; }
    return request(method, path, body);
  }
  return res.json();
}

export const api = {
  get:    (p)    => request('GET',    p),
  post:   (p, b) => request('POST',   p, b),
  patch:  (p, b) => request('PATCH',  p, b),
  put:    (p, b) => request('PUT',    p, b),
  delete: (p)    => request('DELETE', p),
};
```

Страницы для создания:
- `/login` — форма входа / регистрации
- `/dashboard` — главный дашборд (статус бота, сводка)
- `/accounts` — Steam аккаунты
- `/campaigns` — кампании
- `/jobs` — история задач
- `/telegram` — настройка TG-бота
- `/settings` — настройки
- `/subscription` — тарифы и оплата
- `/admin` — панель администратора (только role=admin)

---

## Безопасность

- JWT токены с ротацией refresh-токенов
- bcrypt для паролей (12 rounds)
- Rate limiting (100 req/15min общий, 20/15min для auth)
- Helmet.js security headers
- CORS с белым списком origins
- Tenant-изоляция через user_id в каждом запросе к БД
- Admin-only endpoints с role-check middleware
- Stripe webhook signature verification
- SQL injection невозможен (prepared statements)

---

## Roadmap

### Phase 1 (готово ✅)
- [x] Multi-tenant SQLite БД
- [x] JWT аутентификация (register/login/refresh)
- [x] Планы подписок (Free/Starter/Pro/Enterprise)
- [x] REST API (profiles, campaigns, jobs, settings)
- [x] TelegramBotManager (пул ботов на пользователя)
- [x] SteamBotManager (изолированный постер на пользователя)
- [x] Stripe интеграция (checkout + webhooks)
- [x] Admin API
- [x] Docker + Nginx продакшен

### Phase 2 (следующий шаг)
- [ ] React Dashboard (адаптация src/ под HTTP API)
- [ ] Email-верификация при регистрации
- [ ] Telegram Mini App с JWT авторизацией
- [ ] Аналитика и графики (для Pro+)
- [ ] AI-шаблоны через OpenAI/Ollama (для Pro+)

### Phase 3 (масштабирование)
- [ ] PostgreSQL вместо SQLite (>1000 пользователей)
- [ ] Redis для кеша и очередей
- [ ] Worker threads для Playwright (один поток на аккаунт)
- [ ] WebSocket для real-time уведомлений
- [ ] S3/MinIO для хранения скриншотов
- [ ] Метрики (Prometheus + Grafana)
- [ ] CI/CD (GitHub Actions)
