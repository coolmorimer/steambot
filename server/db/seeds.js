'use strict';

/**
 * server/db/seeds.js
 *
 * Наполняет БД начальными данными:
 *  - Планы подписок (Free, Starter, Pro, Enterprise)
 *  - Аккаунт администратора
 *
 * Запускать: node db/seeds.js
 * Идемпотентен — повторный запуск ничего не сломает.
 */

const bcrypt = require('bcryptjs');
const config = require('../config');
const db     = require('./index');

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    description: 'P2P маркет и обмен предметами. Без постинга.',
    price_monthly: 0,
    price_yearly:  0,
    max_steam_accounts: 0,
    max_campaigns:      0,
    max_jobs_per_day:   0,
    max_telegram_bots:  0,
    max_steam_groups:   0,
    has_mini_app:          false,
    has_ai_templates:      false,
    has_analytics:         false,
    has_priority_support:  false,
    has_api_access:        false,
    features: ['P2P маркет', 'P2P обмен предметами', 'Баланс и вывод средств'],
    sort_order: 0,
  },
  {
    id: 'starter',
    name: 'Starter',
    description: 'Для небольших проектов и тестирования.',
    price_monthly: 490,
    price_yearly:  4990,
    max_steam_accounts: 3,
    max_campaigns:      5,
    max_jobs_per_day:   50,
    max_telegram_bots:  1,
    max_steam_groups:   10,
    has_mini_app:         true,
    has_ai_templates:     false,
    has_analytics:        false,
    has_priority_support: false,
    has_api_access:       false,
    features: [
      '3 Steam аккаунта',
      '5 кампаний',
      '50 постов/день',
      '10 Steam-групп',
      'Telegram-бот',
      'Mini App',
    ],
    sort_order: 1,
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Профессиональное использование. Всё для роста.',
    price_monthly: 1490,
    price_yearly:  14990,
    max_steam_accounts: 10,
    max_campaigns:      20,
    max_jobs_per_day:   200,
    max_telegram_bots:  1,
    max_steam_groups:   25,
    has_mini_app:         true,
    has_ai_templates:     true,
    has_analytics:        true,
    has_priority_support: false,
    has_api_access:       false,
    features: [
      '10 Steam аккаунтов',
      '20 кампаний',
      '200 постов/день',
      '25 Steam-групп',
      'Telegram-бот + Mini App',
      '🤖 AI шаблоны',
      '📊 Аналитика',
    ],
    sort_order: 2,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Безлимитные возможности для бизнеса.',
    price_monthly: 4990,
    price_yearly:  49990,
    max_steam_accounts: -1,
    max_campaigns:      -1,
    max_jobs_per_day:   -1,
    max_telegram_bots:  5,
    max_steam_groups:   36,
    has_mini_app:         true,
    has_ai_templates:     true,
    has_analytics:        true,
    has_priority_support: true,
    has_api_access:       true,
    features: [
      'Безлимит аккаунтов',
      'Безлимит кампаний',
      'Безлимит постов',
      '36 Steam-групп (все)',
      'До 5 Telegram-ботов',
      'AI шаблоны + аналитика',
      'Приоритетная поддержка',
      'REST API',
    ],
    sort_order: 3,
  },
];

async function seed() {
  console.log('🌱 Запуск seeds...\n');

  // ── Планы подписок ──────────────────────────────────────────────────────
  console.log('📋 Создание планов подписок...');
  for (const plan of PLANS) {
    await db.upsertPlan(plan);
    console.log(`  ✓ ${plan.id.padEnd(12)} ${plan.name}`);
  }

  // ── Admin аккаунт ────────────────────────────────────────────────────────
  console.log('\n👤 Создание admin-аккаунта...');
  const adminEmail = config.admin.email;
  const existing   = await db.getUserByEmail(adminEmail);

  if (existing) {
    console.log(`  ⚠️  Admin уже существует: ${adminEmail}`);
  } else {
    const passwordHash = await bcrypt.hash(config.admin.password, 12);
    const adminId = await db.createUser({
      email:        adminEmail,
      passwordHash,
      name:         config.admin.name || 'Administrator',
      role:         'admin',
    });

    // Даём Enterprise подписку навсегда
    await db.createSubscription({
      userId:        adminId,
      planId:        'enterprise',
      billingPeriod: 'yearly',
      status:        'active',
    });
    const adminSub = await db.getActiveSubscription(adminId);
    await db.updateSubscription(
      adminSub.id,
      { expires_at: '2099-12-31T23:59:59.000Z' }
    );

    console.log(`  ✓ Admin создан: ${adminEmail}`);
    console.log(`  ✓ Пароль:       ${config.admin.password}`);
    console.log(`  ⚠️  СМЕНИТЕ ПАРОЛЬ НЕМЕДЛЕННО!`);
  }

  console.log('\n✅ Seeds выполнены успешно.\n');
}

seed().catch(err => {
  console.error('❌ Seeds error:', err);
  process.exit(1);
});
