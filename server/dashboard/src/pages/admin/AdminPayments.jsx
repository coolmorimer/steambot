import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Receipt, Search, Filter, ChevronLeft, ChevronRight,
  RefreshCw, CheckCircle2, XCircle, Clock, RotateCcw,
  Banknote, TrendingUp, CreditCard, Calendar,
} from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const STATUS_MAP = {
  completed: { label: 'Оплачено',  badge: 'badge-green',  icon: '✅' },
  pending:   { label: 'Ожидание',  badge: 'badge-yellow', icon: '⏳' },
  failed:    { label: 'Ошибка',    badge: 'badge-red',    icon: '❌' },
  refunded:  { label: 'Возврат',   badge: 'badge-blue',   icon: '↩️' },
};

const METHOD_MAP = {
  sberbank: '💳 Банковская карта',
  sbp:      '💳 СБП',
  stripe:   '💳 Stripe',
  manual:   '🛠 Вручную',
};

export default function AdminPayments() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '');
  const [filterMethod, setFilterMethod] = useState('');
  const [selected, setSelected] = useState(null); // detail modal
  const [refreshing, setRefreshing] = useState(false);
  const limit = 25;

  const loadTransactions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('limit', limit);
      params.set('offset', page * limit);
      if (filterStatus) params.set('status', filterStatus);
      if (filterMethod) params.set('method', filterMethod);
      if (search) params.set('search', search);
      const { data } = await api.get(`/admin/payments?${params}`);
      setTransactions(data.transactions || []);
      setTotal(data.total || 0);
    } catch {
      toast.error('Ошибка загрузки платежей');
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterMethod, search]);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/payments/stats');
      setStats(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { setLoading(true); loadTransactions(); }, [loadTransactions]);

  const handleSearch = e => {
    e.preventDefault();
    setPage(0);
    loadTransactions();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadTransactions(), loadStats()]);
    setRefreshing(false);
    toast.success('Обновлено');
  };

  const handleStatusChange = async (txId, newStatus) => {
    if (!confirm(`Изменить статус на "${STATUS_MAP[newStatus]?.label || newStatus}"?`)) return;
    try {
      await api.patch(`/admin/payments/${txId}`, { status: newStatus });
      toast.success('Статус обновлён');
      loadTransactions();
      loadStats();
      setSelected(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const pages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Link to="/admin" className="text-gray-500 hover:text-white text-sm">← Назад</Link>
        <span className="text-gray-700">/</span>
        <h1 className="text-xl font-bold text-white">Платежи</h1>
        <button onClick={handleRefresh} className="btn-ghost ml-auto flex items-center gap-1.5 text-xs" disabled={refreshing}>
          <RefreshCw className={clsx('w-3.5 h-3.5', refreshing && 'animate-spin')} />
          Обновить
        </button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Banknote} label="Доход (всего)" value={`${stats.revenue?.total?.toLocaleString('ru') || 0} ₽`} />
          <StatCard icon={TrendingUp} label="За 30 дней" value={`${stats.revenue?.last30d?.toLocaleString('ru') || 0} ₽`} />
          <StatCard icon={Calendar} label="За 7 дней" value={`${stats.revenue?.last7d?.toLocaleString('ru') || 0} ₽`} />
          <StatCard icon={CreditCard} label="Сегодня" value={`${stats.revenue?.today?.toLocaleString('ru') || 0} ₽`} />
        </div>
      )}

      {/* Stats summary row */}
      {stats?.counts && (
        <div className="flex gap-2 flex-wrap text-xs">
          <span className="badge-gray">Всего: {stats.counts.total}</span>
          <span className="badge-green">Оплачено: {stats.counts.completed}</span>
          <span className="badge-yellow">Ожидание: {stats.counts.pending}</span>
          <span className="badge-red">Ошибки: {stats.counts.failed}</span>
          <span className="badge-blue">Возвраты: {stats.counts.refunded}</span>
        </div>
      )}

      {/* Breakdown by method & plan */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {stats.byMethod?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-white mb-2">По способу оплаты</h3>
              <div className="space-y-1.5">
                {stats.byMethod.map(m => (
                  <div key={m.method} className="flex justify-between text-sm">
                    <span className="text-gray-400">{METHOD_MAP[m.method] || m.method || '—'}</span>
                    <span className="text-white">{m.count} шт · {Number(m.total).toLocaleString('ru')} ₽</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stats.byPlan?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-white mb-2">По тарифам</h3>
              <div className="space-y-1.5">
                {stats.byPlan.map(p => (
                  <div key={p.plan_id} className="flex justify-between text-sm">
                    <span className="text-gray-400 capitalize">{p.plan_name || p.plan_id || '—'}</span>
                    <span className="text-white">{p.count} шт · {Number(p.total).toLocaleString('ru')} ₽</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="label">Поиск</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                className="input pl-9"
                placeholder="Email, имя или ID платежа..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="w-36">
            <label className="label">Статус</label>
            <select className="input" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0); }}>
              <option value="">Все</option>
              <option value="completed">Оплачено</option>
              <option value="pending">Ожидание</option>
              <option value="failed">Ошибка</option>
              <option value="refunded">Возврат</option>
            </select>
          </div>
          <div className="w-36">
            <label className="label">Способ</label>
            <select className="input" value={filterMethod} onChange={e => { setFilterMethod(e.target.value); setPage(0); }}>
              <option value="">Все</option>
              <option value="sbp">СБП</option>
              <option value="stripe">Stripe</option>
              <option value="manual">Вручную</option>
            </select>
          </div>
          <button type="submit" className="btn-primary h-[38px]">
            <Filter className="w-4 h-4" /> Поиск
          </button>
        </form>
      </div>

      {/* Transactions table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-gray-800 rounded animate-pulse" />)}
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>Транзакций не найдено</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                <th className="pb-2 pr-2">Дата</th>
                <th className="pb-2 pr-2">Пользователь</th>
                <th className="pb-2 pr-2">Тариф</th>
                <th className="pb-2 pr-2">Период</th>
                <th className="pb-2 pr-2">Сумма</th>
                <th className="pb-2 pr-2">Способ</th>
                <th className="pb-2 pr-2">Статус</th>
                <th className="pb-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => {
                const s = STATUS_MAP[tx.status] || { label: tx.status, badge: 'badge-gray' };
                return (
                  <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2 pr-2 text-gray-400 whitespace-nowrap text-xs">
                      {new Date(tx.created_at).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2 pr-2">
                      <div className="text-gray-200 truncate max-w-[180px]">{tx.user_email || '—'}</div>
                      <div className="text-xs text-gray-600 truncate">{tx.user_name || ''}</div>
                    </td>
                    <td className="py-2 pr-2 text-gray-300 capitalize">{tx.plan_name || tx.plan_id || '—'}</td>
                    <td className="py-2 pr-2 text-gray-400 text-xs">{tx.billing_period === 'yearly' ? 'Год' : tx.billing_period === 'monthly' ? 'Мес' : '—'}</td>
                    <td className="py-2 pr-2 font-semibold text-white whitespace-nowrap">
                      {Number(tx.amount).toLocaleString('ru')} {tx.currency === 'RUB' ? '₽' : tx.currency}
                    </td>
                    <td className="py-2 pr-2 text-xs text-gray-400">{METHOD_MAP[tx.payment_method] || tx.payment_method || '—'}</td>
                    <td className="py-2 pr-2"><span className={s.badge}>{s.label}</span></td>
                    <td className="py-2">
                      <button onClick={() => setSelected(tx)} className="btn-ghost text-xs p-1">Детали</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-800">
            <p className="text-xs text-gray-500">Показано {page * limit + 1}–{Math.min((page + 1) * limit, total)} из {total}</p>
            <div className="flex gap-1">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="btn-ghost p-1.5">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-400 px-2 py-1">{page + 1} / {pages}</span>
              <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} className="btn-ghost p-1.5">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <TransactionDetail
          tx={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-lg font-bold text-white">{value}</p>
        <Icon className="w-4 h-4 text-gray-600" />
      </div>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function TransactionDetail({ tx, onClose, onStatusChange }) {
  const s = STATUS_MAP[tx.status] || { label: tx.status, badge: 'badge-gray' };
  const meta = typeof tx.metadata === 'string' ? JSON.parse(tx.metadata || '{}') : (tx.metadata || {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Детали транзакции</h2>
          <span className={s.badge}>{s.label}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="ID" value={tx.id} mono />
          <Field label="External ID" value={tx.external_id || '—'} mono />
          <Field label="Пользователь" value={tx.user_email || '—'} />
          <Field label="Имя" value={tx.user_name || '—'} />
          <Field label="Тариф" value={`${tx.plan_name || tx.plan_id || '—'}`} />
          <Field label="Период" value={tx.billing_period === 'yearly' ? 'Годовой' : tx.billing_period === 'monthly' ? 'Месячный' : '—'} />
          <Field label="Сумма" value={`${Number(tx.amount).toLocaleString('ru')} ${tx.currency === 'RUB' ? '₽' : tx.currency}`} bold />
          <Field label="Способ оплаты" value={METHOD_MAP[tx.payment_method] || tx.payment_method || '—'} />
          <Field label="Дата создания" value={new Date(tx.created_at).toLocaleString('ru')} />
          <Field label="Подписка ID" value={tx.subscription_id || '—'} mono />
        </div>

        {/* Metadata */}
        {Object.keys(meta).length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Metadata</p>
            <pre className="text-xs bg-gray-800 rounded-lg p-3 text-gray-300 overflow-auto max-h-32">
              {JSON.stringify(meta, null, 2)}
            </pre>
          </div>
        )}

        {/* Admin actions */}
        <div className="border-t border-gray-800 pt-3">
          <p className="text-xs text-gray-500 mb-2">Действия администратора</p>
          <div className="flex flex-wrap gap-2">
            {tx.status === 'pending' && (
              <>
                <button
                  onClick={() => onStatusChange(tx.id, 'completed')}
                  className="btn bg-green-600 hover:bg-green-700 text-white text-xs flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Подтвердить оплату
                </button>
                <button
                  onClick={() => onStatusChange(tx.id, 'failed')}
                  className="btn bg-red-600 hover:bg-red-700 text-white text-xs flex items-center gap-1"
                >
                  <XCircle className="w-3.5 h-3.5" /> Отклонить
                </button>
              </>
            )}
            {tx.status === 'completed' && (
              <button
                onClick={() => onStatusChange(tx.id, 'refunded')}
                className="btn bg-blue-600 hover:bg-blue-700 text-white text-xs flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Возврат
              </button>
            )}
            {tx.status === 'failed' && (
              <button
                onClick={() => onStatusChange(tx.id, 'pending')}
                className="btn bg-yellow-600 hover:bg-yellow-700 text-white text-xs flex items-center gap-1"
              >
                <Clock className="w-3.5 h-3.5" /> Вернуть в ожидание
              </button>
            )}
            <button onClick={onClose} className="btn-ghost text-xs ml-auto">Закрыть</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono, bold }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={clsx('text-gray-200 truncate', mono && 'font-mono text-xs', bold && 'font-bold text-white')}>{value}</p>
    </div>
  );
}
