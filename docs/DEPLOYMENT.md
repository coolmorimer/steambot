# Деплой Steam Poster Bot — Пошаговая инструкция

> Docker → Docker Hub → Kubernetes
> Образ: `morcool02/steambot-server:latest`

---

## Требования

- **Docker Desktop** (Windows/Mac) или Docker Engine (Linux)
- **kubectl** + kubeconfig кластера
- Доступ к Docker Hub: `morcool02` (логин через `docker login`)

---

## 1. Быстрый деплой (после изменений кода)

Три команды — собрать, запушить, задеплоить:

```powershell
# Перейти в корень проекта
cd d:\steambot

# 1. Собрать образ
docker build -f Dockerfile.server -t morcool02/steambot-server:latest .

# 2. Запушить в Docker Hub
docker push morcool02/steambot-server:latest

# 3. Рестартнуть деплоймент (подтянет новый образ)
$env:KUBECONFIG = "c:\Users\popovt\Downloads\twc-steambot-config.yaml"
kubectl rollout restart deployment/steambot-server -n steambot
kubectl rollout status deployment/steambot-server -n steambot --timeout=120s
```

### Проверка после деплоя

```powershell
# Поды Running?
kubectl get pods -n steambot

# Логи без мусора
kubectl logs -n steambot -l app=steambot-server --tail=30 2>&1 | Where-Object { $_ -notmatch "kube-probe|/health" }

# Ошибки?
kubectl logs -n steambot -l app=steambot-server --tail=100 --since=3m 2>&1 | Where-Object { $_ -match "Error|error|CORS|409" }
```

---

## 2. Что входит в Docker-образ

### Dockerfile.server — структура

```
Stage 1 (builder):
  ├── node:20-bookworm-slim
  ├── apt: зависимости Playwright (libnss3, libgbm1, etc.)
  ├── npm install --omit=dev (server/package.json)
  └── npx playwright install chromium --with-deps

Stage 2 (production):
  ├── node:20-bookworm-slim (чистый)
  ├── apt: runtime зависимости + wget + ca-certificates
  ├── COPY node_modules, playwright browsers из builder
  ├── COPY server/        → /app/server/
  ├── COPY *.js           → /app/ (poster.js, db.js, bot.js и т.д.)
  ├── ln -s /app/server/node_modules /app/node_modules  ← ВАЖНО!
  ├── USER steambot (non-root)
  ├── ENV TZ=Europe/Moscow
  ├── HEALTHCHECK /health
  └── CMD ["node", "app.js"]
```

### Зачем симлинк `node_modules`?

Файлы `poster.js`, `inventory.js`, `bot.js` и другие лежат в `/app/` и делают:
```js
const { chromium } = require('playwright');
```
Node.js ищет модули в `/app/node_modules/`, а реальные зависимости в `/app/server/node_modules/`.
Симлинк решает эту проблему без дублирования.

---

## 3. Структура файлов сервера в контейнере

```
/app/
├── poster.js          ← shared модули (require из server/)
├── db.js
├── scheduler.js
├── logger.js
├── bot.js
├── openai.js
├── inventory.js
├── node_modules/      ← symlink → /app/server/node_modules/
├── .cache/ms-playwright/   ← Chromium
│
└── server/
    ├── app.js              ← точка входа
    ├── package.json
    ├── node_modules/       ← реальные зависимости
    ├── db/
    │   ├── migrate.js      ← миграции (init-container)
    │   ├── seeds.js
    │   └── postgresql.js
    ├── routes/
    │   ├── auth.js
    │   ├── profiles.js
    │   ├── campaigns.js
    │   ├── jobs.js
    │   └── telegram.js
    ├── services/
    │   ├── SteamBotManager.js
    │   ├── TelegramBotManager.js
    │   └── SubscriptionService.js
    ├── middleware/
    │   └── auth.js
    └── dashboard/          ← React SPA (собранная)
        └── dist/
```

---

## 4. Docker Compose (локальная разработка)

Для локального запуска с PostgreSQL:

