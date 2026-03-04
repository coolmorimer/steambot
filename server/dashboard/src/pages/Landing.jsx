import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check, Zap, Shield, Clock, BarChart3, Bot,
  Users, Target, Rocket, ChevronDown, ArrowRight,
  Menu, X, Lock, FileText, Play, Gamepad2, Palette, DollarSign,
  TrendingUp, CheckCircle2, Timer, Send, ArrowLeftRight,
  LayoutDashboard, Megaphone, Activity, Settings, CreditCard,
  Wallet, Code2, ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';

const API = '/api';

function formatRub(kopecks) {
  return (kopecks / 100).toLocaleString('ru-RU', { minimumFractionDigits: 0 }) + ' ₽';
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} д назад`;
}

export default function Landing() {
  const { user } = useAuth();
  const isLoggedIn = !!user;
  const [plans, setPlans] = useState([]);
  const [period, setPeriod] = useState('monthly');
  const [faqOpen, setFaqOpen] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [quickMenu, setQuickMenu] = useState(false);
  const [trades, setTrades] = useState([]);

  const quickMenuItems = [
    { to: '/',            icon: LayoutDashboard, label: 'Дашборд',      emoji: '📊' },
    { to: '/accounts',    icon: Users,           label: 'Аккаунты',     emoji: '👤' },
    { to: '/campaigns',   icon: Megaphone,       label: 'Задачи',      emoji: '✅' },
    { to: '/activity',    icon: Activity,        label: 'Активность',   emoji: '⚡' },
    { to: '/trades',      icon: ArrowLeftRight,  label: 'P2P Обмен',    emoji: '🔄' },
    { to: '/settings',    icon: Settings,        label: 'Настройки',    emoji: '⚙️' },
    { to: '/subscription',icon: CreditCard,      label: 'Подписка',     emoji: '💎' },
  ];

  const planColors = {
    'Free': 'from-gray-500 to-gray-400',
    'Starter': 'from-blue-500 to-cyan-400',
    'Pro': 'from-brand-500 to-purple-400',
    'Business': 'from-amber-500 to-orange-400',
  };
  const planName = user?.subscription?.plan_name || 'Free';
  const planGrad = planColors[planName] || planColors.Free;

  useEffect(() => {
    fetch(`${API}/subscriptions/plans`).then(r => r.json()).then(setPlans).catch(() => {});
    fetch(`${API}/trades?limit=6&sort=bumped`).then(r => r.json()).then(d => setTrades(d.items || [])).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 overflow-x-hidden">

      {/* ══ Animated background — Aurora orbs ══ */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        {/* Orb 1 — blue-purple (top-left) */}
        <div
          className="absolute rounded-full"
          style={{
            width: 820, height: 820, top: '-15%', left: '-10%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.35) 0%, rgba(79,70,229,0.22) 30%, rgba(67,56,202,0.08) 55%, transparent 72%)',
            animation: 'aurora-1 38s ease-in-out infinite',
            willChange: 'transform, filter',
          }}
        />
        {/* Orb 2 — violet-magenta (bottom-right) */}
        <div
          className="absolute rounded-full"
          style={{
            width: 920, height: 920, bottom: '-20%', right: '-12%',
            background: 'radial-gradient(circle, rgba(168,85,247,0.35) 0%, rgba(139,92,246,0.25) 20%, rgba(124,58,237,0.15) 40%, rgba(109,40,217,0.08) 55%, transparent 72%)',
            animation: 'aurora-2 47s ease-in-out infinite',
            willChange: 'transform, filter',
          }}
        />
        {/* Orb 3 — indigo-cyan (center) */}
        <div
          className="absolute rounded-full"
          style={{
            width: 700, height: 700, top: '50%', left: '50%',
            marginTop: -350, marginLeft: -350,
            background: 'radial-gradient(circle, rgba(59,130,246,0.28) 0%, rgba(37,99,235,0.18) 15%, rgba(29,78,216,0.1) 35%, transparent 65%)',
            animation: 'aurora-3 53s ease-in-out infinite',
            willChange: 'transform, filter',
          }}
        />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: 'linear-gradient(rgba(168,85,247,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,.15) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      {/* ══ NAV ══ */}
      <nav className="fixed top-0 w-full z-50 bg-gray-950/80 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center shadow-lg shadow-brand-600/20">
              <span className="text-white font-bold text-xs">SP</span>
            </div>
            <span className="font-bold text-white text-lg">Steam Poster Bot</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <a href="#trades" className="hover:text-white transition-colors">P2P Обмен</a>
            <a href="#features" className="hover:text-white transition-colors">Возможности</a>
            <a href="#pricing" className="hover:text-white transition-colors">Тарифы</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </div>
          <div className="hidden md:flex items-center gap-3">
            {isLoggedIn ? (
              <div className="relative">
                <div className="flex items-center gap-0.5 rounded-xl hover:bg-gray-800/60 transition-all duration-200 group">
                  {/* Avatar → go to dashboard */}
                  <Link
                    to="/"
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-l-xl"
                  >
                    {user?.steam_avatar ? (
                      <img src={user.steam_avatar} className="w-8 h-8 rounded-lg object-cover ring-2 ring-gray-700/50 group-hover:ring-brand-500/40 transition-all" alt="" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500/20 to-purple-500/20 flex items-center justify-center text-brand-400 text-xs font-bold ring-2 ring-gray-700/50 group-hover:ring-brand-500/40 transition-all">
                        {(user?.name || user?.email || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="text-left hidden lg:block">
                      <p className="text-sm font-medium text-white leading-tight truncate max-w-[120px]">
                        {user?.steam_username || user?.name || user?.email?.split('@')[0]}
                      </p>
                      <span className={clsx(
                        'inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gradient-to-r text-white leading-none',
                        planGrad
                      )}>
                        {planName}
                      </span>
                    </div>
                  </Link>
                  {/* Chevron → toggle dropdown */}
                  <button
                    onClick={() => setQuickMenu(o => !o)}
                    className="p-2 rounded-r-xl hover:bg-gray-700/40 transition-colors"
                  >
                    <ChevronDown className={clsx(
                      'w-4 h-4 text-gray-400 transition-transform duration-200',
                      quickMenu && 'rotate-180'
                    )} />
                  </button>
                </div>

                {/* Quick Menu Dropdown */}
                {quickMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setQuickMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-[#111318] border border-gray-700/50 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden animate-fade-in">
                      {/* User card */}
                      <div className="p-4 border-b border-gray-800/60">
                        <div className="flex items-center gap-3">
                          {user?.steam_avatar ? (
                            <img src={user.steam_avatar} className="w-10 h-10 rounded-xl object-cover ring-2 ring-gray-700/50" alt="" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 flex items-center justify-center text-brand-400 font-bold">
                              {(user?.name || user?.email || '?')[0].toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                              {user?.steam_username || user?.name || user?.email?.split('@')[0]}
                            </p>
                            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                          </div>
                          <span className={clsx(
                            'text-[10px] font-bold px-2 py-1 rounded-lg bg-gradient-to-r text-white shrink-0',
                            planGrad
                          )}>
                            {planName}
                          </span>
                        </div>
                      </div>

                      {/* Quick links */}
                      <div className="p-2 max-h-[320px] overflow-y-auto">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold px-3 py-1.5">Быстрый доступ</p>
                        {quickMenuItems.map(({ to, icon: Icon, label, emoji }) => (
                          <Link
                            key={to}
                            to={to}
                            onClick={() => setQuickMenu(false)}
                            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-gray-300 hover:bg-brand-600/10 hover:text-white transition-all duration-150 group"
                          >
                            <div className="w-8 h-8 rounded-lg bg-gray-800/60 group-hover:bg-brand-600/15 flex items-center justify-center transition-colors">
                              <Icon className="w-4 h-4 text-gray-400 group-hover:text-brand-400 transition-colors" />
                            </div>
                            <span className="flex-1">{label}</span>
                            <ChevronRight className="w-3.5 h-3.5 text-gray-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <Link to="/login" className="text-sm text-gray-300 hover:text-white transition-colors px-3 py-2">
                  Войти
                </Link>
                <Link to="/register" className="btn-primary text-sm !py-2 !px-4">
                  Начать бесплатно
                </Link>
              </>
            )}
          </div>
          {/* Mobile burger */}
          <button onClick={() => setMobileNav(o => !o)} className="md:hidden text-gray-400 hover:text-white p-1">
            {mobileNav ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
        {/* Mobile dropdown */}
        {mobileNav && (
          <div className="md:hidden border-t border-gray-800/50 bg-[#0c0e12] px-4 py-4 space-y-3">
            {isLoggedIn && (
              <div className="flex items-center gap-3 pb-3 border-b border-gray-800/50">
                <Link to="/" onClick={() => setMobileNav(false)}>
                  {user?.steam_avatar ? (
                    <img src={user.steam_avatar} className="w-9 h-9 rounded-lg object-cover ring-2 ring-gray-700/50" alt="" />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500/20 to-purple-500/20 flex items-center justify-center text-brand-400 text-sm font-bold">
                      {(user?.name || user?.email || '?')[0].toUpperCase()}
                    </div>
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {user?.steam_username || user?.name || user?.email?.split('@')[0]}
                  </p>
                  <span className={clsx(
                    'inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gradient-to-r text-white',
                    planGrad
                  )}>
                    {planName}
                  </span>
                </div>
              </div>
            )}
            <a href="#trades" onClick={() => setMobileNav(false)} className="block text-sm text-gray-300 hover:text-white py-1.5">P2P Обмен</a>
            <a href="#features" onClick={() => setMobileNav(false)} className="block text-sm text-gray-300 hover:text-white py-1.5">Возможности</a>
            <a href="#pricing" onClick={() => setMobileNav(false)} className="block text-sm text-gray-300 hover:text-white py-1.5">Тарифы</a>
            <a href="#faq" onClick={() => setMobileNav(false)} className="block text-sm text-gray-300 hover:text-white py-1.5">FAQ</a>
            {isLoggedIn && (
              <>
                <div className="pt-2 border-t border-gray-800/50">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Быстрый доступ</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {quickMenuItems.map(({ to, icon: Icon, label, emoji }) => (
                      <Link
                        key={to}
                        to={to}
                        onClick={() => setMobileNav(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-300 hover:bg-brand-600/10 hover:text-white transition-all"
                      >
                        <Icon className="w-3.5 h-3.5 text-gray-500" />
                        <span>{label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div className="flex gap-3 pt-2 border-t border-gray-800">
              {isLoggedIn ? (
                <Link to="/" onClick={() => setMobileNav(false)} className="btn-primary text-sm flex-1 justify-center">📊 Дашборд</Link>
              ) : (
                <>
                  <Link to="/login" className="btn-ghost text-sm flex-1 justify-center">Войти</Link>
                  <Link to="/register" className="btn-primary text-sm flex-1 justify-center">Регистрация</Link>
                </>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* ══ HERO ══ */}
      <section className="relative pt-24 pb-12 md:pt-32 md:pb-20 z-10 overflow-hidden">
        <div className="relative max-w-5xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-brand-600/10 border border-brand-600/20 rounded-full px-4 py-1.5 mb-6">
            <Zap className="w-4 h-4 text-brand-400" />
            <span className="text-sm text-brand-300">Автопостинг в Steam форумы</span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold text-white leading-tight mb-5">
            Продавай и обменивай{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 via-purple-400 to-blue-400">
              Steam автоматически
            </span>
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto mb-8 leading-relaxed">
            Создавайте задачи, планируйте публикации и управляйте множеством аккаунтов.
            Telegram-бот для мониторинга. Всё в одном сервисе.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/register" className="btn bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white text-lg !px-10 !py-3.5 shadow-lg shadow-brand-600/25 transition-all hover:shadow-xl hover:shadow-brand-600/30 hover:scale-[1.02]">
              Попробовать бесплатно <ArrowRight className="w-5 h-5" />
            </Link>
            <a href="#how-it-works" className="btn-ghost text-lg !px-10 !py-3.5">
              Как это работает
            </a>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            {[
              { Icon: Zap,   text: '3 дня бесплатно',      color: 'emerald' },
              { Icon: Shield, text: 'Без карты',              color: 'blue'    },
              { Icon: Check,  text: 'Отмена в любой момент', color: 'purple'  },
            ].map(({ Icon, text, color }) => (
              <div
                key={text}
                className={clsx(
                  'group flex items-center gap-3 px-5 py-3 rounded-xl',
                  'bg-gray-800/40 backdrop-blur-sm',
                  'border border-gray-700/50',
                  'transition-all duration-300 hover:scale-105',
                  color === 'emerald' && 'hover:border-emerald-500/40 hover:bg-emerald-500/5 hover:shadow-lg hover:shadow-emerald-500/10',
                  color === 'blue'    && 'hover:border-blue-500/40 hover:bg-blue-500/5 hover:shadow-lg hover:shadow-blue-500/10',
                  color === 'purple'  && 'hover:border-purple-500/40 hover:bg-purple-500/5 hover:shadow-lg hover:shadow-purple-500/10',
                )}
              >
                <div className={clsx(
                  'w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300 group-hover:scale-110',
                  color === 'emerald' && 'bg-emerald-500/15 text-emerald-400 group-hover:shadow-md group-hover:shadow-emerald-500/20',
                  color === 'blue'    && 'bg-blue-500/15 text-blue-400 group-hover:shadow-md group-hover:shadow-blue-500/20',
                  color === 'purple'  && 'bg-purple-500/15 text-purple-400 group-hover:shadow-md group-hover:shadow-purple-500/20',
                )}>
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <span className="text-base font-medium text-gray-300 group-hover:text-white transition-colors">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Dashboard mockup */}
        <div className="relative max-w-5xl mx-auto px-4 mt-12">
          <div className="rounded-xl border border-gray-800 bg-gradient-to-b from-gray-900/80 to-gray-900/40 backdrop-blur-sm shadow-2xl shadow-brand-600/5 p-1">
            <div className="rounded-lg bg-gray-900/90 overflow-hidden">
              {/* Browser bar */}
              <div className="flex items-center gap-2 px-5 pt-3.5 pb-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                <span className="ml-3 text-xs text-gray-600">communityrig.ru/dashboard</span>
              </div>
              <div className="flex">
                {/* Mini sidebar */}
                <div className="hidden sm:flex flex-col items-center w-12 bg-gray-800/30 border-r border-gray-700/20 py-3 gap-2.5 shrink-0">
                  <div className="w-6 h-6 rounded-md bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mb-1">
                    <span className="text-[7px] text-white font-bold">SP</span>
                  </div>
                  {[Users, Target, BarChart3, Send, Shield].map((Icon, i) => (
                    <div key={i} className={clsx('w-7 h-7 rounded-lg flex items-center justify-center',
                      i === 0 ? 'bg-brand-600/15 text-brand-400' : 'text-gray-600')}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                  ))}
                </div>
                {/* Main area */}
                <div className="flex-1 p-4 sm:p-5 space-y-3">
                  {/* Greeting */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">Добрый день, Trader!</p>
                      <p className="text-[10px] text-gray-500">Тариф: <span className="text-brand-400">Pro</span></p>
                    </div>
                    <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-[10px] text-green-400">Online</span>
                    </div>
                  </div>
                  {/* Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      { label: 'Аккаунтов', value: '12', Icon: Users, color: 'text-brand-400', bg: 'bg-brand-600/10' },
                      { label: 'Задач', value: '8', Icon: Target, color: 'text-purple-400', bg: 'bg-purple-600/10' },
                      { label: 'Постов сегодня', value: '156', Icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-600/10' },
                      { label: 'Успешность', value: '98.7%', Icon: TrendingUp, color: 'text-blue-400', bg: 'bg-blue-600/10' },
                    ].map(s => (
                      <div key={s.label} className="bg-gray-800/60 rounded-lg p-3 border border-gray-700/40">
                        <div className={clsx('w-6 h-6 rounded-md flex items-center justify-center mb-1.5', s.bg)}>
                          <s.Icon className={clsx('w-3.5 h-3.5', s.color)} />
                        </div>
                        <p className="text-xl font-bold text-white">{s.value}</p>
                        <p className="text-[10px] text-gray-500">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  {/* Chart + Tasks */}
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                    {/* Chart */}
                    <div className="sm:col-span-3 bg-gray-800/60 rounded-lg p-3.5 border border-gray-700/40">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-gray-500 font-medium">Активность за неделю</p>
                        <span className="text-[10px] text-green-400 font-medium bg-green-500/10 px-1.5 py-0.5 rounded">+23%</span>
                      </div>
                      <div className="relative h-24">
                        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 280 96" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="rgba(99,102,241,0.25)" />
                              <stop offset="100%" stopColor="rgba(99,102,241,0)" />
                            </linearGradient>
                          </defs>
                          <path d="M0,72 C40,65 60,40 100,35 C140,30 160,18 200,12 C230,8 260,15 280,10 L280,96 L0,96 Z" fill="url(#areaGrad)" />
                          <path d="M0,72 C40,65 60,40 100,35 C140,30 160,18 200,12 C230,8 260,15 280,10" fill="none" stroke="rgba(99,102,241,0.7)" strokeWidth="2" />
                          <circle cx="200" cy="12" r="3" fill="#818cf8" />
                        </svg>
                        <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1">
                          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
                            <span key={d} className="text-[8px] text-gray-600">{d}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* Tasks + Progress */}
                    <div className="sm:col-span-2 bg-gray-800/60 rounded-lg p-3.5 border border-gray-700/40 flex flex-col">
                      <p className="text-xs text-gray-500 font-medium mb-2">Последние задачи</p>
                      <div className="space-y-1.5 flex-1">
                        {[
                          { Icon: CheckCircle2, text: 'Workshop Promo', color: 'text-green-400' },
                          { Icon: CheckCircle2, text: 'Sale Announce', color: 'text-green-400' },
                          { Icon: Timer, text: 'Review Request', color: 'text-yellow-400' },
                          { Icon: CheckCircle2, text: 'Trade Bump', color: 'text-green-400' },
                        ].map((t, i) => (
                          <p key={i} className="text-xs text-gray-400 truncate flex items-center gap-1.5">
                            <t.Icon className={clsx('w-3 h-3 shrink-0', t.color)} />{t.text}
                          </p>
                        ))}
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-700/30">
                        <div className="flex items-center justify-between text-[10px] mb-1">
                          <span className="text-gray-500">Успешность</span>
                          <span className="text-green-400 font-medium">96.4%</span>
                        </div>
                        <div className="h-1 bg-gray-700/50 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full" style={{ width: '96.4%' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-3/4 h-16 bg-gradient-to-r from-brand-600/10 via-purple-600/8 to-blue-600/10 blur-2xl rounded-full" />
        </div>
      </section>

      {/* ══ STATS BAR ══ */}
      <section className="relative z-10 border-y border-gray-800/50 bg-gray-900/20 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { value: '10K+', label: 'Постов опубликовано', Icon: Send },
            { value: '500+', label: 'Активных аккаунтов', Icon: Users },
            { value: '99.5%', label: 'Успешность доставки', Icon: CheckCircle2 },
            { value: '24/7', label: 'Мониторинг Telegram', Icon: Bot },
          ].map(s => (
            <div key={s.label} className="flex flex-col items-center">
              <s.Icon className="w-6 h-6 text-gray-500 mb-2" />
              <p className="text-3xl md:text-4xl font-extrabold text-white">{s.value}</p>
              <p className="text-sm text-gray-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══ MARKETPLACE ══ */}
      {/* ══ TRADES ══ */}
      <section id="trades" className="relative z-10 py-14 md:py-20 bg-gray-900/20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
            <div>
              <div className="inline-flex items-center gap-2 bg-purple-600/10 border border-purple-600/20 rounded-full px-4 py-1.5 mb-3">
                <ArrowLeftRight className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-purple-300 font-medium">P2P Обмен</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-white">
                Обменивайтесь предметами
              </h2>
              <p className="text-gray-400 mt-2">Безопасные обмены через Steam Trade Offer</p>
            </div>
            <Link to={isLoggedIn ? '/trades' : '/login'} className="btn-primary text-sm !py-2.5 !px-5 shrink-0">
              Все предложения <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {trades.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {trades.map(trade => {
                const offering = Array.isArray(trade.offering_items) ? trade.offering_items : (() => { try { return JSON.parse(trade.offering_items || '[]'); } catch { return []; } })();
                const wanted = trade.wanted_tags || [];
                const WANTED_LABELS = { any_knife: '🔪 Любой нож', any_gloves: '🧤 Любые перчатки', any_offers: '💬 Любые предложения' };
                return (
                  <div key={trade.id} className="card hover:border-gray-600 transition-all duration-300 group">
                    <div className="flex items-center gap-2 mb-3">
                      {trade.steam_avatar && <img src={trade.steam_avatar} className="w-6 h-6 rounded-full" alt="" />}
                      <span className="text-sm text-gray-300 font-medium">{trade.creator_name || 'Трейдер'}</span>
                      <span className="text-xs text-gray-600 ml-auto">{timeAgo(trade.bumped_at || trade.created_at)}</span>
                    </div>
                    {trade.title && <p className="text-sm font-semibold text-white mb-2">{trade.title}</p>}
                    {offering.length > 0 && (
                      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
                        {offering.slice(0, 4).map((it, i) => (
                          <div key={i} className="w-14 h-14 shrink-0 bg-gray-800 rounded-lg flex items-center justify-center border border-gray-700/50">
                            {it.image ? (
                              <img src={it.image} className="max-w-[48px] max-h-[48px] object-contain" alt="" />
                            ) : (
                              <span className="text-[10px] text-gray-500 text-center px-0.5 truncate">{it.name?.slice(0, 10)}</span>
                            )}
                          </div>
                        ))}
                        {offering.length > 4 && (
                          <div className="w-14 h-14 shrink-0 bg-gray-800 rounded-lg flex items-center justify-center border border-gray-700/50 text-xs text-gray-500">
                            +{offering.length - 4}
                          </div>
                        )}
                      </div>
                    )}
                    {wanted.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        <span className="text-xs text-gray-500">Хочет:</span>
                        {wanted.map(tag => (
                          <span key={tag} className="text-xs bg-purple-900/30 text-purple-300 px-2 py-0.5 rounded-full">
                            {WANTED_LABELS[tag] || tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {trade.total_value > 0 && (
                      <p className="text-xs text-gray-500 mt-2">Оценка: <span className="text-green-400 font-medium">{formatRub(trade.total_value)}</span></p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card text-center py-12">
              <ArrowLeftRight className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500">Предложений обмена пока нет</p>
              <Link to={isLoggedIn ? '/trades/create' : '/login'} className="btn-primary text-sm mt-4 inline-flex items-center gap-2">
                Создать предложение
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ══ FEATURES ══ */}
      <section id="features" className="relative z-10 py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-brand-600/10 border border-brand-600/20 rounded-full px-4 py-1.5 mb-5">
              <Zap className="w-4 h-4 text-brand-400" />
              <span className="text-sm text-brand-300 font-medium">Мощные инструменты</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4">
              Всё для продвижения в Steam
            </h2>
            <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto">
              Мощные инструменты для автоматизации публикаций на форумах Steam Community
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: Users, color: 'brand', border: 'hover:border-blue-500/40',
                glow: 'hover:shadow-blue-500/10',
                title: 'Мультиаккаунт',
                desc: 'Подключайте неограниченное количество Steam-аккаунтов. QR-код или логин/пароль — любой способ авторизации.',
              },
              {
                icon: Target, color: 'purple', border: 'hover:border-purple-500/40',
                glow: 'hover:shadow-purple-500/10',
                title: 'Умные задачи',
                desc: 'Настройте расписание, выберите форумы и темы. Бот автоматически создаст посты в нужное время.',
              },
              {
                icon: Clock, color: 'blue', border: 'hover:border-cyan-500/40',
                glow: 'hover:shadow-cyan-500/10',
                title: 'Гибкое расписание',
                desc: 'Планируйте публикации по дням недели и часам. Множество слотов — полный контроль над временем.',
              },
              {
                icon: Bot, color: 'green', border: 'hover:border-green-500/40',
                glow: 'hover:shadow-green-500/10',
                title: 'Telegram уведомления',
                desc: 'Мониторьте работу через Telegram-бота. Статус задач, ошибки, статистика — всё в мессенджере.',
              },
              {
                icon: Shield, color: 'yellow', border: 'hover:border-yellow-500/40',
                glow: 'hover:shadow-yellow-500/10',
                title: 'Безопасность',
                desc: 'Сессии хранятся в зашифрованном виде. Steam Guard и 2FA поддерживаются из коробки.',
              },
              {
                icon: BarChart3, color: 'red', border: 'hover:border-red-500/40',
                glow: 'hover:shadow-red-500/10',
                title: 'Аналитика',
                desc: 'Отслеживайте успешность публикаций, историю задач и производительность аккаунтов.',
              },
            ].map(({ icon: Icon, color, border, glow, title, desc }) => (
              <div
                key={title}
                className={clsx(
                  'group relative card p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl',
                  border, glow
                )}
              >
                {/* Glow background on hover */}
                <div className={clsx(
                  'absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none',
                  color === 'brand'  && 'bg-gradient-to-br from-blue-600/8 via-transparent to-transparent',
                  color === 'purple' && 'bg-gradient-to-br from-purple-600/8 via-transparent to-transparent',
                  color === 'blue'   && 'bg-gradient-to-br from-cyan-600/8 via-transparent to-transparent',
                  color === 'green'  && 'bg-gradient-to-br from-green-600/8 via-transparent to-transparent',
                  color === 'yellow' && 'bg-gradient-to-br from-yellow-600/8 via-transparent to-transparent',
                  color === 'red'    && 'bg-gradient-to-br from-red-600/8 via-transparent to-transparent',
                )} />
                <div className={clsx(
                  'relative w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-all duration-300 group-hover:scale-110',
                  color === 'brand'  && 'bg-blue-500/15 text-blue-400 group-hover:bg-blue-500/25 group-hover:shadow-lg group-hover:shadow-blue-500/20',
                  color === 'purple' && 'bg-purple-500/15 text-purple-400 group-hover:bg-purple-500/25 group-hover:shadow-lg group-hover:shadow-purple-500/20',
                  color === 'blue'   && 'bg-cyan-500/15 text-cyan-400 group-hover:bg-cyan-500/25 group-hover:shadow-lg group-hover:shadow-cyan-500/20',
                  color === 'green'  && 'bg-green-500/15 text-green-400 group-hover:bg-green-500/25 group-hover:shadow-lg group-hover:shadow-green-500/20',
                  color === 'yellow' && 'bg-yellow-500/15 text-yellow-400 group-hover:bg-yellow-500/25 group-hover:shadow-lg group-hover:shadow-yellow-500/20',
                  color === 'red'    && 'bg-red-500/15 text-red-400 group-hover:bg-red-500/25 group-hover:shadow-lg group-hover:shadow-red-500/20',
                )}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="relative text-lg font-bold text-white mb-2">{title}</h3>
                <p className="relative text-gray-400 text-base leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ══ */}
      <section id="how-it-works" className="relative z-10 py-14 md:py-20 bg-gray-900/20 border-y border-gray-800/50">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4">
              Начните за 3 минуты
            </h2>
            <p className="text-gray-400 text-lg md:text-xl">
              Простая настройка — никакого кодинга или сложных конфигураций
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                step: '01',
                title: 'Подключите аккаунт',
                desc: 'Авторизуйтесь через QR-код Steam или введите логин/пароль. Мы безопасно сохраним сессию.',
                Icon: Lock,
                gradient: 'from-brand-600/20 to-transparent',
              },
              {
                step: '02',
                title: 'Создайте задачу',
                desc: 'Укажите форум, текст поста и расписание. Выберите дни недели и время публикации.',
                Icon: FileText,
                gradient: 'from-purple-600/20 to-transparent',
              },
              {
                step: '03',
                title: 'Запустите бота',
                desc: 'Бот автоматически публикует посты по расписанию. Следите за результатами в Dashboard.',
                Icon: Play,
                gradient: 'from-green-600/20 to-transparent',
              },
            ].map(({ step, title, desc, Icon, gradient }) => (
              <div key={step} className="group">
                <div className={clsx(
                  'card text-center transition-all duration-300 hover:-translate-y-1 hover:border-gray-600 bg-gradient-to-b',
                  gradient
                )}>
                  <div className="w-12 h-12 rounded-xl bg-gray-800/80 border border-gray-700/50 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                    <Icon className="w-6 h-6 text-gray-300" />
                  </div>
                  <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-600/20 text-brand-400 text-xs font-bold mb-2">
                    {step}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                  <p className="text-gray-400 text-base leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ USE CASES ══ */}
      <section className="relative z-10 py-14 md:py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4">
              Примеры использования
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                Icon: Gamepad2, color: 'text-brand-400',
                title: 'Продвижение вашей игры',
                desc: 'Автоматически размещайте посты в форумах Steam Hub вашей игры. Анонсы обновлений, распродажи, мероприятия — всё по расписанию.',
                tags: ['Indie-разработчикам', 'Студиям', 'Паблишерам'],
              },
              {
                Icon: Palette, color: 'text-purple-400',
                title: 'Раскрутка мастерской',
                desc: 'Рекламируйте ваши предметы из Workshop. Настройте автопостинг в популярные форумы для максимального охвата.',
                tags: ['Моддерам', 'Художникам', 'Создателям карт'],
              },
              {
                Icon: DollarSign, color: 'text-green-400',
                title: 'Торговля и продажи',
                desc: 'Публикуйте объявления о продаже и обмене. Несколько аккаунтов — больше охват в торговых разделах.',
                tags: ['Трейдерам', 'Магазинам', 'Сообществам'],
              },
              {
                Icon: TrendingUp, color: 'text-blue-400',
                title: 'Маркетинг и аналитика',
                desc: 'Отслеживайте эффективность постов, А/Б тестируйте разные тексты и время публикации для максимальной конверсии.',
                tags: ['Маркетологам', 'SMM-агентствам', 'Командам'],
              },
            ].map(({ Icon, color, title, desc, tags }) => (
              <div key={title} className="card hover:border-gray-600 transition-all duration-300 group">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-800 border border-gray-700/50 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Icon className={clsx('w-5 h-5', color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-white mb-1.5">{title}</h3>
                    <p className="text-gray-400 text-base leading-relaxed mb-3">{desc}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map(t => (
                        <span key={t} className="badge-blue">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PRICING ══ */}
      <section id="pricing" className="relative z-10 py-14 md:py-20 bg-gray-900/20 border-y border-gray-800/50">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-brand-600/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4">
              Выберите тариф
            </h2>
            <p className="text-gray-400 text-lg md:text-xl mb-6">
              Начните бесплатно, масштабируйтесь по мере роста
            </p>

            <div className="inline-flex items-center gap-1 bg-gray-800/60 rounded-full p-1 border border-gray-700/50">
              <button
                onClick={() => setPeriod('monthly')}
                className={clsx(
                  'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                  period === 'monthly' ? 'bg-brand-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                )}
              >
                Ежемесячно
              </button>
              <button
                onClick={() => setPeriod('yearly')}
                className={clsx(
                  'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                  period === 'yearly' ? 'bg-brand-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                )}
              >
                Ежегодно <span className="text-green-400 ml-1">-20%</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
            {plans.map(plan => {
              const price = period === 'yearly' ? (plan.price_yearly_rub ?? plan.price_yearly) : (plan.price_monthly_rub ?? plan.price_monthly);
              const isPopular = plan.id === 'pro';
              return (
                <div
                  key={plan.id}
                  className={clsx(
                    'group relative card flex flex-col transition-all duration-300',
                    'hover:-translate-y-2 hover:shadow-xl',
                    isPopular
                      ? 'ring-2 ring-brand-500/50 border-brand-600 hover:shadow-brand-600/20 hover:ring-brand-400/60'
                      : 'hover:border-gray-600 hover:shadow-gray-900/50'
                  )}
                >
                  <div className={clsx(
                    'absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none',
                    isPopular
                      ? 'bg-gradient-to-b from-brand-600/10 to-transparent'
                      : 'bg-gradient-to-b from-gray-700/10 to-transparent'
                  )} />

                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-gradient-to-r from-brand-600 to-brand-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg flex items-center gap-1">
                        <Zap className="w-3 h-3" /> Популярный
                      </span>
                    </div>
                  )}
                  <div className="relative mb-4">
                    <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                    <div className="mt-2">
                      <span className="text-4xl font-extrabold text-white">
                        {price === 0 ? 'Бесплатно' : `${price.toLocaleString('ru')} ₽`}
                      </span>
                      {price > 0 && (
                        <span className="text-gray-500 text-base ml-1.5">
                          / {period === 'yearly' ? 'год' : 'мес'}
                        </span>
                      )}
                    </div>
                  </div>

                  <ul className="relative space-y-2.5 flex-1 mb-6 text-base">
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
                      'relative btn w-full text-base transition-all duration-300',
                      isPopular
                        ? 'bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white shadow-lg shadow-brand-600/25 group-hover:shadow-xl group-hover:shadow-brand-600/30'
                        : 'bg-gray-800 hover:bg-gray-700 text-white group-hover:bg-gray-700'
                    )}
                  >
                    {price === 0 ? 'Начать бесплатно' : 'Попробовать бесплатно'}
                  </Link>
                </div>
              );
            })}
          </div>

          <p className="text-center text-gray-400 text-base mt-8">
            Все платные тарифы включают 3 дня бесплатного пробного периода
          </p>
        </div>
      </section>

      {/* ══ FAQ ══ */}
      <section id="faq" className="relative z-10 py-14 md:py-20">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-3xl md:text-5xl font-extrabold text-white text-center mb-10">
            Частые вопросы
          </h2>

          <div className="space-y-2">
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
                className="w-full card text-left hover:border-gray-600 transition-all duration-200"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white text-base pr-4">{q}</span>
                  <ChevronDown className={clsx(
                    'w-5 h-5 text-gray-500 shrink-0 transition-transform duration-200',
                    faqOpen === i && 'rotate-180 text-brand-400'
                  )} />
                </div>
                <div className={clsx(
                  'overflow-hidden transition-all duration-200',
                  faqOpen === i ? 'max-h-40 mt-3 opacity-100' : 'max-h-0 opacity-0'
                )}>
                  <p className="text-gray-400 text-base leading-relaxed">{a}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA ══ */}
      <section className="relative z-10 py-14 md:py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="relative group">
            {/* Animated gradient glow */}
            <div className="absolute -inset-1 rounded-2xl opacity-30 blur-xl"
                 style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6, #06b6d4, #3b82f6)', backgroundSize: '300% 300%', animation: 'gradient-shift 6s ease infinite' }} />
            <div className="relative card bg-gradient-to-b from-gray-900 to-gray-950 border-brand-600/30 p-6 sm:p-10 md:p-14 overflow-hidden">
              {/* Shimmer sweep */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent"
                     style={{ animation: 'shimmer-sweep 5s ease-in-out infinite' }} />
              </div>
              {/* Floating particles */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {[
                  { x: '10%', y: '20%', s: 2, d: '0s', dur: '18s', orb: 1 },
                  { x: '85%', y: '15%', s: 3, d: '2s', dur: '22s', orb: 2 },
                  { x: '20%', y: '70%', s: 2, d: '5s', dur: '20s', orb: 3 },
                  { x: '75%', y: '80%', s: 2, d: '3s', dur: '24s', orb: 1 },
                  { x: '50%', y: '30%', s: 1.5, d: '7s', dur: '26s', orb: 2 },
                  { x: '90%', y: '55%', s: 2, d: '1s', dur: '19s', orb: 3 },
                ].map((p, i) => (
                  <div key={i} className="absolute rounded-full bg-brand-400/30"
                       style={{ left: p.x, top: p.y, width: p.s, height: p.s, animationDelay: p.d,
                         animation: `orb-drift-${p.orb} ${p.dur} ease-in-out infinite` }} />
                ))}
              </div>
              <div className="relative z-10">
                <Rocket className="w-12 h-12 text-brand-400 mx-auto mb-5" style={{ filter: 'drop-shadow(0 0 10px rgba(59,130,246,0.5))' }} />
                <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4">
                  Готовы начать?
                </h2>
                <p className="text-gray-400 text-lg md:text-xl mb-8 max-w-xl mx-auto">
                  Присоединяйтесь к сотням пользователей, которые уже автоматизировали продвижение в Steam.
                  3 дня бесплатно — без ограничений.
                </p>
                <Link to="/register" className="btn bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white text-lg !px-10 !py-3.5 shadow-xl shadow-brand-600/25 transition-all hover:shadow-2xl hover:shadow-brand-600/30 hover:scale-[1.02] relative overflow-hidden">
                  <span className="relative z-10 flex items-center gap-2">Создать аккаунт бесплатно <ArrowRight className="w-5 h-5" /></span>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" style={{ animation: 'shimmer-sweep 3s ease-in-out infinite' }} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer className="relative z-10 border-t border-gray-800/50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-[10px]">SP</span>
              </div>
              <span className="text-gray-400 text-base">Steam Poster Bot © {new Date().getFullYear()}</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-base text-gray-500">
              <Link to="/trades" className="hover:text-white transition-colors">P2P Обмен</Link>
              <Link to="/login" className="hover:text-white transition-colors">Войти</Link>
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
  // Free plan — only P2P trades
  if (plan.id === 'free') {
    f.push('P2P обмен предметами');
    f.push('Баланс и вывод средств');
    return f;
  }
  // Paid plans — all posting features + trades
  f.push('P2P обмен предметами');
  f.push(`${plan.max_steam_accounts === -1 ? '∞' : plan.max_steam_accounts} Steam аккаунтов`);
  f.push(`${plan.max_campaigns === -1 ? '∞' : plan.max_campaigns} задач`);
  f.push(`${plan.max_jobs_per_day === -1 ? '∞' : plan.max_jobs_per_day} постов / день`);
  if (plan.max_steam_groups > 0) f.push(`${plan.max_steam_groups} Steam-групп`);
  if (plan.max_telegram_bots > 0) f.push(`Telegram бот (${plan.max_telegram_bots})`);
  if (plan.has_mini_app) f.push('Telegram Mini App');
  if (plan.has_ai_templates) f.push('AI шаблоны');
  if (plan.has_analytics) f.push('Аналитика');
  if (plan.has_api_access) f.push('API доступ');
  if (plan.has_priority_support) f.push('Приоритетная поддержка');
  return f;
}
