#!/usr/bin/env node
'use strict';

/**
 * index.js — точка входа, CLI (Commander).
 *
 * Команды:
 *   start            — запустить бота
 *   add-profile      — добавить профиль через интерактивный браузер
 *   import-profile   — импортировать профиль из строки кук / JSON-файла
 *   add-campaign     — создать кампанию
 *   toggle-campaign  — вкл/выкл кампанию
 *   delete-profile   — удалить профиль
 *   delete-campaign  — удалить кампанию
 *   profiles         — список профилей
 *   campaigns        — список кампаний
 *   status           — сводка + последние джобы
 *   logs             — лог джобов из БД
 *   test-post        — один пост прямо сейчас
 */

const { Command } = require('commander');
const chalk       = require('chalk');
const fs          = require('fs');
const db          = require('./db');
const poster      = require('./poster');
const Bot         = require('./bot');

const program = new Command();

program
  .name('steam-bot')
  .description('Steam Forum Poster Bot')
  .version('1.0.0');

// ═══════════════════════════════════════════════════════════════════════════
//  start
// ═══════════════════════════════════════════════════════════════════════════
program
  .command('start')
  .description('Запустить бота (фоновый постинг по расписанию)')
  .option('--visible',          'Открывать браузер в видимом режиме (для отладки)')
  .option('--slow-mo <ms>',     'slowMo Playwright в мс', parseInt, 100)
  .option('--retries <n>',      'Число повторов при ошибке', parseInt, 2)
  .action(options => {
    const bot = new Bot({
      headless:  !options.visible,
      slowMo:    options.slowMo,
      retries:   options.retries,
    });
    bot.start();
  });

// ═══════════════════════════════════════════════════════════════════════════
//  add-profile
// ═══════════════════════════════════════════════════════════════════════════
program
  .command('add-profile')
  .description('Открыть браузер, войти в Steam, сохранить куки')
  .requiredOption('--name <name>', 'Имя профиля (любое, для логов)')
  .option('--url <url>', 'URL форума', 'https://steamcommunity.com/app/730/tradingforum/')
  .action(async options => {
    console.log(chalk.blue(`\n🌐 Открываю браузер для профиля "${options.name}"...`));
    console.log(chalk.yellow('   Войдите в Steam в открывшемся окне браузера.\n'));

    try {
      const cookies = await poster.addProfileInteractive(options.name);
      const id      = db.addProfile(options.name, cookies, options.url);
      console.log(chalk.green(`\n✅ Профиль сохранён: ${options.name}`));
      console.log(chalk.gray(`   ID: ${id}`));
      console.log(chalk.gray(`   Куки: ${cookies.length} шт.\n`));
    } catch (err) {
      console.error(chalk.red(`\n❌ Ошибка: ${err.message}`));
      process.exit(1);
    }
  });

// ═══════════════════════════════════════════════════════════════════════════
//  import-profile
// ═══════════════════════════════════════════════════════════════════════════
program
  .command('import-profile')
  .description('Импортировать профиль из строки кук или JSON-файла')
  .requiredOption('--name <name>',       'Имя профиля')
  .option('--cookies <string>',          'Строка кук: "sessionid=XXX; steamLoginSecure=YYY"')
  .option('--file <path>',               'Путь к JSON-файлу с массивом кук')
  .option('--url <url>',                 'URL форума', 'https://steamcommunity.com/app/730/tradingforum/')
  .action(options => {
    let cookies = [];

    if (options.file) {
      if (!fs.existsSync(options.file)) {
        console.error(chalk.red(`❌ Файл не найден: ${options.file}`));
        process.exit(1);
      }
      try {
        cookies = JSON.parse(fs.readFileSync(options.file, 'utf8'));
      } catch {
        console.error(chalk.red('❌ Неверный JSON в файле'));
        process.exit(1);
      }

    } else if (options.cookies) {
      // Парсим строку "name=value; name2=value2"
      cookies = options.cookies.split(';').map(part => {
        const eqIdx = part.indexOf('=');
        if (eqIdx === -1) return null;
        return {
          name:   part.slice(0, eqIdx).trim(),
          value:  part.slice(eqIdx + 1).trim(),
          domain: '.steamcommunity.com',
          path:   '/',
        };
      }).filter(Boolean);

    } else {
      console.error(chalk.red('❌ Укажите --cookies или --file'));
      process.exit(1);
    }

    if (!cookies.length) {
      console.error(chalk.red('❌ Список кук пустой'));
      process.exit(1);
    }

    const id = db.addProfile(options.name, cookies, options.url);
    console.log(chalk.green(`✅ Профиль импортирован: ${options.name}`));
    console.log(chalk.gray(`   ID: ${id}  |  Куки: ${cookies.length} шт.`));
  });

