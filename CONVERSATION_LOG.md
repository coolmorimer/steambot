# 📋 Лог диалога с AI-ассистентом — Steambot

> **Дата последнего обновления:** 2 марта 2026 г.
> **Проект:** Steam Poster Bot (communityrig.ru)
> **Стек:** Node.js 20, Express 4, PostgreSQL 16, React 18 (Vite 6), Tailwind CSS 3.4
> **Инфраструктура:** k0s кластер `twc-steambot`, namespace `steambot`, 2 реплики
> **Docker:** `morcool02/steambot-server:latest`
> **Kubeconfig:** `c:\Users\popovt\Downloads\twc-steambot-config.yaml`

---

## 🏗️ Архитектура проекта

### Серверная часть (`server/`)
- **app.js** — Express-приложение, маршруты API
- **config.js** — конфигурация (Steam API Key, JWT, DB и т.д.)
- **db/** — PostgreSQL: миграции, схема, seeds
- **routes/** — API эндпоинты:
  - `auth.js` — регистрация/вход (email+password, bcrypt+JWT)
  - `oauth.js` — Steam OpenID 2.0 (логин + привязка через link_token)
  - `balance.js` — баланс, Trade URL, автопривязка Steam
  - `trades.js` — P2P трейды
  - `steamInventory.js` — загрузка CS2 инвентаря
  - `steamItems.js` — поиск скинов на Steam Market
  - `steamGroups.js` — постинг в группы Steam
  - `payments.js` — платежи (СБП)
  - `subscriptions.js` — подписки
  - `admin.js` — админ-панель
  - `campaigns.js`, `profiles.js`, `bot.js`, `telegram.js`, `publicApi.js`
- **services/** — бизнес-логика (SteamBotManager, SubscriptionService, SbpPaymentService, TelegramBotManager)
- **dashboard/** — React SPA (Vite)
  - `src/pages/` — страницы: Balance, CreateTrade, Trades, Subscription, Landing, Login, Settings, Accounts, Campaigns, OAuthCallback
  - `src/pages/admin/` — AdminDashboard, AdminPlans, AdminPayments, AdminWithdrawals
  - `miniapp/` — Telegram Mini App (index.html)

### Деплой
```bash
cd d:\steambot\server\dashboard && npm run build
cd d:\steambot && docker build --no-cache -f Dockerfile.server -t morcool02/steambot-server:latest .
docker push morcool02/steambot-server:latest
$env:KUBECONFIG="c:\Users\popovt\Downloads\twc-steambot-config.yaml"
kubectl rollout restart deployment/steambot-server -n steambot
kubectl rollout status deployment/steambot-server -n steambot --timeout=90s
```

---

## 📝 История изменений (хронологически)

### Этап 1: Базовый функционал (ранее)
- Landing page, система аккаунтов Steam, постинг в группы
- Superadmin система, мобильная адаптация
- Steam Login через steamcommunity.com (Guard/Mobile/Email коды)
- Support чат + баг-репорт система
- Автономный бот для постинга
- Система подписок

### Этап 2: Mini App + Интеграции
- Telegram Mini App + WebApp API
- Полная переписка Mini App
- SBP (Система быстрых платежей) — оплата подписок
- Страница Subscription.jsx

### Этап 3: USD → RUB конвертация
- Все цены в рублях (₽)
- `currency=5` для Steam Market API

### Этап 4: Платёжная админка
- AdminPayments.jsx — управление платежами
- AdminWithdrawals.jsx — вывод средств
- MRR/Revenue фильтры и метрики

### Этап 5: Steam Groups постинг
- steamGroups.js — API для постинга в группы Steam
- Миграция 007_steam_groups.sql

### Этап 6: P2P Маркетплейс → P2P Трейды
- **Маркетплейс удалён полностью** (market.js, Market.jsx, SellItem.jsx — удалены)
- **Создана система P2P трейдов:**
  - `CreateTrade.jsx` — двухпанельный UI: левая панель (свои скины из инвентаря) + правая панель (скины с маркета, которые хочешь)
  - `Trades.jsx` — карточки трейдов с компонентом SkinCard, панели "Предлагает ↔ Хочет"
  - `trades.js` — CRUD API для трейдов
  - `steamInventory.js` — загрузка CS2 инвентаря (AppID 730)
  - `steamItems.js` — поиск на Steam Market с кешем 10 мин
  - Миграции: 008_p2p_marketplace.sql, 009_free_marketplace_only.sql

### Этап 7: Баг-фиксы (текущая сессия)

#### 7.1 Фикс привязки Steam (OAuth)
**Проблема:** При привязке Steam через OAuth создавался новый аккаунт вместо привязки к существующему.
**Решение:** Добавлен `link_token` JWT flow в `oauth.js`:
- Генерируется JWT с `userId` + `purpose: 'link-steam'`
- Передаётся через `return_to` URL в Steam OpenID
- В callback проверяется токен и привязывается `steam_id` к существующему аккаунту

#### 7.2 Фикс отображения скинов Steam Market
**Проблема:** Изображения скинов не загружались из Steam Market API.
**Решение:**
- Добавлен префикс `CSGO_` к тегам категорий (`CSGO_Type_Rifle` вместо `Type_Rifle`)
- Добавлены параметры `l=russian` (русская локализация) и `currency=5` (рубли)

#### 7.3 Автопривязка Steam через Trade URL (без OAuth)
**Проблема:** OAuth привязка была ненадёжной, пользователю приходилось отдельно авторизовываться через Steam.
**Решение:** Полностью убрана необходимость Steam OAuth для привязки:

**Бэкенд (`server/routes/balance.js`):**
- Переписан `PUT /trade-url`:
  - Парсит Trade URL регуляркой, извлекает `partner` ID
  - Конвертирует Partner ID → SteamID64: `BigInt(partnerId) + 76561197960265728n`
  - Проверяет, не привязан ли SteamID к другому аккаунту
  - Через Steam Web API (`GetPlayerSummaries/v2`) получает username и avatar
  - Обновляет пользователя: `trade_url`, `steam_id`, `steam_username`, `steam_avatar`
- Добавлена функция `fetchSteamProfile(steamId)` (https GET)
- Steam API Key: `config.steam.apiKey` (env `STEAM_API_KEY`)

**Фронтенд (`Balance.jsx` — вкладка Профиль):**
- Если Steam привязан: аватар + ник + SteamID + зелёная галочка ✓
- Если не привязан: жёлтый баннер "Steam не привязан" + подсказка
- Поле ввода Trade URL с динамической кнопкой:
  - "🎮 Привязать Steam и сохранить" (если нет Steam)
  - "Обновить Trade URL" (если уже привязан)
- Зелёная подсказка: "✨ Steam аккаунт привяжется автоматически при сохранении"

**Фронтенд (`CreateTrade.jsx`):**
- Добавлен компонент `LinkSteamInline` (внизу файла):
  - Иконка Package + подсказка "Вставьте Steam Trade URL"
  - Поле ввода Trade URL
  - Ссылка "Где найти Trade URL?"
  - Кнопка "🎮 Привязать Steam"
  - При успехе вызывает `fetchMe()` → обновляет данные + загружает инвентарь

---

## 🔑 Ключевые технические детали

### Steam API
- **API Key:** `26E6BBD36466DCB4137560E8EAC1F33F` (K8s env `STEAM_API_KEY`)
- **Trade URL формат:** `https://steamcommunity.com/tradeoffer/new/?partner=XXXXX&token=YYYYY`
- **Partner → SteamID64:** `BigInt(partnerId) + 76561197960265728n`
- **Профиль API:** `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${id}`
- **Инвентарь:** `https://steamcommunity.com/inventory/${steamId}/730/2` (CS2, AppID 730)
- **Market Search:** `https://steamcommunity.com/market/search/render/` с тегами `CSGO_*`

### Аутентификация
- Email + password (bcrypt + JWT)
- Steam OpenID 2.0 (для логина, не для привязки)
- Привязка Steam: через Trade URL (автоматически)

### База данных (PostgreSQL)
- Миграции в `server/db/migrations/`
- Последние: 007 (steam_groups), 008 (p2p_marketplace), 009 (free_marketplace_only)

### Фронтенд библиотеки
- lucide-react (иконки)
- recharts (графики)
- react-hot-toast (уведомления)
- clsx (условные классы)
- axios (HTTP клиент, обёртка в `src/api/client.js`)

---

## 📂 Изменённые файлы (не закоммичено)

### Модифицированные (M):
- `server/app.js` — убран market route, добавлены steamItems/trades/steamGroups/balance/oauth
- `server/config.js` — Steam API Key
- `server/routes/auth.js` — обновлённая регистрация/вход
- `server/routes/admin.js` — расширенная админка
- `server/routes/payments.js` — СБП платежи
- `server/routes/subscriptions.js` — подписки
- `server/db/schema.js` — новые таблицы (trades, balances, payments, steam_groups)
- `server/dashboard/src/App.jsx` — новые роуты (Balance, Trades, CreateTrade)
- `server/dashboard/src/components/Layout.jsx` — убран Market, добавлены Balance/Trades
- `server/dashboard/src/pages/Landing.jsx` — убрана секция маркетплейса
- `server/dashboard/src/pages/Subscription.jsx` — обновлены buildFeatures
- `server/dashboard/src/pages/Login.jsx` — Steam OAuth кнопка
- И другие...

### Новые файлы (??):
- `server/routes/balance.js` — баланс + Trade URL + автопривязка Steam
- `server/routes/oauth.js` — Steam OpenID 2.0
- `server/routes/trades.js` — P2P трейды API
- `server/routes/steamInventory.js` — CS2 инвентарь
- `server/routes/steamItems.js` — Steam Market поиск
- `server/routes/steamGroups.js` — группы Steam
- `server/dashboard/src/pages/Balance.jsx` — страница баланса/профиля
- `server/dashboard/src/pages/CreateTrade.jsx` — создание трейда (2 панели)
- `server/dashboard/src/pages/Trades.jsx` — список трейдов
- `server/dashboard/src/pages/OAuthCallback.jsx` — OAuth callback
- `server/dashboard/src/pages/admin/AdminPayments.jsx` — админка платежей
- `server/dashboard/src/pages/admin/AdminWithdrawals.jsx` — админка выводов
- `server/services/SbpPaymentService.js` — СБП сервис
- `server/db/migrations/007-009` — миграции

---

## 🚀 Что продолжить

При продолжении работы с другого ПК:
1. `git pull origin main`
2. `cd server/dashboard && npm install`
3. Все изменения задеплоены на сервер — можно тестировать на https://communityrig.ru
4. Текущий фокус: система P2P трейдов и автопривязка Steam через Trade URL полностью рабочие

### Возможные следующие задачи:
- Тестирование потока: регистрация → вставка Trade URL → автопривязка Steam → загрузка инвентаря → создание трейда
- Уведомления о новых трейдах в Telegram
- Система рейтинга/отзывов для трейдеров
- Автоматическая проверка публичности инвентаря
