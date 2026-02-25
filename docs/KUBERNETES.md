# Kubernetes — Руководство по работе с кластером

> Проект: **Steam Poster Bot (SaaS)**
> Кластер: `twc-steambot` · k0s · 2 worker-ноды
> Namespace: `steambot`

---

## 1. Подключение к кластеру

### Kubeconfig

Файл kubeconfig хранится локально:

```
c:\Users\popovt\Downloads\twc-steambot-config.yaml
```

Во **всех** PowerShell-командах ниже перед `kubectl` нужно выставить переменную:

```powershell
$env:KUBECONFIG = "c:\Users\popovt\Downloads\twc-steambot-config.yaml"
```

Или добавить в `$PROFILE`:

```powershell
# файл: $PROFILE (Microsoft.PowerShell_profile.ps1)
$env:KUBECONFIG = "c:\Users\popovt\Downloads\twc-steambot-config.yaml"
```

### Проверка подключения

```powershell
kubectl cluster-info
kubectl get nodes -o wide
```

---

## 2. Архитектура кластера

```
┌──────────────── Kubernetes (k0s) ────────────────┐
│                                                    │
│  namespace: steambot                               │
│                                                    │
│  ┌──────────────────┐   ┌──────────────────┐       │
│  │  steambot-server  │   │  steambot-server  │      │
│  │  (pod 1 / replica)│   │  (pod 2 / replica)│      │
│  │  :4000            │   │  :4000            │      │
│  └────────┬──────────┘   └────────┬──────────┘      │
│           └────────┬─────────────┘                  │
│                    ▼                                │
│         Service (ClusterIP :80)                     │
│                    │                                │
│                    ▼                                │
│          Ingress (nginx)                            │
│     sticky sessions (cookie)                        │
│     communityrig.ru + TLS                           │
│                    │                                │
│                    ▼                                │
│         ┌──────────────────┐                        │
│         │  PostgreSQL 16    │                        │
│         │  (StatefulSet x1) │                        │
│         │  PVC 10Gi         │                        │
│         └──────────────────┘                        │
│                                                    │
└────────────────────────────────────────────────────┘
          │
          ▼
  External IP: 81.19.135.78 (nginx-ingress LoadBalancer)
  Domain: communityrig.ru (DNS → 81.19.135.78)
```

### K8s-манифесты (`k8s/`)

| Файл               | Что делает |
|---------------------|------------|
| `namespace.yaml`    | Создаёт ns `steambot` |
| `configmap.yaml`    | ENV-переменные (не секретные) |
| `secret.yaml`       | Секреты (DB_PASSWORD, JWT_SECRET и т.д.) |
| `postgres.yaml`     | PostgreSQL StatefulSet + Service + PVC |
| `deployment.yaml`   | steambot-server (2 реплики) + PVC |
| `service.yaml`      | ClusterIP-сервис :80 → :4000 |
| `ingress.yaml`      | Nginx Ingress + TLS + sticky sessions |
| `hpa.yaml`          | HorizontalPodAutoscaler (2–10 реплик) |
| `clusterissuer.yaml`| Let's Encrypt через cert-manager |

---

## 3. Основные команды kubectl

### Статус подов

```powershell
# Все поды в namespace
kubectl get pods -n steambot

# В реальном времени
kubectl get pods -n steambot -w

# Подробно
kubectl describe pod <pod-name> -n steambot
```

### Логи

```powershell
# Логи одного пода (последние 50 строк)
kubectl logs <pod-name> -n steambot --tail=50

# Логи всех подов (по label)
kubectl logs -n steambot -l app=steambot-server --tail=30

# Логи за последние 5 минут
kubectl logs -n steambot -l app=steambot-server --since=5m

# Фильтрация (убрать health-пробы)
kubectl logs -n steambot -l app=steambot-server --tail=50 2>&1 | Where-Object { $_ -notmatch "kube-probe|/health" }

# Поиск ошибок
kubectl logs -n steambot -l app=steambot-server --tail=100 2>&1 | Where-Object { $_ -match "Error|error|CORS|409" }

# Стрим логов
kubectl logs -f <pod-name> -n steambot
```

### Рестарт деплоймента

```powershell
kubectl rollout restart deployment/steambot-server -n steambot
kubectl rollout status deployment/steambot-server -n steambot --timeout=120s
```

### Зайти внутрь пода (shell)

```powershell
kubectl exec -it <pod-name> -n steambot -- /bin/bash

# Примеры:
# Проверить файлы
ls -la /app/
ls -la /app/server/node_modules/playwright

# Проверить переменные окружения
env | grep -E "DB_|JWT|TZ|APP_URL"

# Проверить процессы
ps aux
```

### ConfigMap и Secrets

