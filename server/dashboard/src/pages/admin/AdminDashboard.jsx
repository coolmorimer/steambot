import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, CreditCard, Activity, TrendingUp, Banknote, Receipt, Clock } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/stats')
      .then(r => setStats(r.data))
      .catch(() => toast.error('Ошибка загрузки статистики'))
      .finally(() => setLoading(false));
  }, []);

  const cards = stats ? [
    { label: 'Всего пользователей', value: stats.users?.total ?? stats.total_users ?? 0,    icon: Users,    color: 'blue',   to: '/admin/users' },
    { label: 'Активных подписок',   value: stats.subscriptions?.active ?? stats.active_subscriptions ?? 0, icon: CreditCard, color: 'green', to: '/admin/users' },
    { label: 'Сегодня заданий',     value: stats.jobs?.today ?? stats.jobs_today ?? 0,      icon: Activity, color: 'purple', to: '/activity' },
    { label: 'MRR',                 value: `${(stats.revenue?.mrr ?? 0).toLocaleString('ru')} ₽`, icon: TrendingUp, color: 'yellow', to: '/admin/payments' },
    { label: 'Доход (всего)',       value: `${(stats.revenue?.total ?? stats.revenue_total ?? 0).toLocaleString('ru')} ₽`, icon: Banknote, color: 'green', to: '/admin/payments' },
    { label: 'Доход (30 дней)',     value: `${(stats.revenue?.last30d ?? 0).toLocaleString('ru')} ₽`, icon: Receipt, color: 'blue', to: '/admin/payments' },
    { label: 'Всего платежей',      value: stats.payments?.total ?? 0, icon: CreditCard, color: 'gray', to: '/admin/payments' },
    { label: 'Ожидают оплаты',      value: stats.payments?.pending ?? 0, icon: Clock, color: 'yellow', to: '/admin/payments?status=pending' },
  ] : [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-white">Обзор</h1>

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="card h-24 animate-pulse bg-gray-800" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map(({ label, value, icon: Icon, to }) => (
            <Link key={label} to={to} className="card hover:border-gray-600 transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-white">{value}</p>
                <Icon className="w-5 h-5 text-gray-600" />
              </div>
              <p className="text-xs text-gray-500 mt-1">{label}</p>
            </Link>
          ))}
        </div>
      )}

      {/* Recent transactions */}
      {stats?.recent_transactions?.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Последние платежи</h2>
            <Link to="/admin/payments" className="text-sm text-brand-400 hover:underline">Все →</Link>
          </div>
          <div className="space-y-2">
            {stats.recent_transactions.map(tx => {
              const st = { completed: 'badge-green', pending: 'badge-yellow', failed: 'badge-red', refunded: 'badge-blue' };
              const stl = { completed: 'Оплачено', pending: 'Ожидание', failed: 'Ошибка', refunded: 'Возврат' };
              return (
                <div key={tx.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 truncate">{tx.user_email || tx.user_name || '—'}</p>
                    <p className="text-xs text-gray-500">{new Date(tx.created_at).toLocaleString('ru')}</p>
                  </div>
                  <span className={clsx('shrink-0', st[tx.status] || 'badge-gray')}>{stl[tx.status] || tx.status}</span>
                  <span className="text-sm font-semibold text-white">{Number(tx.amount).toLocaleString('ru')} ₽</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent users */}
      {stats?.recent_users?.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Последние регистрации</h2>
            <Link to="/admin/users" className="text-sm text-brand-400 hover:underline">Все →</Link>
          </div>
          <div className="space-y-2">
            {stats.recent_users.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800/50">
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-300 shrink-0">
                  {(u.name || u.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">{u.name || '—'}</p>
                  <p className="text-xs text-gray-500 truncate">{u.email}</p>
                </div>
                <span className={clsx('shrink-0', u.role === 'admin' ? 'badge-blue' : 'badge-gray')}>{u.role}</span>
                <span className="text-xs text-gray-600 hidden sm:inline">
                  {new Date(u.created_at).toLocaleDateString('ru')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plan distribution */}
      {stats?.plan_distribution?.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-white mb-4">Распределение по тарифам</h2>
          <div className="space-y-3">
            {stats.plan_distribution.map(({ plan_id, plan_name, count }) => (
              <div key={plan_id} className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-24 capitalize">{plan_name || plan_id}</span>
                <div className="flex-1 bg-gray-800 rounded-full h-2">
                  <div
                    className="bg-brand-600 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (count / (stats.users?.total || stats.total_users || 1)) * 100)}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-white w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
