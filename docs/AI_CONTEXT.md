# AI Context — Инструкция для ИИ-ассистента

> Этот файл содержит полный контекст проекта для продолжения работы
> в новой сессии AI (GitHub Copilot / Claude / ChatGPT).
>
> **Скопируй содержимое этого файла в начало разговора с AI.**

---

## 1. О проекте

**Steam Poster Bot** — SaaS-платформа для автоматической публикации контента в Steam Community.

- **Технологии**: Node.js 20, Express, PostgreSQL 16, Playwright (Chromium), React (Vite)
- **Инфра**: Kubernetes (k0s), Docker, nginx-ingress, cert-manager
- **Реестр**: Docker Hub `morcool02/steambot-server:latest`
- **Домен**: communityrig.ru → 81.19.135.78 (nginx-ingress LoadBalancer)

---

## 2. Структура проекта

```
d:\steambot/
├── server/                    ← SaaS сервер (Node.js + Express)
│   ├── app.js                 ← Точка входа, CORS, autoRestoreBots
│   ├── package.json
│   ├── db/
│   │   ├── migrate.js         ← Миграции PostgreSQL
│   │   ├── seeds.js
│   │   └── postgresql.js      ← Запросы к БД
│   ├── routes/
│   │   ├── auth.js            ← JWT авторизация
│   │   ├── profiles.js        ← CRUD Steam-профилей
│   │   ├── campaigns.js       ← CRUD кампаний
│   │   ├── jobs.js            ← CRUD задач публикации
│   │   └── telegram.js        ← API TG бота (start/stop/status)
│   ├── services/
│   │   ├── SteamBotManager.js ← Playwright: публикация в Steam
│   │   ├── TelegramBotManager.js ← TG-бот (polling + меню)
│   │   └── SubscriptionService.js ← Подписки / лицензии
│   ├── middleware/
│   │   └── auth.js            ← JWT middleware
│   └── dashboard/             ← React SPA (собранная)
│       └── dist/
│
├── poster.js                  ← Модуль публикации (Playwright)
├── db.js                      ← Общий DB-модуль
├── scheduler.js               ← Планировщик задач
├── logger.js                  ← Логирование
├── bot.js                     ← Steam Bot логика
├── openai.js                  ← OpenAI интеграция
├── inventory.js               ← Steam инвентарь (Playwright)
│
├── Dockerfile.server          ← Multi-stage Docker build
├── docker-compose.yml         ← Локальная разработка
│
├── k8s/                       ← Kubernetes манифесты
│   ├── namespace.yaml
│   ├── configmap.yaml         ← ENV (PORT, DB_HOST, TZ, APP_URL)
│   ├── secret.yaml            ← Секреты (DB_PASSWORD, JWT_SECRET)
│   ├── postgres.yaml          ← PostgreSQL StatefulSet
│   ├── deployment.yaml        ← steambot-server (2 реплики)
│   ├── service.yaml           ← ClusterIP :80 → :4000
│   ├── ingress.yaml           ← nginx + TLS + sticky sessions
│   ├── hpa.yaml               ← HPA (2-10 pods)
│   └── clusterissuer.yaml     ← Let's Encrypt
│
├── src/                       ← Desktop Electron UI (не SaaS)
├── config/
│   └── config.json            ← Локальная конфигурация
│
└── docs/
    ├── KUBERNETES.md           ← Инструкция K8s
    ├── DEPLOYMENT.md           ← Инструкция деплоя
    └── AI_CONTEXT.md           ← Этот файл
```

---

## 3. Инфраструктура Kubernetes

### Кластер
| Параметр | Значение |
|----------|----------|
| Имя кластера | `twc-steambot` |
| Тип | k0s |
| Ноды | 2 worker |
| API Server | `85.239.63.177:6443` |
| Kubeconfig (локально) | `c:\Users\popovt\Downloads\twc-steambot-config.yaml` |
| Namespace | `steambot` |
| External IP (Ingress) | `81.19.135.78` |
| Домен | `communityrig.ru` |
| TZ | `Europe/Moscow` |

### Pods
- `steambot-server` — 2 реплики (Deployment)
- `steambot-postgres-0` — 1 реплика (StatefulSet)