```powershell
# Посмотреть configmap
kubectl get configmap steambot-config -n steambot -o yaml

# Редактировать configmap
kubectl edit configmap steambot-config -n steambot

# Обновить secret
kubectl create secret generic steambot-secrets \
  --from-literal=DB_PASSWORD='...' \
  --from-literal=JWT_SECRET='...' \
  -n steambot --dry-run=client -o yaml | kubectl apply -f -
```

### PVC (данные)

```powershell
kubectl get pvc -n steambot
kubectl describe pvc steambot-data-pvc -n steambot
```

### HPA (автоскейлинг)

```powershell
kubectl get hpa -n steambot
kubectl describe hpa steambot-server-hpa -n steambot

# Ручной скейл (минуя HPA)
kubectl scale deployment/steambot-server -n steambot --replicas=3
```

### Ingress

```powershell
kubectl get ingress -n steambot
kubectl describe ingress steambot-ingress -n steambot

# Проверить внешний IP
kubectl get svc -n ingress-nginx
```

---

## 4. Полный деплой с нуля

```powershell
$env:KUBECONFIG = "c:\Users\popovt\Downloads\twc-steambot-config.yaml"

# 1. Namespace
kubectl apply -f k8s/namespace.yaml

# 2. Secrets (⚠️ отредактировать реальные пароли!)
kubectl apply -f k8s/secret.yaml

# 3. ConfigMap
kubectl apply -f k8s/configmap.yaml

# 4. PostgreSQL
kubectl apply -f k8s/postgres.yaml

# 5. Подождать пока PG запустится
kubectl wait --for=condition=ready pod -l app=postgres -n steambot --timeout=60s

# 6. Деплоймент + PVC
kubectl apply -f k8s/deployment.yaml

# 7. Service
kubectl apply -f k8s/service.yaml

# 8. Ingress (+ TLS)
kubectl apply -f k8s/clusterissuer.yaml
kubectl apply -f k8s/ingress.yaml

# 9. HPA (автоскейлинг)
kubectl apply -f k8s/hpa.yaml

# 10. Проверить
kubectl get pods -n steambot
```

---

## 5. PostgreSQL

### Подключиться к базе

```powershell
# Через kubectl exec
kubectl exec -it steambot-postgres-0 -n steambot -- psql -U steambot -d steambot
```

```sql
-- Полезные запросы
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
SELECT count(*) FROM users;
SELECT * FROM telegram_bots;
SELECT * FROM campaigns LIMIT 5;
SELECT * FROM jobs ORDER BY created_at DESC LIMIT 10;
```

### Бэкап и восстановление

```powershell
# Бэкап
kubectl exec steambot-postgres-0 -n steambot -- pg_dump -U steambot steambot > backup.sql

# Восстановление
Get-Content backup.sql | kubectl exec -i steambot-postgres-0 -n steambot -- psql -U steambot steambot
```

---

## 6. Диагностика проблем

### Pod в CrashLoopBackOff

```powershell
# Посмотреть причину
kubectl describe pod <pod-name> -n steambot
kubectl logs <pod-name> -n steambot --previous
```

### Pod в Pending

```powershell
# Обычно — не хватает ресурсов или PVC
kubectl describe pod <pod-name> -n steambot | Select-String "Events" -Context 0,20
```

### Проверить CORS

```powershell
# Из PowerShell
Invoke-WebRequest -Uri "http://81.19.135.78/health" -Headers @{ Origin = "http://81.19.135.78" } -Method OPTIONS
```

### Проверить TG бота

```powershell
kubectl logs -n steambot -l app=steambot-server --tail=50 2>&1 | Where-Object { $_ -match "TG Bot" }
```

### Ресурсы кластера

```powershell
kubectl top nodes
kubectl top pods -n steambot
```

---

## 7. Полезные алиасы (PowerShell)

Добавить в `$PROFILE`:

```powershell
$env:KUBECONFIG = "c:\Users\popovt\Downloads\twc-steambot-config.yaml"

function kp { kubectl get pods -n steambot @args }
function kl { kubectl logs -n steambot -l app=steambot-server --tail=50 @args 2>&1 | Where-Object { $_ -notmatch "kube-probe|/health" } }
function kr { kubectl rollout restart deployment/steambot-server -n steambot; kubectl rollout status deployment/steambot-server -n steambot --timeout=120s }
function ksh { kubectl exec -it (kubectl get pods -n steambot -l app=steambot-server -o name | Select-Object -First 1) -n steambot -- /bin/bash }
function kdb { kubectl exec -it steambot-postgres-0 -n steambot -- psql -U steambot -d steambot }
```

Использование:
```powershell
kp          # статус подов
kl          # логи (без health)
kr          # рестарт + статус
ksh         # shell в под
kdb         # psql в PostgreSQL
```