// ═══════════════════════════════════════════════════════════════════════════
//  add-campaign
// ═══════════════════════════════════════════════════════════════════════════
program
  .command('add-campaign')
  .description('Создать новую кампанию')
  .requiredOption('--name <name>',        'Название кампании')
  .requiredOption('--title <template>',   'Шаблон заголовка: "WTS items #{num} | {date}"')
  .requiredOption('--body <template>',    'Шаблон тела поста (текст)')
  .requiredOption('--every <minutes>',    'Интервал в минутах', parseInt)
  .option('--window <HH:MM-HH:MM>',      'Активное окно, напр. "10:00-22:00"', '00:00-23:59')
  .requiredOption('--profiles <ids>',     'ID профилей через запятую')
  .action(options => {
    const [windowStart, windowEnd] = options.window.split('-');
    const profileIds = options.profiles.split(',').map(s => s.trim()).filter(Boolean);

    if (!windowStart || !windowEnd) {
      console.error(chalk.red('❌ Неверный формат --window. Пример: "10:00-22:00"'));
      process.exit(1);
    }

    // Проверить что все профили существуют
    for (const pid of profileIds) {
      if (!db.getProfile(pid)) {
        console.error(chalk.red(`❌ Профиль не найден: ${pid}`));
        console.log(chalk.yellow('   Используйте "node index.js profiles" чтобы увидеть ID.'));
        process.exit(1);
      }
    }

    const id = db.addCampaign({
      name:            options.name,
      titleTemplate:   options.title,
      bodyTemplate:    options.body,
      scheduleMinutes: options.every,
      windowStart,
      windowEnd,
      profileIds,
    });

    console.log(chalk.green(`✅ Кампания создана: "${options.name}"`));
    console.log(chalk.gray(`   ID: ${id}`));
    console.log(chalk.gray(`   Интервал: каждые ${options.every} мин, окно ${windowStart}–${windowEnd}`));
  });

// ═══════════════════════════════════════════════════════════════════════════
//  toggle-campaign
// ═══════════════════════════════════════════════════════════════════════════
program
  .command('toggle-campaign')
  .description('Включить или выключить кампанию')
  .requiredOption('--id <id>',         'ID кампании')
  .requiredOption('--enable <bool>',   '"true" — включить, "false" — выключить')
  .action(options => {
    const campaign = db.getCampaign(options.id);
    if (!campaign) { console.error(chalk.red(`❌ Кампания не найдена: ${options.id}`)); process.exit(1); }
    const enabled = options.enable === 'true';
    db.toggleCampaign(options.id, enabled);
    console.log(chalk.green(`✅ Кампания "${campaign.name}" ${enabled ? 'включена' : 'выключена'}`));
  });

// ═══════════════════════════════════════════════════════════════════════════
//  delete-profile
// ═══════════════════════════════════════════════════════════════════════════
program
  .command('delete-profile')
  .description('Удалить профиль')
  .requiredOption('--id <id>', 'ID профиля')
  .action(options => {
    const profile = db.getProfile(options.id);
    if (!profile) { console.error(chalk.red(`❌ Профиль не найден: ${options.id}`)); process.exit(1); }
    db.deleteProfile(options.id);
    console.log(chalk.green(`✅ Профиль удалён: ${profile.name}`));
  });