### Важные детали
- **imagePullPolicy: Always** — при рестарте всегда тянет latest
- **Sticky Sessions** — cookie `STEAMBOT_ROUTE`, нужен для JWT + Playwright state
- **Init-containers**: wait-for-postgres → run-migrations → app.js
- **HPA**: 2-10 подов, скейл по CPU (70%) / Memory (80%)

---

## 4. Команды деплоя

```powershell
$env:KUBECONFIG = "c:\Users\popovt\Downloads\twc-steambot-config.yaml"

# Сборка + пуш
cd d:\steambot
docker build -f Dockerfile.server -t morcool02/steambot-server:latest .
docker push morcool02/steambot-server:latest

# Деплой
kubectl rollout restart deployment/steambot-server -n steambot
kubectl rollout status deployment/steambot-server -n steambot --timeout=120s

# Проверка
kubectl get pods -n steambot
kubectl logs -n steambot -l app=steambot-server --tail=30 2>&1 | Where-Object { $_ -notmatch "kube-probe|/health" }
```

---

## 5. Решённые проблемы (база знаний)

### 5.1. Cannot find module 'playwright'

**Симптом**: `/app/inventory.js` — `Error: Cannot find module 'playwright'`
**Причина**: `inventory.js` лежит в `/app/`, а `node_modules` в `/app/server/node_modules/`
**Решение**: Симлинк в Dockerfile:
```dockerfile
RUN ln -s /app/server/node_modules /app/node_modules
```

### 5.2. CORS блокирует DELETE/PATCH запросы

