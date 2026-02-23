# Система лицензирования Steam Poster Bot

## Архитектура

```
license-server/   — лицензионный сервер (разворачивается на VPS/хостинге)
activator/        — панель управления ключами (запускается локально у вас)
electron/license.js — клиентский модуль (встроен в приложение)
```

## Схема работы

1. Вы запускаете `license-server` на VPS
2. Открываете `activator` и генерируете ключи для покупателей
3. Покупатель при первом запуске приложения вводит ключ
4. Приложение связывается с сервером, привязывает ключ к железу (HWID)
5. При каждом запуске — онлайн-проверка, при недоступности сервера — оффлайн-грейс 7 дней

---

## 1. Настройка License Server

### Конфигурация
Перед деплоем задайте переменные окружения (или скопируйте `.env.example` в `.env`):

```env
PORT=3847
ADMIN_TOKEN=ваш_секретный_токен_для_активатора
HMAC_SECRET=ваш_hmac_секрет_минимум_32_символа
```

> ⚠️ Оба значения **ДОЛЖНЫ совпадать** в `license-server/.env` и `electron/license.js`

### Установка и запуск
```bash
cd license-server
npm install
node server.js
```

### Деплой на VPS (пример: systemd)
```ini
[Unit]
Description=SteamBot License Server

[Service]
WorkingDirectory=/opt/steambot-license
ExecStart=/usr/bin/node server.js
Environment=PORT=3847
Environment=ADMIN_TOKEN=ваш_токен
Environment=HMAC_SECRET=ваш_секрет
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## 2. Настройка Activator (панель управления)

```bash
cd activator
npm install
node activator.js
```

Откройте в браузере: **http://localhost:3848**

В настройках укажите URL сервера и Admin Token.

### Возможности
- 🔑 Генерация ключей (с опциональным сроком действия в днях)
- 📋 Просмотр всех ключей + статус (не активирован / активен / отозван)
- 🚫 Отзыв компрометированных ключей
- ✅ Восстановление ключей

---

## 3. Настройка клиентского приложения (перед сборкой)

В файле `electron/license.js` измените две константы:

```javascript
const SERVER_URL  = 'https://ваш-домен.com:3847';  // адрес вашего сервера
const HMAC_SECRET = 'ваш_hmac_секрет_тот_же_что_на_сервере';
```

После изменения — пересоберите приложение:
```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"; cd g:\steambot; npm run build:ui
```

---

## 4. Генерация случайных секретов

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Запустите дважды — получите `ADMIN_TOKEN` и `HMAC_SECRET`.

---

## Безопасность

| Что защищает | Механизм |
|---|---|
| Несанкционированное использование | HWID-привязка ключа |
| Перенос license.dat на другой ПК | AES-256 шифрование файла ключом HWID |
| Подделка ответа сервера | HMAC-SHA256 подпись каждого ответа |
| Несанкционированный доступ к admin API | X-Admin-Token заголовок |
| Работа без интернета | Оффлайн-грейс 7 дней |
| Возврат / мошенничество | Отзыв ключа через активатор |
