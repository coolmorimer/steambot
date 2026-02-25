# Деплой на Timeweb Kubernetes

Пошаговая инструкция по развёртыванию Steam Poster Bot SaaS на Timeweb Cloud Kubernetes.

---

## Предварительные требования

| Инструмент | Версия | Установка |
|---|---|---|
| kubectl | ≥ 1.28 | https://kubernetes.io/docs/tasks/tools/ |
| Docker | ≥ 24 | https://docs.docker.com/install/ |
| Timeweb CLI | latest | https://timeweb.cloud/docs/cli |

---

## 1. Настройка kubectl для Timeweb

1. Скачайте kubeconfig в личном кабинете Timeweb Cloud → Kubernetes → ваш кластер → «Скачать kubeconfig»
2. Примените конфиг:
   ```bash
   export KUBECONFIG=~/Downloads/timeweb-kube-config.yaml
   kubectl get nodes   # должны отображаться ноды кластера
   ```

---

## 2. Сборка и публикация Docker-образа

Timeweb предоставляет встроенный container registry (`registry.timeweb.com`).

```bash
# Войти в registry
docker login registry.timeweb.com

# Собрать образ
docker build -f Dockerfile.server -t registry.timeweb.com/YOUR_ORG/steambot-server:latest .

# Запушить
docker push registry.timeweb.com/YOUR_ORG/steambot-server:latest
```

> ⚠️ Замените `YOUR_ORG` на название вашей организации в Timeweb.  
> Обновите `image:` в [k8s/deployment.yaml](deployment.yaml) на реальное имя образа.

---

## 3. Секрет для доступа к registry

```bash
kubectl create secret docker-registry timeweb-registry-secret \
  --namespace steambot \
  --docker-server=registry.timeweb.com \
  --docker-username=YOUR_TW_LOGIN \
  --docker-password=YOUR_TW_PASSWORD \
  --docker-email=YOUR_EMAIL
```

---

## 4. Применение манифестов

### 4.1 Создать namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

### 4.2 Создать ConfigMap (несекретные переменные)

Отредактируйте [k8s/configmap.yaml](configmap.yaml) при необходимости (например, `APP_URL`), затем:

```bash
kubectl apply -f k8s/configmap.yaml
```

### 4.3 Создать Secret (чувствительные данные)

> ⚠️ **Никогда не коммитьте реальные значения в git!**

Вариант A — через kubectl (рекомендуется):
```bash
kubectl create secret generic steambot-secrets \
  --namespace steambot \
  --from-literal=DB_PASSWORD='your_strong_db_password' \
  --from-literal=JWT_SECRET='your_random_32_char_secret' \
  --from-literal=ADMIN_PASSWORD='your_admin_password' \
  --from-literal=STRIPE_SECRET_KEY='' \
  --from-literal=STRIPE_WEBHOOK_SECRET='' \
  --from-literal=SMTP_USER='' \
  --from-literal=SMTP_PASS=''
```

Вариант B — через шаблон (заполните base64-значения, затем apply):
```bash
# Получить base64:
echo -n 'your_password' | base64

# Применить:
kubectl apply -f k8s/secret.yaml
```

### 4.4 Запустить PostgreSQL

```bash
kubectl apply -f k8s/postgres.yaml

# Подождать готовности
kubectl rollout status statefulset/steambot-postgres -n steambot
```

### 4.5 Запустить приложение

```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
```

### 4.6 Настроить Ingress + SSL

1. Убедитесь, что в кластере установлен `nginx-ingress` и `cert-manager`
2. Отредактируйте [k8s/ingress.yaml](ingress.yaml) — замените `your-domain.com` на реальный домен
3. Примените:
   ```bash
   kubectl apply -f k8s/ingress.yaml
   ```

Или применить всё сразу:
```bash
kubectl apply -f k8s/
```

---

## 5. Миграции и seeds

**Миграции** запускаются автоматически через initContainer при каждом деплое.

При первом запуске нужно выполнить seeds (создать планы и admin-аккаунт):

```bash
kubectl exec -n steambot deploy/steambot-server -- node db/seeds.js
```

---

## 6. Проверка работоспособности

```bash
# Статус подов
kubectl get pods -n steambot

# Логи сервера
kubectl logs -n steambot deploy/steambot-server -f

# Логи PostgreSQL
kubectl logs -n steambot statefulset/steambot-postgres -f

# Тест health endpoint
kubectl exec -n steambot deploy/steambot-server -- wget -qO- http://localhost:4000/health

# Описание пода (события, ошибки)
kubectl describe pod -n steambot -l app=steambot-server
```

---

## 7. Обновление приложения (CI/CD)

```bash
# 1. Собрать и запушить новый образ
docker build -f Dockerfile.server -t registry.timeweb.com/YOUR_ORG/steambot-server:v1.2.3 .
docker push registry.timeweb.com/YOUR_ORG/steambot-server:v1.2.3

# 2. Обновить образ в Deployment (rolling update)
kubectl set image deployment/steambot-server \
  steambot-server=registry.timeweb.com/YOUR_ORG/steambot-server:v1.2.3 \
  -n steambot

# 3. Следить за rollout
kubectl rollout status deployment/steambot-server -n steambot

# 4. Откатить при необходимости
kubectl rollout undo deployment/steambot-server -n steambot
```

---

## 8. Структура файлов K8s

```
k8s/
├── namespace.yaml      — Namespace steambot
├── configmap.yaml      — Несекретные env-переменные (DB_TYPE, APP_URL, ...)
├── secret.yaml         — Шаблон секретов (пароли, ключи API)
├── postgres.yaml       — PostgreSQL StatefulSet + PVC + Service
├── deployment.yaml     — Deployment сервера + PVC для /app/data
├── service.yaml        — ClusterIP Service (port 80 → 4000)
├── hpa.yaml            — HorizontalPodAutoscaler (min 2, max 10)
├── ingress.yaml        — Ingress с SSL (cert-manager)
└── README-k8s.md       — Эта инструкция
```

---

## 9. Использование Timeweb Managed PostgreSQL (альтернатива)

Вместо `k8s/postgres.yaml` можно подключить **управляемую БД** Timeweb:

1. Создайте кластер PostgreSQL в личном кабинете → Базы данных
2. Скопируйте host, port, user, password
3. Обновите `k8s/configmap.yaml`:
   ```yaml
   DB_HOST: "your-cluster.timeweb.cloud"
   DB_PORT: "5432"
   DB_SSL: "true"
   ```
4. Обновите `k8s/secret.yaml` с новым паролем
5. **Не применяйте** `k8s/postgres.yaml` (StatefulSet не нужен)

---

## 10. Переменные окружения

| Переменная | Источник | Описание |
|---|---|---|
| `DB_TYPE` | configmap | `postgresql` или `sqlite` |
| `DB_HOST` | configmap | Хост PostgreSQL |
| `DB_PORT` | configmap | Порт (5432) |
| `DB_NAME` | configmap | Имя базы |
| `DB_USER` | configmap | Пользователь |
| `DB_SSL` | configmap | Включить SSL |
| `DB_POOL_MAX` | configmap | Макс. соединений в пуле |
| `APP_URL` | configmap | Публичный URL приложения |
| `TRIAL_DAYS` | configmap | Дней в пробном периоде |
| `DB_PASSWORD` | secret | Пароль PostgreSQL |
| `JWT_SECRET` | secret | Секрет для JWT токенов |
| `ADMIN_PASSWORD` | secret | Пароль admin-аккаунта |
| `STRIPE_SECRET_KEY` | secret | Stripe API ключ |
| `SMTP_PASS` | secret | Пароль почтового сервера |
