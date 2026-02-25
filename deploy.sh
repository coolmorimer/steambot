#!/usr/bin/env bash
# =============================================================================
# deploy.sh — развёртывание Steam Poster Bot на VPS
#
# Использование:
#   chmod +x deploy.sh
#   ./deploy.sh                  # полное развёртывание
#   ./deploy.sh --update-only    # только обновление кода + перезапуск
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

APP_DIR="/opt/steambot"
NODE_VERSION="20"
UPDATE_ONLY=false

[[ "${1:-}" == "--update-only" ]] && UPDATE_ONLY=true

# ── 1. Проверка окружения ──────────────────────────────────────────────────────
info "Проверка окружения..."
command -v node  >/dev/null 2>&1 || error "Node.js не установлен"
command -v npm   >/dev/null 2>&1 || error "npm не установлен"
command -v git   >/dev/null 2>&1 || error "git не установлен"
command -v pm2   >/dev/null 2>&1 || { warn "PM2 не найден, устанавливаю..."; npm install -g pm2; }

if $UPDATE_ONLY; then
  # ── Быстрое обновление ───────────────────────────────────────────────────────
  info "Обновление кода..."
  cd "$APP_DIR"
  git pull origin main

  info "Установка/обновление зависимостей сервера..."
  cd server && npm ci --omit=dev && cd ..

  info "Сборка дашборда..."
  cd server/dashboard
  npm ci
  npm run build
  cd ../..

  info "Перезапуск сервера..."
  pm2 reload steambot-server --update-env

  info "✅ Обновление завершено!"
  pm2 status
  exit 0
fi

# ── 2. Полное развёртывание ───────────────────────────────────────────────────
info "Создание директории $APP_DIR..."
mkdir -p "$APP_DIR"
cd "$APP_DIR"

info "Клонирование или обновление репозитория..."
if [ -d ".git" ]; then
  git pull origin main
else
  git clone "${REPO_URL:-https://github.com/yourusername/steambot.git}" . || {
    warn "Репозиторий не задан. Копирую из текущей директории..."
    cp -r /tmp/steambot-src/. .
  }
fi

# ── 3. Зависимости сервера ────────────────────────────────────────────────────
info "Установка зависимостей сервера..."
cd server
npm ci --omit=dev

# ── 4. Инициализация БД ───────────────────────────────────────────────────────
info "Инициализация базы данных..."
mkdir -p data
if [ ! -f "data/server.db" ]; then
  node db/seeds.js
  info "БД инициализирована"
else
  info "БД уже существует, пропуск seeds"
fi
cd ..

# ── 5. Сборка дашборда ────────────────────────────────────────────────────────
info "Установка зависимостей дашборда..."
cd server/dashboard
npm ci
info "Сборка React SPA..."
npm run build
cd ../..

# ── 6. .env файл ──────────────────────────────────────────────────────────────
if [ ! -f "server/.env" ]; then
  warn "Файл server/.env не найден. Создаю из примера..."
  cp server/.env.example server/.env
  warn "⚠️  ВАЖНО: Отредактируйте server/.env перед запуском!"
  warn "   nano server/.env"
fi

# ── 7. Запуск через PM2 ───────────────────────────────────────────────────────
info "Запуск через PM2..."
pm2 delete steambot-server 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save

info "Настройка PM2 автозапуска..."
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1 | bash || \
  warn "Не удалось настроить автозапуск. Запустите вручную: pm2 startup"

# ── 8. Nginx ──────────────────────────────────────────────────────────────────
if command -v nginx >/dev/null 2>&1; then
  info "Nginx обнаружен, копирую конфиг..."
  cp nginx.conf /etc/nginx/sites-available/steambot
  ln -sf /etc/nginx/sites-available/steambot /etc/nginx/sites-enabled/steambot 2>/dev/null || true
  nginx -t && systemctl reload nginx || warn "Проверьте конфиг nginx"
else
  warn "Nginx не установлен. Для продакшена рекомендуется nginx как reverse proxy."
fi

info "✅ Развёртывание завершено!"
echo ""
echo "  🌐 Сервер:    http://localhost:4000"
echo "  📊 PM2:       pm2 status"
echo "  📋 Логи:      pm2 logs steambot-server"
echo "  🔄 Рестарт:   pm2 restart steambot-server"
echo ""
pm2 status