// ═══════════════════════════════════════════════════════════════════════════
//  delete-campaign
// ═══════════════════════════════════════════════════════════════════════════
program
  .command('delete-campaign')
  .description('Удалить кампанию')
  .requiredOption('--id <id>', 'ID кампании')
  .action(options => {
    const campaign = db.getCampaign(options.id);
    if (!campaign) { console.error(chalk.red(`❌ Кампания не найдена: ${options.id}`)); process.exit(1); }
    db.deleteCampaign(options.id);
    console.log(chalk.green(`✅ Кампания удалена: "${campaign.name}"`));
  });

// ═══════════════════════════════════════════════════════════════════════════
//  profiles
// ═══════════════════════════════════════════════════════════════════════════
program
  .command('profiles')
  .description('Показать список профилей')
  .action(() => {
    const profiles = db.getProfiles();
    if (!profiles.length) {
      console.log(chalk.yellow('\n  Нет профилей. Добавьте: node index.js add-profile --name "ник"\n'));
      return;
    }

    console.log(chalk.bold('\n  👤 Профили\n'));
    for (const p of profiles) {
      const status = p.is_active ? chalk.green('🟢 Активен') : chalk.red('🔴 Деактивирован');
      console.log(`  ${chalk.cyan(p.id)}`);
      console.log(`    Имя:     ${chalk.bold(p.name)}`);
      console.log(`    Статус:  ${status}`);
      console.log(`    Куки:    ${p.cookies.length} шт.`);
      console.log(`    URL:     ${p.target_url}`);
      console.log(`    Добавлен: ${p.created_at}`);
      console.log();
    }
  });

// ═══════════════════════════════════════════════════════════════════════════
//  campaigns
// ═══════════════════════════════════════════════════════════════════════════
program
  .command('campaigns')
  .description('Показать список кампаний')
  .action(() => {
    const campaigns = db.getCampaigns();
    if (!campaigns.length) {
      console.log(chalk.yellow('\n  Нет кампаний. Создайте: node index.js add-campaign ...\n'));
      return;
    }

    console.log(chalk.bold('\n  📋 Кампании\n'));
    for (const c of campaigns) {
      const status = c.is_active ? chalk.green('✅ ВКЛ') : chalk.gray('⏸  ВЫКЛ');
      console.log(`  ${chalk.cyan(c.id)}`);
      console.log(`    Название:  ${chalk.bold(c.name)}  ${status}`);
      console.log(`    Заголовок: ${c.title_template}`);
      console.log(`    Интервал:  каждые ${c.schedule_minutes} мин`);
      console.log(`    Окно:      ${c.window_start} – ${c.window_end}`);
      console.log(`    Профили:   ${c.profile_ids.join(', ')}`);
      console.log();
    }
  });

// ═══════════════════════════════════════════════════════════════════════════
//  status
// ═══════════════════════════════════════════════════════════════════════════
program
  .command('status')
  .description('Сводная статистика')
  .action(() => {
    const profiles  = db.getProfiles();
    const campaigns = db.getCampaigns();
    const jobs      = db.getRecentJobs(10);

    const activeP = profiles.filter(p => p.is_active).length;
    const activeC = campaigns.filter(c => c.is_active).length;

    console.log(chalk.bold('\n📊 Статус бота\n'));
    console.log(`  Профили:   ${chalk.cyan(profiles.length)} (активных: ${chalk.green(activeP)})`);
    console.log(`  Кампании:  ${chalk.cyan(campaigns.length)} (активных: ${chalk.green(activeC)})`);
    console.log();

    if (jobs.length) {
      console.log(chalk.bold('  📜 Последние задания:\n'));
      for (const j of jobs) {
        const icon =
          j.status === 'done'    ? chalk.green('✅') :
          j.status === 'failed'  ? chalk.red('❌')   :
          j.status === 'running' ? chalk.yellow('⏳') :
                                   chalk.gray('🕒');
        const ts   = (j.executed_at || j.scheduled_at || '').slice(0, 16).replace('T', ' ');
        const link = j.topic_url ? chalk.blue(` → ${j.topic_url}`) : '';
        const err  = j.error    ? chalk.red(` (${j.error})`)      : '';
        console.log(`  ${icon} [${ts}] ${chalk.bold(j.profile_name || j.profile_id)} — "${j.title}"${link}${err}`);
      }
      console.log();
    }
  });

