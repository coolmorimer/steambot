import { useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, Users, Megaphone, Activity,
  Send, Settings, CreditCard, LogOut, ChevronLeft,
  ChevronRight, ShieldCheck, Menu, X, Code2,
  ArrowLeftRight, Wallet, Globe, Sparkles, Gift,
} from 'lucide-react';
import clsx from 'clsx';
import SupportWidget from './SupportWidget';
import OnboardingTour from './OnboardingTour';

const baseNavItems = [
  { to: '/',            icon: LayoutDashboard, label: 'Обзор',         emoji: '📊', tourId: 'nav-overview'     },
  { to: '/accounts',    icon: Users,           label: 'Аккаунты',      emoji: '👤', tourId: 'nav-accounts'     },
  { to: '/campaigns',   icon: Megaphone,       label: 'Кампании',      emoji: '📢', tourId: 'nav-campaigns'    },
  { to: '/activity',    icon: Activity,        label: 'Активность',    emoji: '⚡', tourId: 'nav-activity'     },
  { to: '/telegram',    icon: Send,            label: 'Telegram бот',  emoji: '🤖', tourId: 'nav-telegram'     },
  { to: '/api',         icon: Code2,           label: 'API',           emoji: '🔗', tourId: 'nav-api'          },
  null,
  { to: '/trades',      icon: ArrowLeftRight,  label: 'P2P Обмен',     emoji: '🔄', tourId: 'nav-trades'       },
  { to: '/balance',     icon: Wallet,          label: 'Баланс',        emoji: '💰', tourId: 'nav-balance', partnerOnly: true },
  null,
  { to: '/settings',    icon: Settings,        label: 'Настройки',     emoji: '⚙️', tourId: 'nav-settings'     },
  { to: '/subscription',icon: CreditCard,      label: 'Подписка',      emoji: '💎', tourId: 'nav-subscription' },
  { to: '/referrals',   icon: Gift,            label: 'Рефералы',      emoji: '🎁', tourId: 'nav-referrals'    },
];

const adminItem = { to: '/admin', icon: ShieldCheck, label: 'Админ', emoji: '🛡️' };

export default function Layout() {
  const { user, logout, isAdmin, isPartner } = useAuth();
  const navigate   = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/landing');
  };

  const navItems = baseNavItems.filter(item => !item?.partnerOnly || isPartner || isAdmin);
  const items = isAdmin ? [...navItems, adminItem] : navItems;

  const planColors = {
    'Free': 'from-gray-500 to-gray-400',
    'Starter': 'from-blue-500 to-cyan-400',
    'Pro': 'from-brand-500 to-purple-400',
    'Business': 'from-amber-500 to-orange-400',
  };
  const planName = user?.subscription?.plan_name || 'Free';
  const planGrad = planColors[planName] || planColors.Free;

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={clsx(
        'flex items-center gap-3 px-4 py-5 border-b border-gray-800/40',
        collapsed && 'justify-center'
      )}>
        <Link to="/landing" className="relative shrink-0 group" title="На сайт">
          <div className="w-9 h-9 bg-gradient-to-br from-brand-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-brand-600/20 group-hover:shadow-brand-500/40 transition-shadow">
            SP
          </div>
          <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-gray-900" />
        </Link>
        {!collapsed && (
          <div>
            <span className="font-bold text-white text-sm tracking-tight">SteamPoster</span>
            <span className="block text-[10px] text-gray-500 -mt-0.5">Dashboard</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {items.map((item, idx) => {
          if (!item) return <div key={`sep-${idx}`} className="my-2 mx-3 border-t border-gray-800/40" />;
          const { to, icon: Icon, label, emoji, tourId } = item;
          return (
            <div key={to} className={clsx(collapsed && 'tooltip-wrap')} data-tour={tourId}>
              <NavLink
                to={to}
                end={to === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-200',
                    isActive
                      ? 'bg-brand-600/15 text-brand-300 shadow-sm border border-brand-500/10'
                      : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200',
                    collapsed && 'justify-center px-2'
                  )
                }
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </NavLink>
              {collapsed && <span className="tooltip-text">{emoji} {label}</span>}
            </div>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-gray-800/40 p-3 space-y-2">
        {!collapsed && (
          <div className="rounded-xl bg-gray-800/40 p-3">
            <div className="flex items-center gap-2.5">
              {user?.steam_avatar ? (
                <img src={user.steam_avatar} className="w-8 h-8 rounded-lg object-cover ring-2 ring-gray-700/50" alt="" />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500/20 to-purple-500/20 flex items-center justify-center text-brand-400 text-xs font-bold">
                  {(user?.name || user?.email || '?')[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">
                  {user?.steam_username || user?.name || user?.email?.split('@')[0]}
                </p>
                <span className={clsx(
                  'inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gradient-to-r text-white',
                  planGrad
                )}>
                  {planName}
                </span>
              </div>
            </div>
          </div>
        )}
        <Link
          to="/landing"
          className={clsx(
            'flex items-center gap-2.5 w-full rounded-xl px-3 py-2 text-sm text-gray-400 hover:bg-brand-600/10 hover:text-brand-300 transition-all duration-200',
            collapsed && 'justify-center'
          )}
        >
          <Globe className="w-4 h-4 shrink-0" />
          {!collapsed && <span>На сайт</span>}
        </Link>
        <button
          onClick={handleLogout}
          className={clsx(
            'flex items-center gap-2.5 w-full rounded-xl px-3 py-2 text-sm text-gray-500 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200',
            collapsed && 'justify-center'
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Выйти</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="hidden lg:flex items-center justify-center border-t border-gray-800/40 py-3 text-gray-600 hover:text-gray-300 transition-colors"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {/* Desktop sidebar */}
      <aside
        className={clsx(
          'hidden lg:flex flex-col bg-gray-900/95 backdrop-blur-xl border-r border-gray-800/40 transition-all duration-300 shrink-0',
          collapsed ? 'w-[60px]' : 'w-56'
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-50 w-64 h-full bg-gray-900/98 backdrop-blur-xl border-r border-gray-800/40 flex flex-col animate-slide-in-r">
            <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-3 text-gray-500 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-gray-900/80 backdrop-blur-xl border-b border-gray-800/40">
          <button onClick={() => setMobileOpen(true)} className="text-gray-400 hover:text-white p-1">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-brand-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-[10px]">SP</div>
            <span className="font-bold text-white text-sm">SteamPoster</span>
          </div>
          <div className="w-8" /> {/* spacer */}
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      <SupportWidget />
      {user?.id && <OnboardingTour userId={user.id} />}
    </div>
  );
}
