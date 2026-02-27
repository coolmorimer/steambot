# 🤖 GitHub Copilot — Полный контекст проекта Steam Poster Bot

> Этот файл — полная инструкция для AI-ассистента (GitHub Copilot / Claude).
> Содержит архитектуру, историю разработки, деплой-инструкции и все ключевые решения.

---

## 📋 Оглавление

1. [Обзор проекта](#обзор-проекта)
2. [Архитектура и стек](#архитектура-и-стек)
3. [Инфраструктура и деплой](#инфраструктура-и-деплой)
4. [Структура базы данных](#структура-базы-данных)
5. [Ключевые модули](#ключевые-модули)
6. [Frontend (Dashboard)](#frontend-dashboard)
7. [Telegram Mini App](#telegram-mini-app)
8. [API](#api)
9. [Подписки и биллинг](#подписки-и-биллинг)
10. [Известные решения и паттерны](#известные-решения-и-паттерны)
11. [История разработки](#история-разработки)
12. [Деплой-чеклист](#деплой-чеклист)

---

## Обзор проекта

**Steam Poster Bot** — SaaS-сервис для автоматической публикации на форумах Steam Community.

### Что делает:
- Пользователь подключает Steam-аккаунты (QR-код / логин+пароль с Steam Guard)
- Создаёт **кампании** с шаблонами постов и расписанием
- Выбирает **раздел Steam-форума** (Trading Forum, General Discussions) для любой игры
- Бот по расписанию автоматически заходит через Playwright, открывает форум и публикует тему
- Уведомления через Telegram-бота
- Telegram Mini App для мониторинга с телефона
- REST API с ключами для интеграций

### Домен: `communityrig.ru`
### Репозиторий: `https://github.com/coolmorimer/steambot.git`

---

## Архитектура и стек

### Backend
- **Runtime:** Node.js 20
- **Framework:** Express.js
- **БД:** PostgreSQL 16 (prod) / SQLite (electron/dev)
- **Браузерная автоматизация:** Playwright (Chromium headless)
- **Аутентификация:** JWT access + refresh tokens, bcrypt
- **Шаблоны:** Steam-специфичные переменные ({date}, {items_count}, {best_item}, и т.д.)

### Frontend
- **Framework:** React 18 (Vite)
- **Стили:** Tailwind CSS
- **Графики:** recharts
- **Роутинг:** react-router-dom v6
- **Нотификации:** react-hot-toast
- **Иконки:** lucide-react

### Telegram
- **Mini App:** Vanilla HTML/JS (server/dashboard/miniapp/index.html, ~750 строк)
- **Bot:** node-telegram-bot-api с persistent keyboard
- **Авторизация:** API-ключ для Mini App

### Desktop (Electron) — устаревший, не используется в prod
- Electron + Vite
- Лицензирование через license-server

---

## Инфраструктура и деплой

### Кластер
- **Провайдер:** TWC (twc-steambot)
- **Оркестратор:** k0s (Kubernetes)
- **Namespace:** `steambot`
- **Реплик:** 2 (steambot-server)
- **БД:** StatefulSet `steambot-postgres-0`

### Kubeconfig
```
c:\Users\popovt\Downloads\twc-steambot-config.yaml
```

### Docker
```
Image: morcool02/steambot-server:latest
Registry: Docker Hub
```

### Деплой-команды (выполнять последовательно)
```bash
# 1. Собрать фронтенд
cd d:\steambot\server\dashboard && npm run build

# 2. Собрать Docker-образ
cd d:\steambot && docker build --no-cache -f Dockerfile.server -t morcool02/steambot-server:latest .

# 3. Запушить образ
docker push morcool02/steambot-server:latest

# 4. Перезапустить поды
kubectl --kubeconfig c:\Users\popovt\Downloads\twc-steambot-config.yaml rollout restart deployment/steambot-server -n steambot

# 5. Проверить статус
kubectl --kubeconfig c:\Users\popovt\Downloads\twc-steambot-config.yaml get pods -n steambot

# 6. Применить миграции (если есть новые)
kubectl --kubeconfig c:\Users\popovt\Downloads\twc-steambot-config.yaml exec deployment/steambot-server -n steambot -c steambot-server -- node db/migrate.js

# 7. Проверить логи
kubectl --kubeconfig c:\Users\popovt\Downloads\twc-steambot-config.yaml logs deployment/steambot-server -n steambot --tail=50 -c steambot-server
```

### DNS
- `communityrig.ru` → Ingress → steambot-server Service → Pods (port 3000)

---

## Структура базы данных

### Таблицы (PostgreSQL)

| Таблица | Описание |
|---------|----------|
| `subscription_plans` | Тарифные планы (Starter, Pro, Business) |
| `users` | Пользователи (email, password_hash, role) |
| `user_subscriptions` | Подписки (plan_id, status, trial/active/expired) |
| `user_telegram_bots` | Telegram-боты пользователей |
| `profiles` | Steam-аккаунты (name, cookies, target_url, is_active) |
| `campaigns` | Кампании (шаблон, расписание, profile_ids, target_url) |
| `jobs` | Задачи постинга (scheduled_at, status, topic_url, error) |
| `user_settings` | Пользовательские настройки |
| `refresh_tokens` | JWT refresh tokens |
| `password_resets` | Сброс пароля |
| `payment_transactions` | Платежи (placeholder для Stripe) |
| `audit_log` | Аудит действий |
| `email_verifications` | Верификация email |
| `support_tickets` / `support_messages` | Тикеты поддержки |
| `api_keys` | API-ключи для интеграций |
| `_migrations` | Применённые миграции |

### Миграции (server/db/migrations/)
- `001_init.sql` — Все основные таблицы
- `002_server_settings.sql` — Серверные настройки
- `003_support.sql` — Система поддержки
- `004_api_keys.sql` — API-ключи
- `005_unique_pending_jobs.sql` — Уникальный индекс для предотвращения дубликатов задач
- `006_campaign_target_url.sql` — Поле target_url в кампаниях

### Запуск миграций
Миграции НЕ запускаются автоматически при старте. Нужно вручную:
```bash
kubectl exec deployment/steambot-server -n steambot -c steambot-server -- node db/migrate.js
```

---

## Ключевые модули

### `poster.js` (~305 строк)
Playwright-движок для публикации на Steam-форумах.

**Ключевые функции:**
- `createForumPost(profile, title, body, options)` → URL темы
- `addProfileInteractive(name)` → cookies[]

**Логика постинга:**
1. Запуск Chromium (headless, реальный User-Agent Chrome 121)
2. Загрузка cookies из профиля
3. Переход на `targetUrl` (приоритет: `options.targetUrl` > `profile.target_url` > CS2 Trading)
4. Проверка сессии (login redirect? → SESSION_EXPIRED)
5. Клик по «Новое обсуждение» (несколько CSS-селекторов)
6. Заполнение заголовка и тела
7. Отправка формы
8. Ожидание редиректа на URL новой темы
9. Рандомные задержки для имитации живого пользователя

**Обработка ошибок:**
- `SESSION_EXPIRED` → деактивация профиля, уведомление в TG
- Скриншоты при ошибках в `logs/`
- Retry механизм (по умолчанию 2 попытки)

### `server/services/SteamBotManager.js` (~520 строк)
Управляет запуском бота и обработкой очереди задач.

**Важно (мульти-реплика):**
- 2 K8s реплики используют in-memory `_bots` Map
- Статус бота сохраняется в БД: `db.setSetting('bot_running', '1')`
- `getStatus()` читает DB, НЕ вызывает `start()` (иначе оба пода начнут постить)
- `getDueJobs()` использует `FOR UPDATE SKIP LOCKED` для атомарного захвата задач
- `addJob()` использует `ON CONFLICT DO NOTHING` для предотвращения дубликатов

### `server/services/SteamLoginManager.js` (~450 строк)
Универсальная система авторизации Steam.

**Поддерживает:**
- QR-код логин (основной метод)
- Логин/пароль + Steam Guard (mobile authenticator, email code)
- Автоопределение метода подтверждения

### `server/services/SubscriptionService.js`
Управление подписками.

**Логика:**
- Trial: 3 дня бесплатно при первой регистрации
- После trial — статус `expired`, нельзя самостоятельно менять план
- Админ может добавлять дни к подписке
- Stripe placeholder (Stripe отключён, показывается "Оплатить" с lock)

### `server/services/TelegramBotManager.js`
Telegram-бот с persistent keyboard.

**Важно (мульти-реплика):**
- Только одна реплика держит polling (через DB lock `tg_bot_owner`)
- Другая реплика ретраит каждые 60 секунд
- Перехват управления при падении основной реплики

---

## Frontend (Dashboard)

### Страницы (server/dashboard/src/pages/)

| Файл | Описание |
|------|----------|
| `Landing.jsx` (~740 строк) | Лендинг с aurora-orb фоном, pricing, FAQ |
| `Dashboard.jsx` | Главная панель со статистикой |
| `Campaigns.jsx` (~920 строк) | Управление кампаниями, ForumPicker |
| `Accounts.jsx` | Steam-аккаунты (QR/password логин) |
| `Activity.jsx` | Журнал задач (Active, pending, done, failed) |
| `Settings.jsx` | Настройки пользователя |
| `Subscription.jsx` | Подписки и тарифы |
| `Telegram.jsx` | Настройка TG-бота + Mini App Guide |
| `ApiKeys.jsx` | Управление API-ключами |
| `LicenseGate.jsx` | Шлюз лицензии (legacy) |

### Админ-страницы (server/dashboard/src/pages/admin/)
| Файл | Описание |
|------|----------|
| `AdminDashboard.jsx` | Обзор: пользователи, подписки, задачи |
| `AdminConfig.jsx` | Настройки сервера |
| `AdminSupport.jsx` | Тикеты поддержки |

### Компоненты
- `Layout.jsx` — Sidebar + topbar layout
- `SupportWidget.jsx` — Виджет поддержки (кнопка + чат)

### Стили
- Tailwind CSS с кастомными brand-цветами: `blue-500=#3b82f6, 600=#2563eb, 700=#1d4ed8`
- Aurora-анимации в `index.css` (aurora-1/2/3 keyframes с hue-rotate/blur/scale)
- `card`, `btn-primary`, `btn-ghost`, `badge-*` — utility-классы

### Landing Page — дизайн-решения
- 3 aurora orb'а (820/920/700px) с анимацией (38/47/53 сек цикл)
- Hero-бейджи — стеклянные карточки с glow при hover
- Features — 6 карточек с цветными бордерами и glow
- Pricing — 3 колонки (Free план удалён), toggle monthly/yearly

---

## Telegram Mini App

**Файл:** `server/dashboard/miniapp/index.html` (~750 строк)
**URL:** `https://communityrig.ru/miniapp/`

### Вкладки:
1. **Обзор** — Статистика (задачи сегодня, всего, аккаунтов) + быстрые действия + последние задания
2. **Кампании** — Список кампаний с toggle активности
3. **Аккаунты** — Список Steam-аккаунтов
4. **Задания** — Полный журнал задач со статистикой

### Авторизация:
- API-ключ передаётся через `Telegram.WebApp.initData`
- Сервер проверяет HMAC подпись Telegram

### Кэширование:
- `cache: 'no-store'` + `_t=Date.now()` на всех запросах
- Серверные заголовки `Cache-Control: no-cache, no-store`
- Auto-refresh каждые 30 секунд

### Время задач:
- Показывается `scheduled_at` (запланированное время), не `created_at`

---

## API

### Внутренний API (`/api/`)
- Авторизация: JWT Bearer token
- Используется Dashboard и Mini App

### Публичный API v1 (`/api/v1/`)
- Авторизация: API-ключ (header `X-API-Key` или query `?api_key=`)
- 12+ эндпоинтов: campaigns, profiles, jobs, overview, bot control

### Маршруты (server/routes/)
| Файл | Базовый путь | Описание |
|------|-------------|----------|
| `auth.js` | `/api/auth` | Регистрация, логин, refresh, reset |
| `profiles.js` | `/api/profiles` | CRUD Steam-аккаунтов |
| `campaigns.js` | `/api/campaigns` | CRUD кампаний |
| `jobs.js` | `/api/jobs` | Журнал задач |
| `subscriptions.js` | `/api/subscriptions` | Подписки |
| `telegram.js` | `/api/telegram` | Telegram-бот |
| `admin.js` | `/api/admin` | Админ-панель |
| `support.js` | `/api/support` | Тикеты поддержки |
| `apikeys.js` | `/api/api-keys` | API-ключи |
| `publicApi.js` | `/api/v1` | Публичный API |

---

## Подписки и биллинг

### Тарифные планы
| План | Аккаунты | Кампании | Постов/день | Доп. фичи |
|------|----------|----------|-------------|-----------|
| Starter | 3 | 2 | 10 | TG-бот |
| Pro | 10 | 5 | 50 | + Mini App, AI шаблоны, аналитика |
| Business | -1 (∞) | -1 (∞) | -1 (∞) | + API, приоритетная поддержка |

### Логика
1. Регистрация → trial 3 дня на выбранном плане
2. Trial истёк → `status: expired`, кнопка "Оплатить" (Stripe отключён)
3. Админ может: добавить дни, сменить план, изменить статус
4. `checkLimit` middleware проверяет лимиты перед созданием ресурсов

---

## Известные решения и паттерны

### Мульти-реплика (2 пода)
**Проблема:** Оба пода имеют in-memory состояние, но должны координироваться.

**Решения:**
1. **Статус бота** → `db.setSetting('bot_running')` — единый источник правды
2. **Захват задач** → `FOR UPDATE SKIP LOCKED` — атомарный захват без дубликатов
3. **Уникальность задач** → `UNIQUE INDEX idx_jobs_unique_pending ON jobs (user_id, campaign_id, profile_id) WHERE status='pending'`
4. **TG-бот polling** → DB lock `tg_bot_owner`, только один под держит polling

### Steam-логин
**Проблема:** Steam имеет разные методы 2FA.

**Решение:** `SteamLoginManager` с универсальным flow:
1. Начинаем QR-логин (показываем QR-код на фронте)
2. Если пользователь выбрал логин/пароль → проверяем, нужен ли Guard
3. Guard может быть: mobile authenticator (авто-подтверждение), email code, device confirmation
4. Фронт показывает соответствующий UI для каждого типа

### Кэширование Mini App
**Проблема:** Telegram WebView агрессивно кэширует GET-запросы.

**Решение:** Тройная защита:
1. `cache: 'no-store'` в fetch()
2. `_t=Date.now()` query parameter
3. Серверные заголовки `Cache-Control: no-cache, no-store, must-revalidate`

### target_url в кампаниях
**Проблема:** Раньше URL форума хранился только в профиле, нельзя было постить в разные форумы.

**Решение:** `target_url` в кампании с приоритетом:
`campaign.target_url` > `profile.target_url` > дефолт CS2 Trading

---

## История разработки

### Хронология (февраль 2026)

1. **Базовый проект** — Electron-приложение для десктопа (poster.js, bot.js, scheduler.js)
2. **Серверная миграция** — Переезд на Express + PostgreSQL + Docker + K8s
3. **Landing page** — Лендинг с анимациями, pricing grid, FAQ
4. **Superadmin** — Система ролей admin/superadmin
5. **Mobile responsive** — Адаптив для мобильных
6. **Steam Login** — Полная переписка: QR-код + Guard + email/mobile code
7. **Support система** — Тикеты + чат + баг-репорты + админ-страница
8. **Автономный бот** — SteamBotManager с cron-очередью
9. **Dashboard UI** — Красивый Dashboard со статистикой, графиками recharts
10. **Подписки** — Trial 3 дня, блокировка после trial, payment placeholder
11. **API + Mini App** — Публичный API v1 + Telegram Mini App (~750 строк)
12. **Mini App Guide** — Инструкция по настройке Mini App в Telegram
13. **Фикс бота (мульти-реплика)** — DB fallback для статуса, предотвращение дубликатов задач
14. **Кэширование Mini App** — cache-busting для Telegram WebView
15. **Landing обновления** — Aurora orb-фон, увеличенный текст, glow-карточки features
16. **ForumPicker** — Выбор раздела Steam-форума в кампании (8 игр, Trading/General)
17. **Фикс времени Mini App** — `scheduled_at` вместо `created_at`

---

## Деплой-чеклист

### Перед деплоем
- [ ] Все файлы сохранены
- [ ] Нет синтаксических ошибок в JSX (проверить `npm run build`)
- [ ] Если есть новые миграции — подготовить `server/db/migrations/NNN_*.sql`

### Деплой
```bash
# Шаг 1: Сборка фронтенда
cd d:\steambot\server\dashboard && npm run build

# Шаг 2: Docker build
cd d:\steambot && docker build --no-cache -f Dockerfile.server -t morcool02/steambot-server:latest .

# Шаг 3: Docker push
docker push morcool02/steambot-server:latest

# Шаг 4: K8s rollout
kubectl --kubeconfig c:\Users\popovt\Downloads\twc-steambot-config.yaml rollout restart deployment/steambot-server -n steambot

# Шаг 5: Подождать 20-30 секунд, проверить поды
kubectl --kubeconfig c:\Users\popovt\Downloads\twc-steambot-config.yaml get pods -n steambot

# Шаг 6: Применить миграции (если есть новые)
kubectl --kubeconfig c:\Users\popovt\Downloads\twc-steambot-config.yaml exec deployment/steambot-server -n steambot -c steambot-server -- node db/migrate.js
```

### После деплоя
- [ ] Проверить health-check: `curl https://communityrig.ru/health`
- [ ] Проверить лендинг: `https://communityrig.ru`
- [ ] Проверить логин: `https://communityrig.ru/login`
- [ ] Проверить Mini App через Telegram

### Откат
```bash
# Посмотреть историю ревизий
kubectl --kubeconfig c:\Users\popovt\Downloads\twc-steambot-config.yaml rollout history deployment/steambot-server -n steambot

# Откатить на предыдущую
kubectl --kubeconfig c:\Users\popovt\Downloads\twc-steambot-config.yaml rollout undo deployment/steambot-server -n steambot
```

---

## Полезные команды

### Логи
```bash
# Логи последнего пода
kubectl --kubeconfig c:\Users\popovt\Downloads\twc-steambot-config.yaml logs deployment/steambot-server -n steambot --tail=100 -c steambot-server

# Логи с фильтром
kubectl ... logs ... | Select-String -Pattern "error|Error|migration"
```

### Отладка
```bash
# Exec в контейнер
kubectl --kubeconfig c:\Users\popovt\Downloads\twc-steambot-config.yaml exec -it deployment/steambot-server -n steambot -c steambot-server -- sh

# Проверить файлы
kubectl ... exec ... -- ls db/migrations/

# Запустить Node.js скрипт
kubectl ... exec ... -- node -e "console.log('test')"
```

### БД
```bash
# Подключиться к PostgreSQL
kubectl --kubeconfig c:\Users\popovt\Downloads\twc-steambot-config.yaml exec -it steambot-postgres-0 -n steambot -- psql -U steambot -d steambot
```

---

*Последнее обновление: 27 февраля 2026*
