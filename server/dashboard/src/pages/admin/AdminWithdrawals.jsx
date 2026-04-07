import { useEffect, useState, useCallback } from 'react';
import {
  ArrowUpCircle, Search, RefreshCw, CheckCircle2, XCircle,
  Clock, Loader2, AlertTriangle,
} from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const STATUS_MAP = {
  pending:   { label: 'Ожидание',  cls: 'bg-yellow-900/30 text-yellow-400', icon: Clock },
  approved:  { label: 'Одобрено',  cls: 'bg-green-900/30 text-green-400',   icon: CheckCircle2 },
  rejected:  { label: 'Отклонено', cls: 'bg-red-900/30 text-red-400',       icon: XCircle },
  completed: { label: 'Выполнено', cls: 'bg-blue-900/30 text-blue-400',     icon: CheckCircle2 },
};

function formatRub(kopecks) {
  return (kopecks / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2 }) + ' ₽';
}

export default function AdminWithdrawals() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState('');
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter ? `?status=${filter}` : '';
      const { data } = await api.get(`/admin/withdrawals${params}`);
      setItems(data || []);
    } catch {
      toast.error('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id, status) => {
    const labels = { approved: 'одобрить', rejected: 'отклонить', completed: 'завершить' };
    if (!confirm(`Вы уверены, что хотите ${labels[status]} заявку #${id}?`)) return;
    setProcessing(true);
    try {
      await api.patch(`/admin/withdrawals/${id}`, { status, admin_note: note });
      toast.success('Обновлено');
      setSelected(null);
      setNote('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setProcessing(false);
    }
  };

  const pendingCount = items.filter(i => i.status === 'pending').length;
  const totalPending = items.filter(i => i.status === 'pending').reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <ArrowUpCircle className="w-5 h-5 text-red-400" /> Заявки на вывод
        </h1>
        <button onClick={load} className="btn-ghost ml-auto flex items-center gap-1.5 text-xs">
          <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin')} />
          Обновить
        </button>
      </div>

      {/* Summary */}
      {filter === 'pending' && pendingCount > 0 && (
        <div className="card border-yellow-600/30 bg-yellow-900/10">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-300">
                {pendingCount} {pendingCount === 1 ? 'заявка' : 'заявок'} ожидает обработки
              </p>
              <p className="text-xs text-yellow-400/70">На сумму {formatRub(totalPending)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-1 bg-gray-800/50 rounded-lg p-1">
        {[
          { id: 'pending',   label: 'Ожидание' },
          { id: 'approved',  label: 'Одобрено' },
          { id: 'completed', label: 'Выполнено' },
          { id: 'rejected',  label: 'Отклонено' },
          { id: '',          label: 'Все' },
        ].map(f => (
          <button key={f.id}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition ${
              filter === f.id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
            }`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="card">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-center py-12 text-gray-500">Заявок не найдено</p>
        ) : (
          <div className="space-y-3">
            {items.map(wd => {
              const st = STATUS_MAP[wd.status] || STATUS_MAP.pending;
              const details = typeof wd.details === 'string' ? JSON.parse(wd.details || '{}') : (wd.details || {});
              return (
                <div key={wd.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-gray-800/30 border border-gray-800 hover:border-gray-700 cursor-pointer transition"
                  onClick={() => { setSelected(wd); setNote(wd.admin_note || ''); }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white">#{wd.id}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                    </div>
                    <p className="text-sm text-gray-300">{wd.user_email || wd.user_name || 'User'}</p>
                    <p className="text-xs text-gray-500">
                      {wd.method === 'sbp' ? '📱 СБП' : '💳 Карта'} •{' '}
                      {details.card || details.phone || '—'} •{' '}
                      {new Date(wd.created_at).toLocaleString('ru-RU')}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-white whitespace-nowrap">{formatRub(wd.amount)}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSelected(null)}>
          <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Заявка #{selected.id}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full ${(STATUS_MAP[selected.status] || STATUS_MAP.pending).cls}`}>
                {(STATUS_MAP[selected.status] || STATUS_MAP.pending).label}
              </span>
            </div>

            <div className="space-y-2 text-sm">
              <Row label="Пользователь" value={selected.user_email || selected.user_name} />
              <Row label="Сумма" value={formatRub(selected.amount)} bold />
              <Row label="Способ" value={selected.method === 'sbp' ? '📱 СБП' : '💳 Банковская карта'} />
              <Row label="Реквизиты" value={(() => {
                const d = typeof selected.details === 'string' ? JSON.parse(selected.details || '{}') : (selected.details || {});
                return d.card || d.phone || '—';
              })()} />
              <Row label="Дата" value={new Date(selected.created_at).toLocaleString('ru-RU')} />
              {selected.processed_at && <Row label="Обработано" value={new Date(selected.processed_at).toLocaleString('ru-RU')} />}
            </div>

            {/* Admin note */}
            <div>
              <label className="label">Комментарий администратора</label>
              <textarea className="input min-h-[60px]" rows={2} value={note}
                onChange={e => setNote(e.target.value)} placeholder="Причина решения..." />
            </div>

            {/* Actions */}
            {selected.status === 'pending' && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleAction(selected.id, 'approved')}
                  disabled={processing}
                  className="btn bg-green-600 hover:bg-green-700 text-white text-sm flex-1 flex items-center justify-center gap-1"
                >
                  <CheckCircle2 className="w-4 h-4" /> Одобрить
                </button>
                <button
                  onClick={() => handleAction(selected.id, 'rejected')}
                  disabled={processing}
                  className="btn bg-red-600 hover:bg-red-700 text-white text-sm flex-1 flex items-center justify-center gap-1"
                >
                  <XCircle className="w-4 h-4" /> Отклонить
                </button>
              </div>
            )}
            {selected.status === 'approved' && (
              <button
                onClick={() => handleAction(selected.id, 'completed')}
                disabled={processing}
                className="btn bg-blue-600 hover:bg-blue-700 text-white text-sm w-full flex items-center justify-center gap-1"
              >
                <CheckCircle2 className="w-4 h-4" /> Отметить выполненным
              </button>
            )}

            <button onClick={() => setSelected(null)} className="btn-ghost text-xs w-full">Закрыть</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={clsx('text-gray-200', bold && 'font-bold text-white')}>{value}</span>
    </div>
  );
}
