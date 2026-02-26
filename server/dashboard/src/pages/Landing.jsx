import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Zap, Shield, Clock, BarChart3, Bot, Globe, Repeat, Users, MessageSquare, Target, Rocket, ChevronDown, ArrowRight, Star, Menu, X } from 'lucide-react';
import clsx from 'clsx';

const API = '/api';

export default function Landing() {
  const [plans, setPlans] = useState([]);
  const [period, setPeriod] = useState('monthly');
  const [faqOpen, setFaqOpen] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    fetch(`${API}/subscriptions/plans`)
      .then(r => r.json())
      .then(setPlans)
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ══ NAV ══ */}
      <nav className="fixed top-0 w-full z-50 bg-gray-950/80 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-sm">SP</span>
            </div>
            <span className="font-bold text-white text-lg">Steam Poster Bot</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <a href="#features" className="hover:text-white transition-colors">Возможности</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">Как это работает</a>
            <a href="#pricing" className="hover:text-white transition-colors">Тарифы</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login" className="text-sm text-gray-300 hover:text-white transition-colors px-3 py-2">
              Войти
            </Link>
            <Link to="/register" className="btn-primary text-sm !py-2 !px-4">
              Начать бесплатно
            </Link>
          </div>
          {/* Mobile burger */}
          <button onClick={() => setMobileNav(o => !o)} className="md:hidden text-gray-400 hover:text-white p-1">
            {mobileNav ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
        {/* Mobile dropdown */}
        {mobileNav && (
          <div className="md:hidden border-t border-gray-800/50 bg-gray-950/95 backdrop-blur-xl px-4 py-4 space-y-3">
            <a href="#features" onClick={() => setMobileNav(false)} className="block text-sm text-gray-300 hover:text-white py-1.5">Возможности</a>
            <a href="#how-it-works" onClick={() => setMobileNav(false)} className="block text-sm text-gray-300 hover:text-white py-1.5">Как это работает</a>
            <a href="#pricing" onClick={() => setMobileNav(false)} className="block text-sm text-gray-300 hover:text-white py-1.5">Тарифы</a>
            <a href="#faq" onClick={() => setMobileNav(false)} className="block text-sm text-gray-300 hover:text-white py-1.5">FAQ</a>
            <div className="flex gap-3 pt-2 border-t border-gray-800">
              <Link to="/login" className="btn-ghost text-sm flex-1 justify-center">Войти</Link>
              <Link to="/register" className="btn-primary text-sm flex-1 justify-center">Регистрация</Link>
            </div>
          </div>
        )}
      </nav>

      {/* ══ HERO ══ */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden">
        {/* Gradient orbs */}
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-brand-600/20 rounded-full blur-3xl" />
        <div className="absolute top-40 right-1/4 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl" />
        
        <div className="relative max-w-5xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-brand-600/10 border border-brand-600/20 rounded-full px-4 py-1.5 mb-8">
            <Zap className="w-4 h-4 text-brand-400" />
            <span className="text-sm text-brand-300">Автопостинг в Steam форумы</span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold text-white leading-tight mb-6">
            Продавай и обменивай{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-purple-400">
              Steam автоматически
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Создавайте кампании, планируйте публикации и управляйте множеством аккаунтов.
            Telegram-бот для мониторинга. Всё в одном сервисе.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/register" className="btn bg-brand-600 hover:bg-brand-700 text-white text-base !px-8 !py-3 shadow-lg shadow-brand-600/25">
              Попробовать бесплатно <ArrowRight className="w-5 h-5" />
            </Link>
            <a href="#how-it-works" className="btn-ghost text-base !px-8 !py-3">
              Как это работает
            </a>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-gray-500">
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-green-400" /> 14 дней бесплатно</span>
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-green-400" /> Без карты</span>
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-green-400" /> Отмена в любой момент</span>
          </div>
        </div>

        {/* Dashboard mockup */}
        <div className="relative max-w-5xl mx-auto px-4 mt-16">
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm shadow-2xl shadow-brand-600/5 p-1">
            <div className="rounded-lg bg-gray-900 p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="ml-3 text-xs text-gray-600">communityrig.ru/dashboard</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Аккаунтов', value: '12', icon: '👤' },
                  { label: 'Кампаний', value: '8', icon: '📋' },
                  { label: 'Постов сегодня', value: '156', icon: '✅' },
                  { label: 'Успешность', value: '98.7%', icon: '📊' },
                ].map(s => (
                  <div key={s.label} className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                    <span className="text-2xl">{s.icon}</span>
                    <p className="text-2xl font-bold text-white mt-2">{s.value}</p>
                    <p className="text-xs text-gray-500">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 bg-gray-800/50 rounded-lg p-4 border border-gray-700/50 h-32 flex items-end">
                  <div className="w-full flex items-end gap-1">
                    {[40, 65, 50, 80, 70, 95, 85, 75, 90, 60, 85, 95].map((h, i) => (
                      <div key={i} className="flex-1 bg-brand-600/60 rounded-t" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50 space-y-2">
                  <p className="text-xs text-gray-500 font-medium">Последние задачи</p>
                  {['✅ Workshop Promo', '✅ Sale Announce', '⏳ Review Request'].map((t, i) => (
                    <p key={i} className="text-xs text-gray-400 truncate">{t}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ STATS BAR ══ */}
      <section className="border-y border-gray-800 bg-gray-900/30">
        <div className="max-w-5xl mx-auto px-4 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: '10K+', label: 'Постов опубликовано' },
            { value: '500+', label: 'Активных аккаунтов' },
            { value: '99.5%', label: 'Успешность доставки' },
            { value: '24/7', label: 'Мониторинг Telegram' },
          ].map(s => (
            <div key={s.label}>
              <p className="text-3xl md:text-4xl font-extrabold text-white">{s.value}</p>
              <p className="text-sm text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══ FEATURES ══ */}
      <section id="features" className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
              Всё для продвижения в Steam
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Мощные инструменты для автоматизации публикаций на форумах Steam Community
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Users, color: 'brand',
                title: 'Мультиаккаунт',
                desc: 'Подключайте неограниченное количество Steam-аккаунтов. QR-код или логин/пароль — любой способ авторизации.',
              },
              {
                icon: Target, color: 'purple',
                title: 'Умные кампании',
                desc: 'Настройте расписание, выберите форумы и темы. Бот автоматически создаст посты в нужное время.',
              },
              {
                icon: Clock, color: 'blue',
                title: 'Гибкое расписание',
                desc: 'Планируйте публикации по дням недели и часам. Множество слотов — полный контроль над временем.',
              },
              {
                icon: Bot, color: 'green',
                title: 'Telegram уведомления',
                desc: 'Мониторьте работу через Telegram-бота. Статус задач, ошибки, статистика — всё в мессенджере.',
              },
              {
                icon: Shield, color: 'yellow',
                title: 'Безопасность',
                desc: 'Сессии хранятся в зашифрованном виде. Steam Guard и 2FA поддерживаются из коробки.',
              },
              {
                icon: BarChart3, color: 'red',
                title: 'Аналитика',
                desc: 'Отслеживайте успешность публикаций, историю задач и производительность аккаунтов.',
              },
            ].map(({ icon: Icon, color, title, desc }) => (
              <div key={title} className="group card hover:border-gray-700 transition-all hover:-translate-y-1 duration-300">
                <div className={clsx(
                  'w-12 h-12 rounded-xl flex items-center justify-center mb-4',
                  color === 'brand'  && 'bg-brand-600/10 text-brand-400',
                  color === 'purple' && 'bg-purple-600/10 text-purple-400',
                  color === 'blue'   && 'bg-blue-600/10 text-blue-400',
                  color === 'green'  && 'bg-green-600/10 text-green-400',
                  color === 'yellow' && 'bg-yellow-600/10 text-yellow-400',
                  color === 'red'    && 'bg-red-600/10 text-red-400',
                )}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ══ */}
      <section id="how-it-works" className="py-20 md:py-28 bg-gray-900/30 border-y border-gray-800">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
              Начните за 3 минуты
            </h2>
            <p className="text-gray-400 text-lg">
              Простая настройка — никакого кодинга или сложных конфигураций
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            {[
              {
                step: '01',
                title: 'Подключите аккаунт',
                desc: 'Авторизуйтесь через QR-код Steam или введите логин/пароль. Мы безопасно сохраним сессию.',
                icon: '🔐',
              },
              {
                step: '02',
                title: 'Создайте кампанию',
                desc: 'Укажите форум, текст поста и расписание. Выберите дни недели и время публикации.',
                icon: '📝',
              },
              {
                step: '03',
                title: 'Запустите бота',
                desc: 'Бот автоматически публикует посты по расписанию. Следите за результатами в Dashboard.',
                icon: '🚀',
              },
            ].map(({ step, title, desc, icon }) => (
              <div key={step} className="relative text-center">
                <div className="text-5xl mb-4">{icon}</div>
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-600/20 text-brand-400 text-sm font-bold mb-3">
                  {step}
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ USE CASES ══ */}
      <section className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
              Примеры использования
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                title: '🎮 Продвижение вашей игры',
                desc: 'Автоматически размещайте посты в форумах Steam Hub вашей игры. Анонсы обновлений, распродажи, мероприятия — всё по расписанию.',
                tags: ['Indie-разработчикам', 'Студиям', 'Паблишерам'],
              },
              {
                title: '📢 Раскрутка мастерской',
                desc: 'Рекламируйте ваши предметы из Workshop. Настройте автопостинг в популярные форумы для максимального охвата.',
                tags: ['Моддерам', 'Художникам', 'Создателям карт'],
              },
              {
                title: '💰 Торговля и продажи',
                desc: 'Публикуйте объявления о продаже и обмене. Несколько аккаунтов — больше охват в торговых разделах.',
                tags: ['Трейдерам', 'Магазинам', 'Сообществам'],
              },
              {
                title: '📊 Маркетинг и аналитика',
                desc: 'Отслеживайте эффективность постов, А/Б тестируйте разные тексты и время публикации для максимальной конверсии.',
                tags: ['Маркетологам', 'SMM-агентствам', 'Командам'],
              },
            ].map(({ title, desc, tags }) => (
              <div key={title} className="card hover:border-gray-700 transition-all">
                <h3 className="text-lg font-bold text-white mb-3">{title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed mb-4">{desc}</p>
                <div className="flex flex-wrap gap-2">
                  {tags.map(t => (
                    <span key={t} className="badge-blue">{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PRICING ══ */}
      <section id="pricing" className="py-20 md:py-28 bg-gray-900/30 border-y border-gray-800">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
              Выберите тариф
            </h2>
            <p className="text-gray-400 text-lg mb-8">
              Начните бесплатно, масштабируйтесь по мере роста
            </p>

            <div className="inline-flex items-center gap-3 bg-gray-800/50 rounded-full p-1">
              <button
                onClick={() => setPeriod('monthly')}
                className={clsx(
                  'px-4 py-2 rounded-full text-sm font-medium transition-all',
                  period === 'monthly' ? 'bg-brand-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                )}
              >
                Ежемесячно
              </button>
              <button
                onClick={() => setPeriod('yearly')}
                className={clsx(
                  'px-4 py-2 rounded-full text-sm font-medium transition-all',
                  period === 'yearly' ? 'bg-brand-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                )}
              >
                Ежегодно <span className="text-green-400 ml-1">−20%</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {plans.map(plan => {
              const price = period === 'yearly' ? plan.price_yearly : plan.price_monthly;
              const isPopular = plan.id === 'pro';
              return (
                <div
                  key={plan.id}
                  className={clsx(
                    'card flex flex-col relative',
                    isPopular && 'ring-2 ring-brand-500/50 border-brand-600'
                  )}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-brand-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                        ⭐ Популярный
                      </span>
                    </div>
                  )}
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                    <div className="mt-2">
                      <span className="text-3xl font-extrabold text-white">
                        {price === 0 ? 'Free' : `$${price}`}
                      </span>
                      {price > 0 && (
                        <span className="text-gray-500 text-sm ml-1">
                          / {period === 'yearly' ? 'год' : 'мес'}
                        </span>
                      )}
                    </div>
                  </div>

                  <ul className="space-y-2.5 flex-1 mb-6 text-sm">
                    {buildFeatures(plan).map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-gray-300">
                        <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    to="/register"
                    className={clsx(
                      'btn w-full text-sm',
                      isPopular
                        ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-lg shadow-brand-600/25'
                        : 'bg-gray-800 hover:bg-gray-700 text-white'
                    )}
                  >
                    {price === 0 ? 'Начать бесплатно' : 'Попробовать бесплатно'}
                  </Link>
                </div>
              );
            })}
          </div>

          <p className="text-center text-gray-500 text-sm mt-8">
            Все платные тарифы включают 14 дней бесплатного пробного периода
          </p>
        </div>
      </section>

      {/* ══ TESTIMONIALS ══ */}
      <section className="py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
              Что говорят пользователи
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                name: 'Алексей К.',
                role: 'Indie-разработчик',
                text: 'Раньше тратил 2 часа в день на ручной постинг. Теперь Steam Poster Bot делает всё автоматически. Охват вырос в 3 раза!',
                stars: 5,
              },
              {
                name: 'Мария С.',
                role: 'SMM-менеджер',
                text: 'Управляю 10+ аккаунтами для клиентов. Кампании с расписанием — это именно то, что было нужно. Экономлю 15 часов в неделю.',
                stars: 5,
              },
              {
                name: 'Дмитрий В.',
                role: 'Владелец мастерской',
                text: 'Telegram бот — огонь! Вижу все статусы прямо в телефоне. А автопостинг привёл в мастерскую +200% подписчиков.',
                stars: 5,
              },
            ].map(t => (
              <div key={t.name} className="card">
                <div className="flex gap-1 mb-3">
                  {[...Array(t.stars)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-300 text-sm leading-relaxed mb-4">"{t.text}"</p>
                <div>
                  <p className="text-white font-medium text-sm">{t.name}</p>
                  <p className="text-gray-500 text-xs">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FAQ ══ */}
      <section id="faq" className="py-20 md:py-28 bg-gray-900/30 border-y border-gray-800">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white text-center mb-12">
            Частые вопросы
          </h2>

          <div className="space-y-3">
            {[
              {
                q: 'Это безопасно для моих Steam аккаунтов?',
                a: 'Да. Мы используем те же механизмы авторизации что и Steam клиент. Сессии хранятся в зашифрованном виде на сервере. Мы не передаём данные третьим лицам.',
              },
              {
                q: 'Могут ли забанить аккаунт за автопостинг?',
                a: 'Бот имитирует действия реального пользователя через браузер. При разумном использовании (не спам) риски минимальны. Рекомендуем не более 10-20 постов в день на аккаунт.',
              },
              {
                q: 'Нужна ли Steam Guard?',
                a: 'Steam Guard поддерживается полностью. При авторизации вы можете ввести код из мобильного приложения или email.',
              },
              {
                q: 'Как работает Telegram бот?',
                a: 'Вы создаёте бота через @BotFather, вводите токен в Dashboard, и получаете уведомления о статусе задач, ошибках и статистику прямо в Telegram.',
              },
              {
                q: 'Можно ли отменить подписку?',
                a: 'Да, в любой момент. После отмены вы сможете пользоваться сервисом до конца оплаченного периода. Никаких скрытых списаний.',
              },
              {
                q: 'Есть ли API для интеграции?',
                a: 'Да, на тарифах Pro и Enterprise доступен полный REST API для интеграции с вашими инструментами.',
              },
            ].map(({ q, a }, i) => (
              <button
                key={i}
                onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                className="w-full card text-left hover:border-gray-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white pr-4">{q}</span>
                  <ChevronDown className={clsx(
                    'w-5 h-5 text-gray-500 shrink-0 transition-transform',
                    faqOpen === i && 'rotate-180'
                  )} />
                </div>
                {faqOpen === i && (
                  <p className="mt-3 text-gray-400 text-sm leading-relaxed">{a}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA ══ */}
      <section className="py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-brand-600/10 rounded-3xl blur-3xl" />
            <div className="relative card bg-gradient-to-b from-gray-900 to-gray-900/50 border-brand-600/20 p-6 sm:p-12 md:p-16">
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
                Готовы начать?
              </h2>
              <p className="text-gray-400 text-lg mb-8 max-w-xl mx-auto">
                Присоединяйтесь к сотням пользователей, которые уже автоматизировали продвижение в Steam.
                14 дней бесплатно — без ограничений.
              </p>
              <Link to="/register" className="btn bg-brand-600 hover:bg-brand-700 text-white text-lg !px-10 !py-4 shadow-xl shadow-brand-600/25">
                Создать аккаунт бесплатно <Rocket className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer className="border-t border-gray-800 py-12">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xs">SP</span>
              </div>
              <span className="text-gray-400 text-sm">Steam Poster Bot © {new Date().getFullYear()}</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-sm text-gray-500">
              <Link to="/login" className="hover:text-white transition-colors">Войти</Link>
              <Link to="/register" className="hover:text-white transition-colors">Регистрация</Link>
              <a href="#pricing" className="hover:text-white transition-colors">Тарифы</a>
              <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function buildFeatures(plan) {
  const f = [];
  f.push(`${plan.max_steam_accounts === -1 ? '∞' : plan.max_steam_accounts} Steam аккаунтов`);
  f.push(`${plan.max_campaigns === -1 ? '∞' : plan.max_campaigns} кампаний`);
  f.push(`${plan.max_jobs_per_day === -1 ? '∞' : plan.max_jobs_per_day} постов / день`);
  if (plan.max_telegram_bots > 0) f.push(`Telegram бот (${plan.max_telegram_bots})`);
  if (plan.has_mini_app) f.push('Telegram Mini App');
  if (plan.has_ai_templates) f.push('AI шаблоны');
  if (plan.has_analytics) f.push('Аналитика');
  if (plan.has_api_access) f.push('API доступ');
  if (plan.has_priority_support) f.push('Приоритетная поддержка');
  return f;
}
