import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Receipt, Search, ChevronLeft, ChevronRight,
  RefreshCw, CheckCircle2, XCircle, Clock, RotateCcw,
  Banknote, TrendingUp, CreditCard, Calendar,
  ArrowUpRight, ArrowDownRight, ChevronUp, ChevronDown,
  BarChart3, PieChart,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart as RPieChart, Pie, Cell,
} from 'recharts';
import api from '../../api/client';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const STATUS_MAP = {
  completed: { label: 'Оплачено',  badge: 'badge-green',  color: '#22c55e' },
  pending:   { label: 'Ожидание',  badge: 'badge-yellow', color: '#eab308' },
  failed:    { label: 'Ошибка',    badge: 'badge-red',    color: '#ef4444' },
  refunded:  { label: 'Возврат',   badge: 'badge-blue',   color: '#3b82f6' },
};

const METHOD_MAP = {
  yookassa: '💳 ЮKassa',
  sberbank: '💳 Сбербанк',
  sbp:      '📱 СБП',
  stripe:   '💳 Stripe',
  manual:   '🛠 Вручную',
};

const PIE_COLORS = ['#66c0f4', '#a855f7', '#22c55e', '#eab308', '#ef4444', '#3b82f6'];

const CHART_RANGES = [
  { key: '7d',  label: '7 дней',  days: 7  },
  { key: '30d', label: '30 дней', days: 30 },
  { key: '90d', label: '90 дней', days: 90 },
];

function formatRub(v) {
  return Number(v || 0).toLocaleString('ru-RU', { minimumFractionDigits: 0 }) + ' ₽';
}

function TrendBadge({ value }) {
  if (value === 0) return <span className="text-[10px] text-gray-500 ml-1">—</span>;
  const up = value > 0;
  return (
    <span className={clsx('inline-flex items-center text-[10px] font-bold ml-1.5', up ? 'text-green-400' : 'text-red-400')}>
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(value)}%
    </span>
  );
}

