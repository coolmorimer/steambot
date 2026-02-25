#!/usr/bin/env bash
# =============================================================================
# setup.sh — первоначальная настройка VPS (Ubuntu 22.04 / Debian 12)
# Запускать от root: bash setup.sh
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; NC='\033[0m'
info() { echo -e "${GREEN}[SETUP]${NC} $*"; }

APP_USER="steambot"
NODE_VERSION="20"

info "Обновление системы..."
apt-get update -qq && apt-get upgrade -y -qq

# ── Node.js ───────────────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  info "Установка Node.js $NODE_VERSION..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
fi
info "Node.js: $(node --version)"

# ── Playwright зависимости ────────────────────────────────────────────────────
info "Установка системных зависимостей Playwright..."
apt-get install -y -qq \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 \
  libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
  libpango-1.0-0 libcairo2 fonts-liberation

# ── PM2 ───────────────────────────────────────────────────────────────────────
if ! command -v pm2 >/dev/null 2>&1; then
  info "Установка PM2..."
  npm install -g pm2
fi

# ── Nginx ─────────────────────────────────────────────────────────────────────
if ! command -v nginx >/dev/null 2>&1; then
  info "Установка Nginx..."
  apt-get install -y nginx
  systemctl enable nginx
fi

# ── Certbot (Let's Encrypt) ───────────────────────────────────────────────────
if ! command -v certbot >/dev/null 2>&1; then
  info "Установка Certbot..."
  apt-get install -y certbot python3-certbot-nginx
fi

# ── UFW Firewall ──────────────────────────────────────────────────────────────
info "Настройка UFW..."
ufw --force enable
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp

# ── Системный пользователь ────────────────────────────────────────────────────
if ! id "$APP_USER" >/dev/null 2>&1; then
  info "Создание пользователя $APP_USER..."
  useradd -r -m -s /bin/bash "$APP_USER"
fi

# ── Директория приложения ─────────────────────────────────────────────────────
mkdir -p /opt/steambot
chown "$APP_USER:$APP_USER" /opt/steambot

info "✅ Система настроена!"
info "Следующий шаг: su - $APP_USER && cd /opt/steambot && ./deploy.sh"
