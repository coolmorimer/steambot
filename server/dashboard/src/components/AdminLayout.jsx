import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Users, CreditCard, Settings,
  MessageCircle, Receipt, Banknote, Handshake, ArrowLeft,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

const adminNav = [
  { to: '/admin',             icon: LayoutDashboard, label: 'Обзор',         end: true },
  { to: '/admin/users',       icon: Users,           label: 'Пользователи'           },
  { to: '/admin/plans',       icon: CreditCard,      label: 'Тарифы'                 },
  { to: '/admin/payments',    icon: Receipt,         label: 'Платежи'                },
  { to: '/admin/withdrawals', icon: Banknote,        label: 'Выводы'                 },
  { to: '/admin/partners',    icon: Handshake,       label: 'Партнёры'               },
  { to: '/admin/config',      icon: Settings,        label: 'Конфигурация'            },
  { to: '/admin/support',     icon: MessageCircle,   label: 'Поддержка'              },
];

export default function AdminLayout() {
  return (
    <div className="flex gap-6 min-h-0">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-52 shrink-0 sticky top-4 self-start">
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 backdrop-blur-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Администрация</p>
          </div>
          <nav className="p-2 space-y-0.5">
            {adminNav.map(({ to, icon: Icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => clsx(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  isActive
                    ? 'bg-brand-600/15 text-brand-400 border border-brand-600/20'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/60 border border-transparent'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="p-2 border-t border-gray-800">
            <Link
              to="/"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-white hover:bg-gray-800/60 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Назад в Dashboard
            </Link>
          </div>
        </div>
      </aside>

      {/* Mobile nav */}
      <div className="lg:hidden flex gap-1.5 flex-wrap mb-4 w-full">
        {adminNav.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => clsx(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
              isActive
                ? 'bg-brand-600/15 text-brand-400 border-brand-600/30'
                : 'text-gray-400 hover:text-white bg-gray-800/40 border-gray-700/50 hover:border-gray-600'
            )}
          >
            {label}
          </NavLink>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