// ═══════════════════════════════════════════════════════════════════════════
//  logs
// ═══════════════════════════════════════════════════════════════════════════
program
  .command('logs')
  .description('Лог джобов из базы данных')
  .option('--last <n>', 'Сколько последних записей показать', parseInt, 20)
  .action(options => {
    const jobs = db.getRecentJobs(options.last);
    if (!jobs.length) {
      console.log(chalk.yellow('\n  Активности пока нет.\n'));
      return;
    }

    console.log(chalk.bold(`\n  📜 Последние ${jobs.length} записей\n`));
    for (const j of jobs) {
      const icon =
        j.status === 'done'    ? chalk.green('✅') :
        j.status === 'failed'  ? chalk.red('❌')   :
        j.status === 'running' ? chalk.yellow('⏳') :
                                 chalk.gray('🕒');
      const ts   = (j.executed_at || j.scheduled_at || '').slice(0, 16).replace('T', ' ');
      const name = chalk.bold(j.profile_name || j.profile_id);
      const link = j.topic_url ? chalk.blue(` → ${j.topic_url}`) : '';
      const err  = j.error    ? chalk.red(` [${j.error}]`)       : '';
      console.log(`  ${icon}  ${ts}  ${name}  "${j.title}"${link}${err}`);
    }
    console.log();
  });

// ═══════════════════════════════════════════════════════════════════════════
//  test-post
// ═══════════════════════════════════════════════════════════════════════════
program
  .command('test-post')
  .description('Создать один тестовый пост прямо сейчас')
  .requiredOption('--profile <id>',   'ID профиля')
  .requiredOption('--title <title>',  'Заголовок темы')
  .requiredOption('--body <body>',    'Текст темы')
  .option('--visible',                'Видимый браузер')
  .action(async options => {
    const profile = db.getProfile(options.profile);
    if (!profile) {
      console.error(chalk.red(`❌ Профиль не найден: ${options.profile}`));
      console.log(chalk.yellow('   Используйте "node index.js profiles" чтобы увидеть ID.'));
      process.exit(1);
    }

    console.log(chalk.blue(`\n🚀 Тестовый пост от "${profile.name}"...`));
    console.log(chalk.gray(`   Заголовок: ${options.title}`));
    console.log(chalk.gray(`   Режим:     ${options.visible ? 'видимый браузер' : 'headless'}\n`));

    try {
      const topicUrl = await poster.createForumPost(profile, options.title, options.body, {
        headless: !options.visible,
      });
      console.log(chalk.green(`\n✅ Тема создана: ${topicUrl}\n`));
    } catch (err) {
      console.error(chalk.red(`\n❌ Ошибка: ${err.message}`));
      if (err.message === 'SESSION_EXPIRED') {
        console.log(chalk.yellow('⚠️  Куки истекли. Обновите профиль:\n'));
        console.log(chalk.white(`   node index.js add-profile --name "${profile.name}"\n`));
      }
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────────────────
program.parseAsync(process.argv).catch(err => {
  console.error(chalk.red(`Неожиданная ошибка: ${err.message}`));
  process.exit(1);
});