export default function AdminPayments() {
  const [searchParams] = useSearchParams();
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '');
  const [filterMethod, setFilterMethod] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [selected, setSelected] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [chartRange, setChartRange] = useState('30d');
  const [chartTab, setChartTab] = useState('revenue');
  const searchTimer = useRef(null);
  const limit = 25;

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  const loadTransactions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('limit', limit);
      params.set('offset', page * limit);
      if (filterStatus) params.set('status', filterStatus);
      if (filterMethod) params.set('method', filterMethod);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      params.set('sort_by', sortBy);
      params.set('sort_dir', sortDir);
      const { data } = await api.get(`/admin/payments?${params}`);
      setTransactions(data.transactions || []);
      setTotal(data.total || 0);
    } catch {
      toast.error('Ошибка загрузки платежей');
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterMethod, debouncedSearch, dateFrom, dateTo, sortBy, sortDir]);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/payments/stats');
      setStats(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { setLoading(true); loadTransactions(); }, [loadTransactions]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadTransactions(), loadStats()]);
    setRefreshing(false);
    toast.success('Обновлено');
  };

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
    setPage(0);
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

  const clearFilters = () => {
    setSearch(''); setFilterStatus(''); setFilterMethod('');
    setDateFrom(''); setDateTo('');
    setSortBy('created_at'); setSortDir('desc');
    setPage(0);
  };

  const hasFilters = filterStatus || filterMethod || debouncedSearch || dateFrom || dateTo;

  // Chart data filtered by range with gap-filling
  const chartData = useMemo(() => {
    if (!stats?.dailyRevenue) return [];
    const rangeDays = CHART_RANGES.find(r => r.key === chartRange)?.days || 30;
    const map = new Map();
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      map.set(key, { date: key, revenue: 0, count: 0, completed: 0, failed: 0 });
    }
    stats.dailyRevenue.forEach(r => {
      const key = typeof r.date === 'string' ? r.date.split('T')[0] : new Date(r.date).toISOString().split('T')[0];
      if (map.has(key)) {
        map.set(key, { date: key, revenue: r.revenue || r.total, count: r.count, completed: r.completed || 0, failed: r.failed || 0 });
      }
    });
    return [...map.values()].map(d => ({
      ...d,
      label: new Date(d.date + 'T00:00:00').toLocaleDateString('ru', { day: 'numeric', month: 'short' }),
    }));
  }, [stats?.dailyRevenue, chartRange]);

  const pieData = useMemo(() => {
    if (!stats?.byMethod?.length) return [];
    return stats.byMethod.map(m => ({
      name: METHOD_MAP[m.method] || m.method || 'Другое',
      value: m.total, count: m.count,
    }));
  }, [stats?.byMethod]);

  const pages = Math.ceil(total / limit);

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Receipt className="w-5 h-5 text-brand-400" />
          Аналитика платежей
        </h1>
        <button onClick={handleRefresh} className="btn-ghost ml-auto flex items-center gap-1.5 text-xs" disabled={refreshing}>
          <RefreshCw className={clsx('w-3.5 h-3.5', refreshing && 'animate-spin')} /> Обновить
        </button>
      </div>

      {/* ═══ Revenue cards with trends ═══ */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Banknote} label="Общий доход" value={formatRub(stats.revenue.total)}
            gradient="from-green-600/15 to-emerald-600/5" iconColor="text-green-400" />
          <StatCard icon={TrendingUp} label="30 дней" value={formatRub(stats.revenue.last30d)}
            trend={stats.trends?.last30d} gradient="from-brand-600/15 to-blue-600/5" iconColor="text-brand-400" />
          <StatCard icon={Calendar} label="7 дней" value={formatRub(stats.revenue.last7d)}
            trend={stats.trends?.last7d} gradient="from-purple-600/15 to-pink-600/5" iconColor="text-purple-400" />
          <StatCard icon={CreditCard} label="Сегодня" value={formatRub(stats.revenue.today)}
            trend={stats.trends?.today} gradient="from-amber-600/15 to-orange-600/5" iconColor="text-amber-400" />
        </div>
      )}

      {/* ═══ Status counters ═══ */}
      {stats?.counts && (
        <div className="flex gap-2 flex-wrap text-xs">
          <span className="badge-gray">📊 Всего: {stats.counts.total}</span>
          <span className="badge-green">✅ Оплачено: {stats.counts.completed}</span>
          <span className="badge-yellow">⏳ Ожидание: {stats.counts.pending}</span>
          <span className="badge-red">❌ Ошибки: {stats.counts.failed}</span>
          <span className="badge-blue">↩️ Возвраты: {stats.counts.refunded}</span>
        </div>
      )}

      {/* ═══ Revenue chart ═══ */}
      {stats && (
        <div className="card">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-brand-400" />
              <h3 className="text-sm font-bold text-white">Динамика</h3>
            </div>
            <div className="flex gap-1">
              <div className="flex bg-gray-800 rounded-lg p-0.5 mr-2">
                <button onClick={() => setChartTab('revenue')}
                  className={clsx('px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                    chartTab === 'revenue' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white')}>
                  ₽ Доход
                </button>
                <button onClick={() => setChartTab('count')}
                  className={clsx('px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                    chartTab === 'count' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white')}>
                  # Кол-во
                </button>
              </div>
              <div className="flex bg-gray-800 rounded-lg p-0.5">
                {CHART_RANGES.map(r => (
                  <button key={r.key} onClick={() => setChartRange(r.key)}
                    className={clsx('px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                      chartRange === r.key ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white')}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              {chartTab === 'revenue' ? (
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#66c0f4" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#66c0f4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false}
                    interval={chartRange === '90d' ? 6 : chartRange === '30d' ? 2 : 0} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false}
                    tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                  <Tooltip content={<ChartTooltip type="revenue" />} />
                  <Area type="monotone" dataKey="revenue" stroke="#66c0f4" strokeWidth={2}
                    fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: '#66c0f4' }} />
                </AreaChart>
              ) : (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false}
                    interval={chartRange === '90d' ? 6 : chartRange === '30d' ? 2 : 0} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip type="count" />} />
                  <Bar dataKey="completed" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} name="Успешных" />
                  <Bar dataKey="failed" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} name="Ошибок" />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ═══ Breakdown: Pie + Plans ═══ */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <PieChart className="w-4 h-4 text-brand-400" />
              <h3 className="text-sm font-bold text-white">Способы оплаты</h3>
            </div>
            {pieData.length > 0 ? (
              <div className="flex items-center gap-4">
                <div className="w-32 h-32 shrink-0">
                  <ResponsiveContainer>
                    <RPieChart>
                      <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={25} outerRadius={55}
                        paddingAngle={3} strokeWidth={0}>
                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={v => formatRub(v)} />
                    </RPieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5 flex-1">
                  {pieData.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-gray-400 text-xs">{m.name}</span>
                      </div>
                      <span className="text-white text-xs font-semibold">{m.count} · {formatRub(m.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-gray-600 text-sm text-center py-6">Нет данных</p>
            )}
          </div>

          <div className="card">
            <h3 className="text-sm font-bold text-white mb-3">📦 По тарифам</h3>
            {stats.byPlan?.length > 0 ? (
              <div className="space-y-2">
                {stats.byPlan.map((p, i) => {
                  const maxTotal = Math.max(...stats.byPlan.map(x => x.total));
                  const pct = maxTotal > 0 ? (p.total / maxTotal * 100) : 0;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-gray-300 font-medium capitalize">{p.plan_name || p.plan_id || '—'}</span>
                        <span className="text-white font-bold">{p.count} · {formatRub(p.total)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-600 text-sm text-center py-6">Нет данных</p>
            )}
          </div>
        </div>
      )}

      {/* ═══ Filters ═══ */}
      <div className="card">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="label">Поиск</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input className="input pl-9" placeholder="Email, имя или ID..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="w-32">
            <label className="label">Статус</label>
            <select className="input" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0); }}>
              <option value="">Все</option>
              <option value="completed">Оплачено</option>
              <option value="pending">Ожидание</option>
              <option value="failed">Ошибка</option>
              <option value="refunded">Возврат</option>
            </select>
          </div>
          <div className="w-32">
            <label className="label">Способ</label>
            <select className="input" value={filterMethod} onChange={e => { setFilterMethod(e.target.value); setPage(0); }}>
              <option value="">Все</option>
              <option value="yookassa">ЮKassa</option>
              <option value="sbp">СБП</option>
              <option value="stripe">Stripe</option>
              <option value="manual">Вручную</option>
            </select>
          </div>
          <div className="w-36">
            <label className="label">От</label>
            <input type="date" className="input text-xs" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(0); }} />
          </div>
          <div className="w-36">
            <label className="label">До</label>
            <input type="date" className="input text-xs" value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(0); }} />
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="btn-ghost text-xs h-[38px] text-red-400 hover:text-red-300">
              ✕ Сброс
            </button>
          )}
        </div>
      </div>

      {/* ═══ Table ═══ */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-gray-800 rounded animate-pulse" />)}
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Receipt className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-lg font-semibold">Транзакций не найдено</p>
            <p className="text-sm mt-1">Данные появятся после первого платежа</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                <SortTh col="created_at" label="Дата" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="user_email" label="Пользователь" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <th className="pb-2 pr-2">Тариф</th>
                <th className="pb-2 pr-2">Период</th>
                <SortTh col="amount" label="Сумма" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <th className="pb-2 pr-2">Способ</th>
                <SortTh col="status" label="Статус" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <th className="pb-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => {
                const s = STATUS_MAP[tx.status] || { label: tx.status, badge: 'badge-gray' };
                return (
                  <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="py-2.5 pr-2 text-gray-400 whitespace-nowrap text-xs">
                      {new Date(tx.created_at).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2.5 pr-2">
                      <div className="text-gray-200 truncate max-w-[180px]">{tx.user_email || '—'}</div>
                      <div className="text-xs text-gray-600 truncate">{tx.user_name || ''}</div>
                    </td>
                    <td className="py-2.5 pr-2 text-gray-300 capitalize text-xs">{tx.plan_name || tx.plan_id || '—'}</td>
                    <td className="py-2.5 pr-2 text-gray-400 text-xs">{tx.billing_period === 'yearly' ? 'Год' : tx.billing_period === 'monthly' ? 'Мес' : '—'}</td>
                    <td className="py-2.5 pr-2 font-bold text-white whitespace-nowrap">{formatRub(tx.amount)}</td>
                    <td className="py-2.5 pr-2 text-xs text-gray-400">{METHOD_MAP[tx.payment_method] || tx.payment_method || '—'}</td>
                    <td className="py-2.5 pr-2"><span className={s.badge}>{s.label}</span></td>
                    <td className="py-2.5">
                      <button onClick={() => setSelected(tx)} className="btn-ghost text-xs p-1 hover:text-brand-400">Детали</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-800">
            <p className="text-xs text-gray-500">{page * limit + 1}–{Math.min((page + 1) * limit, total)} из {total}</p>
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

      {selected && <TransactionDetail tx={selected} onClose={() => setSelected(null)} onStatusChange={handleStatusChange} />}
    </div>
  );
}

/* ─── Sortable header ─── */
function SortTh({ col, label, sortBy, sortDir, onSort }) {
  const active = sortBy === col;
  return (
    <th className="pb-2 pr-2">
      <button onClick={() => onSort(col)}
        className={clsx('flex items-center gap-0.5 text-xs transition-colors',
          active ? 'text-brand-400' : 'text-gray-500 hover:text-gray-300')}>
        {label}
        {active && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </button>
    </th>
  );
}

/* ─── Stat card ─── */
function StatCard({ icon: Icon, label, value, trend, gradient, iconColor }) {
  return (
    <div className={clsx('card bg-gradient-to-br', gradient || 'from-gray-800/50')}>
      <div className="flex items-center justify-between">
        <p className="text-lg font-extrabold text-white">{value}</p>
        <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center bg-white/5')}>
          <Icon className={clsx('w-4 h-4', iconColor || 'text-gray-500')} />
        </div>
      </div>
      <div className="flex items-center mt-1">
        <p className="text-xs text-gray-500">{label}</p>
        {trend !== undefined && <TrendBadge value={trend} />}
      </div>
    </div>
  );
}

/* ─── Chart tooltip ─── */
function ChartTooltip({ active, payload, type }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 shadow-xl text-xs">
      <p className="text-gray-400 mb-1">{d.label}</p>
      {type === 'revenue' ? (
        <p className="text-white font-bold">{formatRub(d.revenue)}</p>
      ) : (
        <>
          <p className="text-green-400">✅ Успешных: {d.completed}</p>
          <p className="text-red-400">❌ Ошибок: {d.failed}</p>
        </>
      )}
    </div>
  );
}

/* ─── Transaction detail modal ─── */
function TransactionDetail({ tx, onClose, onStatusChange }) {
  const s = STATUS_MAP[tx.status] || { label: tx.status, badge: 'badge-gray' };
  const meta = typeof tx.metadata === 'string' ? JSON.parse(tx.metadata || '{}') : (tx.metadata || {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl space-y-4 animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Детали транзакции</h2>
          <span className={s.badge}>{s.label}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="ID" value={tx.id} mono />
          <Field label="External ID" value={tx.external_id || '—'} mono />
          <Field label="Пользователь" value={tx.user_email || '—'} />
          <Field label="Имя" value={tx.user_name || '—'} />
          <Field label="Тариф" value={tx.plan_name || tx.plan_id || '—'} />
          <Field label="Период" value={tx.billing_period === 'yearly' ? 'Годовой' : tx.billing_period === 'monthly' ? 'Месячный' : '—'} />
          <Field label="Сумма" value={formatRub(tx.amount)} bold />
          <Field label="Способ" value={METHOD_MAP[tx.payment_method] || tx.payment_method || '—'} />
          <Field label="Создан" value={new Date(tx.created_at).toLocaleString('ru')} />
          <Field label="Подписка ID" value={tx.subscription_id || '—'} mono />
        </div>

        {Object.keys(meta).length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Metadata</p>
            <pre className="text-xs bg-gray-800 rounded-lg p-3 text-gray-300 overflow-auto max-h-32">
              {JSON.stringify(meta, null, 2)}
            </pre>
          </div>
        )}

        <div className="border-t border-gray-800 pt-3">
          <p className="text-xs text-gray-500 mb-2">Действия</p>
          <div className="flex flex-wrap gap-2">
            {tx.status === 'pending' && (
              <>
                <button onClick={() => onStatusChange(tx.id, 'completed')}
                  className="btn bg-green-600 hover:bg-green-700 text-white text-xs flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Подтвердить
                </button>
                <button onClick={() => onStatusChange(tx.id, 'failed')}
                  className="btn bg-red-600 hover:bg-red-700 text-white text-xs flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> Отклонить
                </button>
              </>
            )}
            {tx.status === 'completed' && (
              <button onClick={() => onStatusChange(tx.id, 'refunded')}
                className="btn bg-blue-600 hover:bg-blue-700 text-white text-xs flex items-center gap-1">
                <RotateCcw className="w-3.5 h-3.5" /> Возврат
              </button>
            )}
            {tx.status === 'failed' && (
              <button onClick={() => onStatusChange(tx.id, 'pending')}
                className="btn bg-yellow-600 hover:bg-yellow-700 text-white text-xs flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> В ожидание
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
