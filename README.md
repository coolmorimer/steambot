# 🤖 Steam Forum Poster Bot

Консольный бот для автоматической публикации тем на форуме Steam.  
Использует **Playwright** (реальный Chromium), **better-sqlite3** для хранения данных и **node-cron** для расписания.

---

## Требования

- **Node.js 18+**
- **npm 9+**
- Windows 10/11

---

## Установка

```bash
# 1. Установить зависимости
npm install

# 2. Установить браузер Chromium для Playwright
npx playwright install chromium
```

> ⚠️ Если `better-sqlite3` не устанавливается — установите [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) с компонентом "Desktop development with C++".

---

## Быстрый старт

### Шаг 1 — Добавить профиль (Steam аккаунт)

```bash
node index.js add-profile --name "morc00l"
```

Откроется видимый браузер. Войдите в Steam вручную. После входа куки сохранятся автоматически.

### Шаг 2 — Посмотреть ID профиля

```bash
node index.js profiles
```

### Шаг 3 — Создать кампанию

```bash
node index.js add-campaign \
  --name "CS2 Trading" \
  --title "WTS CS2 items #{num} | {date}" \
  --body "Selling CS2 items. Add me to trade." \
  --every 60 \
  --window "10:00-22:00" \
  --profiles "ВАШ_PROFILE_ID"
```

### Шаг 4 — Запустить бота

```bash
node index.js start
```

---

## Все команды

| Команда | Описание |
|---------|----------|
| `node index.js start` | Запустить бота |
| `node index.js start --visible` | Запустить с видимым браузером (отладка) |
| `node index.js add-profile --name "ник"` | Войти в браузере, сохранить куки |
| `node index.js import-profile --name "ник" --cookies "sessionid=X; steamLoginSecure=Y"` | Импортировать куки строкой |
| `node index.js import-profile --name "ник" --file cookies.json` | Импортировать куки из JSON-файла |
| `node index.js add-campaign ...` | Создать кампанию |
| `node index.js toggle-campaign --id ID --enable true` | Включить кампанию |
| `node index.js toggle-campaign --id ID --enable false` | Выключить кампанию |
| `node index.js delete-profile --id ID` | Удалить профиль |
| `node index.js delete-campaign --id ID` | Удалить кампанию |
| `node index.js profiles` | Список профилей |
| `node index.js campaigns` | Список кампаний |
| `node index.js status` | Сводка + последние 10 джобов |
| `node index.js logs --last 20` | Лог джобов из БД |
| `node index.js test-post --profile ID --title "Test" --body "Body"` | Тестовый пост сейчас |

---

## Переменные в шаблонах

| Переменная | Пример |
|-----------|--------|
| `{date}` или `{дата}` | 20 Feb 2026 |
| `{time}` или `{время}` | 16:00 |
| `{num}` или `{номер}` | 7 |
| `{profile}` | morc00l |
| `{day}` или `{день}` | Friday |

**Примеры:**
```
WTS CS2 items #{num} | {date} {time}
→ WTS CS2 items #7 | 20 Feb 2026 16:00
```

---

## Структура файлов

```
steam-bot/
├── index.js       ← CLI точка входа
├── bot.js         ← Класс Bot (cron + runJob)
├── poster.js      ← Playwright логика
├── db.js          ← SQLite CRUD
├── scheduler.js   ← Генерация очереди, isInWindow
├── logger.js      ← Winston логгер
├── config/
│   └── config.json
├── data/
│   └── bot.db     ← создаётся автоматически
└── logs/
    └── bot.log    ← создаётся автоматически
```

---

## Запуск как служба Windows (PM2)

```bash
# Установить PM2 глобально
npm install -g pm2

# Запустить бота как фоновый процесс
pm2 start index.js --name steam-bot -- start

# Автозапуск при старте Windows
pm2 startup
pm2 save

# Просмотр логов в реальном времени
pm2 logs steam-bot

# Остановить / перезапустить
pm2 stop steam-bot
pm2 restart steam-bot
```

---

## Пример вывода при работе

```
[2026-02-20 15:30:01] INFO  Bot started. 2 профилей, 1 активных кампаний.
[2026-02-20 15:30:01] INFO  Scheduler: следующий джоб для "CS2 Trading" / morc00l в 16:00:00
[2026-02-20 16:00:00] INFO  [morc00l] Запускаю джоб: "WTS CS2 items #3 | 20 Feb 2026 16:00"
[2026-02-20 16:00:02] INFO  [morc00l] Открываю форум: https://steamcommunity.com/app/730/tradingforum/
[2026-02-20 16:00:05] INFO  [morc00l] Нажимаю «Новое обсуждение»
[2026-02-20 16:00:06] INFO  [morc00l] Ввожу заголовок: "WTS CS2 items #3 | 20 Feb 2026 16:00"
[2026-02-20 16:00:07] INFO  [morc00l] Ввожу текст поста
[2026-02-20 16:00:09] INFO  [morc00l] Отправляю форму
[2026-02-20 16:00:11] INFO  [morc00l] ✅ Тема создана: https://steamcommunity.com/app/730/tradingforum/123456789/
```

---

## Важные замечания

- **Куки истекают** примерно через 30 дней. При ошибке `SESSION_EXPIRED` повторите `add-profile`.
- Бот **не хранит пароли** — только куки после входа.
- `headless: true` — браузер работает в фоне без окна. `--visible` — видите что делает бот.
- Логи пишутся в `logs/bot.log` (ротация: 10 МБ × 5 файлов).
