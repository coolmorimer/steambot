import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, CheckCircle2, AlertTriangle, Clock, Loader2,
  Trash2, XCircle, ExternalLink,
} from 'lucide-react';
import api from '../api/client';
import PageGuide from '../components/PageGuide';
import toast from 'react-hot-toast';

const STATUS_ICONS = {
  done:      <CheckCircle2 className="w-4 h-4 text-green-400" />,
  failed:    <AlertTriangle className="w-4 h-4 text-red-400" />,
  pending:   <Clock className="w-4 h-4 text-yellow-400" />,
  running:   <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />,
  cancelled: <XCircle className="w-4 h-4 text-gray-500" />,
};
const STATUS_LABELS = {
  done: 'Выполнено', failed: 'Ошибка',
  pending: 'В очереди', running: 'Выполняется', cancelled: 'Отменено',
};
const STATUS_BADGE = {
  done: 'badge-green', failed: 'badge-red',
  pending: 'badge-yellow', running: 'badge-blue', cancelled: 'badge-gray',
};

export default function JobsActivity() {
  const [jobs, setJobs]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(0);
  const [statusFilter, setStatus] = useState('all');
  const [loading, setLoading]     = useState(true);
  const [deleting, setDeleting]   = useState(new Set());
  const LIMIT = 20;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: LIMIT, offset: page * LIMIT });
    if (statusFilter !== 'all') params.set('status', statusFilter);
    api.get(`/jobs?${params}`)
      .then(r => { setJobs(r.data.jobs || []); setTotal(r.data.total || 0); })
      .catch(() => toast.error('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [page, statusFilter]);

  useEffect(load, [load]);

  useEffect(() => {
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  async function handleCancel(id) {
    if (!confirm('Отменить это задание?')) return;
    try {
      await api.post(`/jobs/${id}/cancel`);
      setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'cancelled' } : j));
      toast.success('Задание отменено');
    } catch {
      toast.error('Не удалось отменить');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Удалить задание из истории?')) return;
    setDeleting(prev => new Set(prev).add(id));
    try {
      await api.delete(`/jobs/${id}`);
      setJobs(prev => prev.filter(j => j.id !== id));
      setTotal(prev => prev - 1);
      toast.success('Задание удалено');
    } catch {
      toast.error('Не удалось удалить');
    } finally {
      setDeleting(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">📋 История</h1>
          <p className="text-gray-500 text-sm">{total} заданий всего</p>
        </div>
        <button onClick={load} className="btn-ghost">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <PageGuide id="activity-guide" emoji="📋" title="📖 Инструкция: История" sections={[
        {
          icon: '🎯', heading: 'Для чего эта страница',
          text: 'Здесь отображается каждое задание (публикация), которое бот выполнил или пытался выполнить. Это лог всех действий.',
        },
        {
          icon: '📊', heading: 'Статусы заданий',
          items: [
            { label: 'Выполнено (зелёный)', desc: 'публикация прошла успешно' },
            { label: 'Ошибка (красный)', desc: 'что-то пошло не так — проверьте сессию аккаунта' },
            { label: 'В очереди (жёлтый)', desc: 'задание ждёт своей очереди' },
            { label: 'Выполняется (синий)', desc: 'бот сейчас работает над этим заданием' },
            { label: 'Отменено (серый)', desc: 'задание было отменено вручную' },
          ],
        },
        {
          icon: '🛠️', heading: 'Действия',
          items: [
            { label: 'Фильтры', desc: 'используйте кнопки сверху для фильтрации по статусу' },
            { label: 'Отменить', desc: 'можно отменить задание, которое ещё не выполнено' },
            { label: 'Удалить', desc: 'удалить задание из истории' },
          ],
          tip: 'Страница обновляется автоматически каждые 10 секунд.',
        },
      ]} />

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'running', 'done', 'failed', 'cancelled'].map(s => (
          <button key={s} onClick={() => { setPage(0); setStatus(s); }}
            className={`text-sm px-3 py-1 rounded-full border transition-colors ${
              statusFilter === s
                ? 'bg-brand-600 border-brand-500 text-white'
                : 'border-gray-700 text-gray-400 hover:border-gray-500'
            }`}>
            {s === 'all' ? 'Все' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-2">
        {loading && jobs.length === 0 ? (
          <div className="card text-center py-8 text-gray-500">Загрузка...</div>
        ) : jobs.length === 0 ? (
          <div className="card text-center py-8 text-gray-500">Нет заданий</div>
        ) : jobs.map(job => (
          <div key={job.id} className="card space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {STATUS_ICONS[job.status] || STATUS_ICONS.pending}
                <span className={STATUS_BADGE[job.status] || 'badge-gray'}>
                  {STATUS_LABELS[job.status] || job.status}
                </span>
              </div>
              <span className="text-xs text-gray-600">
                {new Date(job.created_at).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div>
              <p className="text-sm text-gray-200 truncate">{job.campaign_name || '—'}</p>
              <p className="text-xs text-gray-500">{job.profile_name || '—'}</p>
            </div>
            {(job.topic_url || job.error) && (
              <div>
                {job.topic_url ? (
                  <a href={job.topic_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300 text-xs">
                    <ExternalLink className="w-3 h-3" /> Открыть тему
                  </a>
                ) : (
                  <p className="text-red-400 text-xs truncate" title={job.error}>{job.error}</p>
                )}
              </div>
            )}
            <div className="flex items-center justify-end gap-1 pt-1 border-t border-gray-800">
              {job.status === 'pending' && (
                <button onClick={() => handleCancel(job.id)} className="btn-ghost text-xs px-2 py-1 text-yellow-400">
                  <XCircle className="w-3.5 h-3.5 mr-1 inline" /> Отменить
                </button>
              )}
              {job.status !== 'running' && (
                <button onClick={() => handleDelete(job.id)} disabled={deleting.has(job.id)}
                  className="btn-ghost text-xs px-2 py-1 text-red-400 disabled:opacity-40">
                  {deleting.has(job.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1 inline" />}
                  Удалить
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500">
                <th className="text-left px-4 py-3 font-medium">Статус</th>
                <th className="text-left px-4 py-3 font-medium">Задача / Аккаунт</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Время</th>
                <th className="text-left px-4 py-3 font-medium">Пост / Ошибка</th>
                <th className="px-4 py-3 font-medium text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {loading && jobs.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-500">Загрузка...</td></tr>
              ) : jobs.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-500">Нет заданий</td></tr>
              ) : jobs.map(job => (
                <tr key={job.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  {/* Статус */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {STATUS_ICONS[job.status] || STATUS_ICONS.pending}
                      <span className={STATUS_BADGE[job.status] || 'badge-gray'}>
                        {STATUS_LABELS[job.status] || job.status}
                      </span>
                    </div>
                  </td>

                  {/* Кампания / Аккаунт */}
                  <td className="px-4 py-3">
                    <div className="text-gray-300 truncate max-w-[160px]">{job.campaign_name || '—'}</div>
                    <div className="text-gray-500 text-xs truncate max-w-[160px]">{job.profile_name || '—'}</div>
                  </td>

                  {/* Время */}
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell whitespace-nowrap text-xs">
                    <div>{new Date(job.created_at).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                    {job.scheduled_at && (
                      <div className="text-gray-600">
                        → {new Date(job.scheduled_at).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </td>

                  {/* Ссылка на пост или ошибка */}
                  <td className="px-4 py-3 max-w-[200px]">
                    {job.topic_url ? (
                      <a
                        href={job.topic_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300 text-xs transition-colors"
                        title={job.topic_url}
                      >
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate max-w-[150px]">Открыть тему</span>
                      </a>
                    ) : job.error ? (
                      <span className="text-red-400 text-xs truncate block" title={job.error}>
                        {job.error}
                      </span>
                    ) : '—'}
                  </td>

                  {/* Действия */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {/* Отмена — только для pending */}
                      {job.status === 'pending' && (
                        <button
                          onClick={() => handleCancel(job.id)}
                          title="Отменить задание"
                          className="p-1.5 rounded text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                      {/* Удалить — для любых кроме running */}
                      {job.status !== 'running' && (
                        <button
                          onClick={() => handleDelete(job.id)}
                          disabled={deleting.has(job.id)}
                          title="Удалить из истории"
                          className="p-1.5 rounded text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40"
                        >
                          {deleting.has(job.id)
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="btn-ghost text-sm">← Назад</button>
          <span className="text-gray-500 text-sm">{page + 1} / {pages}</span>
          <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} className="btn-ghost text-sm">Вперёд →</button>
        </div>
      )}
    </div>
  );
}