```powershell
# Создать .env
cp .env.example .env
# Отредактировать пароли в .env

# Запуск
docker-compose up -d

# Логи
docker-compose logs -f server

# Остановка
docker-compose down
```

Переменные окружения в `.env`:
```env
DB_PASSWORD=your_strong_password
JWT_SECRET=random_64_chars_secret
ADMIN_EMAIL=admin@steambot.local
ADMIN_PASSWORD=admin_password
APP_URL=http://localhost:4000
```

---

## 5. Kubernetes — обновление конфигурации

### Изменить ENV-переменную (ConfigMap)

```powershell
kubectl edit configmap steambot-config -n steambot
# Изменить нужную переменную
# Сохранить, закрыть

# Рестарт чтобы подхватить
kubectl rollout restart deployment/steambot-server -n steambot
```

### Изменить секрет

```powershell
kubectl create secret generic steambot-secrets \
  --from-literal=DB_PASSWORD='NEW_PASSWORD' \
  --from-literal=JWT_SECRET='NEW_SECRET' \
  -n steambot --dry-run=client -o yaml | kubectl apply -f -

kubectl rollout restart deployment/steambot-server -n steambot
```

### Применить все манифесты

```powershell
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml
```

---

## 6. Rolling Update — как работает

Конфигурация в `deployment.yaml`:
```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1        # макс. 1 дополнительный под при обновлении
    maxUnavailable: 0  # всегда минимум 2 пода работают
```

При `kubectl rollout restart`:
1. Создаётся 3-й под (maxSurge=1) с новым образом
2. Ждём readinessProbe (15с + /health)
3. Старый под получает SIGTERM → preStop sleep 5 → завершение
4. Повтор для 2-го пода
5. В результате: **zero-downtime deployment**

---

## 7. Sticky Sessions (Ingress)

```yaml
nginx.ingress.kubernetes.io/affinity: "cookie"
nginx.ingress.kubernetes.io/session-cookie-name: "STEAMBOT_ROUTE"
```

Зачем: каждый пользователь привязывается к одному поду через cookie. Это нужно потому что:
- JWT-сессия хранит состояние в памяти пода
- Steam-бот (Playwright) работает на конкретном поде
- Telegram-бот polling — только один под ведёт polling

---

## 8. Telegram бот — особенности с 2+ подами

Проблема: Telegram API не поддерживает 2 polling-клиента одновременно (409 Conflict).

Решение в `TelegramBotManager.js`:
1. Оба пода стартуют TG бота при запуске
2. Telegram отдаёт polling одному, второй получает **409**
3. Проигравший под: `stopPolling()` → ретрай через 60 секунд
4. Если первый под упал — второй перехватывает polling
5. Флаг `suppressNotify: true` при авторестарте — нет спама «бот запущен»

---

## 9. Troubleshooting

| Симптом | Причина | Решение |
|---------|---------|---------|
| `CrashLoopBackOff` | Ошибка при запуске (обычно в JS) | `kubectl logs --previous` |
| `Cannot find module` | Отсутствует зависимость | Проверить `package.json`, симлинк |
| `CORS blocked` | Origin не совпадает с host | Проверить `app.js` CORS |
| `409 Conflict` (1 раз) | Нормально — второй под уступил | Ничего не делать |
| `409 Conflict` (спам) | Старая версия без дедупликации | Обновить `TelegramBotManager.js` |
| PVC Pending | Нет StorageClass | `kubectl get sc`, проверить `local-path` |
| ImagePullBackOff | Не удалось скачать образ | `docker push` не был выполнен |

---

## 10. Чеклист перед деплоем

- [ ] Код протестирован локально
- [ ] `docker build` прошёл без ошибок
- [ ] `docker push` завершён (digest получен)
- [ ] Секреты актуальны (`kubectl get secret -n steambot`)
- [ ] ConfigMap актуален (APP_URL, TZ и т.д.)
- [ ] `kubectl rollout status` — deployed successfully
- [ ] Логи чистые (нет CORS, нет CrashLoop)
- [ ] Поды в Running (2/2)
- [ ] /health отвечает 200
