import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, CreditCard, Activity, TrendingUp, ShieldCheck } from 'lucide-react';
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
    { label: 'Всего пользователей', value: stats.users?.total ?? 0,    icon: Users,    color: 'blue',   to: '/admin/users' },
    { label: 'Активных подписок',   value: stats.subscriptions?.active ?? 0, icon: CreditCard, color: 'green', to: '/admin/users' },
    { label: 'Сегодня заданий',     value: stats.jobs?.today ?? 0,      icon: Activity, color: 'purple', to: '/activity' },
    { label: 'MRR (план)',          value: `$${stats.revenue?.mrr ?? 0}`, icon: TrendingUp, color: 'yellow', to: '#' },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-6 h-6 text-brand-400" />
        <h1 className="text-xl font-bold text-white">Администрация</h1>
      </div>

      {/* Nav pills */}
      <div className="flex gap-2 flex-wrap">
        <Link to="/admin"        className="badge-blue">Обзор</Link>
        <Link to="/admin/users"  className="badge-gray hover:bg-gray-600">Пользователи</Link>
        <Link to="/admin/plans"  className="badge-gray hover:bg-gray-600">Тарифы</Link>
        <Link to="/admin/config"   className="badge-gray hover:bg-gray-600">Конфигурация</Link>
        <Link to="/admin/support" className="badge-gray hover:bg-gray-600">Поддержка</Link>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-24 animate-pulse bg-gray-800" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map(({ label, value, icon: Icon, to }) => (
            <Link key={label} to={to} className="card hover:border-gray-600 transition-colors">
              <p className="text-2xl font-bold text-white">{value}</p>
              <p className="text-xs text-gray-500 mt-1">{label}</p>
            </Link>
          ))}
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
                    style={{ width: `${Math.min(100, (count / (stats.users?.total || 1)) * 100)}%` }}
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