**Симптом**: Браузер → `[Error] CORS blocked`, удаление кампаний/задач не работает
**Причина**: Статический CORS origin разрешал только `config.appUrl` (домен), но доступ по IP `http://81.19.135.78`
**Решение**: Динамический CORS в `server/app.js` — разрешает `http(s)://<req.headers.host>`:
```javascript
app.use(cors((req, callback) => {
  const origin = req.headers.origin || '';
  const host   = req.headers.host   || '';
  const allowed = [
    'http://localhost:3000', 'http://localhost:5173', 'http://localhost:4000',
    config.appUrl,
    `http://${host}`,
    `https://${host}`,
  ].filter(Boolean);
  const ok = !origin || allowed.some(a => origin === a || origin.startsWith(a.replace(/\/$/, '') + '/'));
  callback(null, { origin: ok, credentials: true, methods: [...], allowedHeaders: [...] });
}));
```

### 5.3. TG бот: 409 Conflict спам

**Симптом**: 2 пода оба пытаются вести TG polling → лавина `409 Conflict` в логах
**Причина**: Telegram API не поддерживает 2 polling-клиента одновременно
**Решение** (`TelegramBotManager.js`):
- Флаг `_409handled` — обрабатываем первый 409, остальные игнорируем
- `stopPolling()` после 409
- Ретрай через 60 секунд (если основной под упал — перехватим)

### 5.4. TG бот: спам «запущен» при рестарте подов

**Симптом**: При каждом деплое/рестарте — сообщение «Bot запущен» в TG
**Причина**: `autoRestoreBots()` в `app.js` запускает TG бот при старте пода
**Решение**:
- `start(userId, config, { suppressNotify: true })` — подавляет уведомление
- В `autoRestoreBots()` передаётся `{ suppressNotify: true }`

### 5.5. SubscriptionService: async PG вместо sync SQLite

**Симптом**: `CrashLoopBackOff` после добавления `TZ=Europe/Moscow`
**Причина**: `config.getCampaigns?.()` возвращает Promise (PG), а не массив (SQLite)
**Решение**: `await Promise.resolve(config.getCampaigns?.() || [])` — работает и с sync и async

### 5.6. TZ=Europe/Moscow

**Симптом**: Расписание кампаний срабатывает не в то время
**Решение**: `ENV TZ=Europe/Moscow` в Dockerfile + `TZ: "Europe/Moscow"` в configmap

---

## 6. Ключевые файлы и что в них менять

### server/app.js
- **CORS**: динамический, на основе `req.headers.host` (строка ~59)
- **autoRestoreBots()**: восстанавливает TG и Steam ботов при старте пода (строка ~200)
- **Routes**: auth, profiles, campaigns, jobs, telegram
- **suppressNotify**: true при автовосстановлении (строка ~234)

### server/services/TelegramBotManager.js
- **start()**: создаёт TG polling-бот, обработка 409, Reply Keyboard
- **Меню**: sendMainMenu, sendAccountsList, sendCampaignsList, sendJobsList, sendStatusMsg, sendHelp
- **handleCallback()**: inline-кнопки (bot:start/stop, accounts:list, campaigns:list, jobs:list/stats)
- **notifyJobResult()**: уведомление о публикации
- **notifyExpiredAccount()**: уведомление о logout Steam-аккаунта

### server/services/SteamBotManager.js
- Управление Playwright-ботами: запуск, остановка, публикация
- **start()**: авторизация Steam, планирование задач
- **generatePendingJobs()**: создаёт задачи по расписанию кампаний

### Dockerfile.server
- Multi-stage: builder (npm install + playwright) → production
- Симлинк node_modules, non-root user, healthcheck
- **Если добавляешь новый shared *.js** — добавь `COPY newfile.js ./` в Dockerfile!

### k8s/configmap.yaml
- APP_URL, TZ, DB_HOST, TRIAL_DAYS, STRIPE_ENABLED

### k8s/ingress.yaml
- Sticky sessions (affinity: cookie)
- TLS (cert-manager + Let's Encrypt)
- Домены: communityrig.ru, www.communityrig.ru

---

## 7. Частые задачи

### Добавить новый API-роут

1. Создать файл `server/routes/newroute.js`
2. Подключить в `server/app.js`: `app.use('/api/newroute', require('./routes/newroute'));`
3. Собрать + деплоить

### Добавить новый shared-модуль (*.js в корне)

1. Создать файл в корне (`newmodule.js`)
2. **Добавить в Dockerfile.server**: `COPY newmodule.js ./`
3. Собрать + деплоить

### Изменить TG-бота

Файл: `server/services/TelegramBotManager.js`
- Reply Keyboard (нижнее меню): константа `REPLY_KB`
- Inline-кнопки: `sendMainMenu()`, `handleCallback()`
- Команды: обрабатываются в `tgBot.on('message', ...)`

### Миграция БД

Миграции запускаются автоматически init-контейнером при каждом деплое.
Файл миграций: `server/db/migrate.js`

```powershell
# Ручной запуск миграции
kubectl exec -it <pod-name> -n steambot -- node db/migrate.js
```

### Посмотреть БД

```powershell
kubectl exec -it steambot-postgres-0 -n steambot -- psql -U steambot -d steambot
```

---

## 8. Ограничения и нюансы

1. **Telegram Bot Polling**: только один под ведёт polling, второй — standby (retry 60s)
2. **Playwright**: headless Chromium в контейнере, нужны специфические apt-пакеты
3. **PVC ReadWriteOnce**: `/app/server/data` доступен только с одной ноды — если поды на разных нодах, данные будут различаться
4. **Docker Hub**: образы публичные (`morcool02/steambot-server`)
5. **Sticky Sessions**: обязательны — без них JWT и Playwright-состояние теряются
6. **Кодировка логов**: в PowerShell кириллица отображается как mojibake (UTF-8 vs CP866)

---

## 9. Контакты и доступы

| Ресурс | Значение |
|--------|----------|
| GitHub | https://github.com/coolmorimer/steambot |
| Docker Hub | `morcool02/steambot-server` |
| Kubeconfig | `c:\Users\popovt\Downloads\twc-steambot-config.yaml` |
| External IP | `81.19.135.78` |
| Домен | `communityrig.ru` |
| Dashboard | `http://81.19.135.78/` или `https://communityrig.ru/` |

---

## 10. Шаблон промпта для начала сессии

Скопируй и вставь при начале новой сессии с AI:

```
Я работаю над проектом Steam Poster Bot (SaaS). 
Контекст проекта — в файле docs/AI_CONTEXT.md.

Инфра:
- K8s кластер twc-steambot (k0s, 2 worker-ноды)
- kubeconfig: c:\Users\popovt\Downloads\twc-steambot-config.yaml
- namespace: steambot, 2 пода steambot-server + 1 PostgreSQL
- Docker: morcool02/steambot-server:latest
- External IP: 81.19.135.78, домен: communityrig.ru
- TZ: Europe/Moscow

Пожалуйста, прочитай docs/AI_CONTEXT.md для полного контекста.
```
