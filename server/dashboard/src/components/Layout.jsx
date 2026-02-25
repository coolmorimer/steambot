import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, Users, Megaphone, Activity,
  Send, Settings, CreditCard, LogOut, ChevronLeft,
  ChevronRight, ShieldCheck, Menu, X,
} from 'lucide-react';
import clsx from 'clsx';

const navItems = [
  { to: '/',            icon: LayoutDashboard, label: 'Обзор' },
  { to: '/accounts',    icon: Users,           label: 'Аккаунты' },
  { to: '/campaigns',   icon: Megaphone,       label: 'Кампании' },
  { to: '/activity',    icon: Activity,        label: 'Активность' },
  { to: '/telegram',    icon: Send,            label: 'Telegram бот' },
  { to: '/settings',    icon: Settings,        label: 'Настройки' },
  { to: '/subscription',icon: CreditCard,      label: 'Подписка' },
];

const adminItem = { to: '/admin', icon: ShieldCheck, label: 'Администрация' };

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate   = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const items = isAdmin ? [...navItems, adminItem] : navItems;

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={clsx('flex items-center gap-3 px-4 py-5 border-b border-gray-800', collapsed && 'justify-center')}>
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0">SP</div>
        {!collapsed && <span className="font-semibold text-white truncate">SteamPoster</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-brand-600/20 text-brand-400'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white',
                collapsed && 'justify-center'
              )
            }
          >
            <Icon className="w-5 h-5 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User + logout */}
      <div className="border-t border-gray-800 p-3 space-y-1">
        {!collapsed && (
          <div className="px-2 py-2">
            <p className="text-xs font-medium text-white truncate">{user?.name || user?.email}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            {user?.subscription && (
              <span className="badge-blue mt-1">{user.subscription.plan_name}</span>
            )}
          </div>
        )}
        <button
          onClick={handleLogout}
          className={clsx(
            'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors',
            collapsed && 'justify-center'
          )}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Выйти</span>}
        </button>
      </div>

      {/* Collapse toggle (desktop) */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="hidden lg:flex items-center justify-center border-t border-gray-800 py-3 text-gray-500 hover:text-white transition-colors"
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
          'hidden lg:flex flex-col bg-gray-900 border-r border-gray-800 transition-all duration-200 shrink-0',
          collapsed ? 'w-16' : 'w-56'
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-50 w-56 h-full bg-gray-900 border-r border-gray-800 flex flex-col">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800">
          <button onClick={() => setMobileOpen(true)} className="text-gray-400 hover:text-white">
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-semibold text-white">SteamPoster</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
