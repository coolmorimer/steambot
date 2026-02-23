import { useState, useEffect, useRef } from 'react';

const FILTERS = [
  { key: 'all',       label: 'Все' },
  { key: 'pending',   label: 'Ожидают' },
  { key: 'running',   label: 'В процессе' },
  { key: 'done',      label: 'Готово' },
  { key: 'failed',    label: 'Ошибки' },
  { key: 'cancelled', label: 'Отменены' },
];

const MAX_LOGS = 200;

export default function Activity({ botRunning }) {
  const [jobs,    setJobs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all');
  const [search,  setSearch]  = useState('');
  const [logs,    setLogs]    = useState([]);      // живые логи бота
  const [showLog, setShowLog] = useState(true);     // панель логов открыта
  const [alerts,  setAlerts]  = useState([]);       // алерты об аккаунтах
  const logEndRef  = useRef(null);
  const bottomRef  = useRef(null);

  const loadJobs = async () => {
    setLoading(true);
    const list = await window.api?.jobsRecent(200) ?? [];
    setJobs(list);
    setLoading(false);
  };

  useEffect(() => {
    loadJobs();

    window.api?.onJobUpdate(job => {
      setJobs(prev => {
        const idx = prev.findIndex(j => j.id === job.id);
        if (idx === -1) return [job, ...prev].slice(0, 200);
        const updated = [...prev];
        updated[idx] = job;
        return updated;
      });
    });

    // Подписка на логи бота
    window.api?.onBotLog(entry => {
      setLogs(prev => [...prev.slice(-(MAX_LOGS - 1)), entry]);
    });

    // Подписка на вылеты аккаунтов
    window.api?.onAccountExpired(data => {
      setAlerts(prev => [
        ...prev,
        { id: Date.now(), name: data.profileName, ts: new Date().toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' }) },
      ]);
    });

    return () => {
      window.api?.removeAllListeners('job:update');
      window.api?.removeAllListeners('bot:log');
      window.api?.removeAllListeners('account:expired');
    };
  }, []);

  // Автоскролл логов вниз
  useEffect(() => {
    if (showLog && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLog]);

  function handleOpenUrl(url) { window.api?.openUrl(url); }

  async function handleCancel(id) {
    const res = await window.api?.jobsCancel(id);
    if (res?.ok) {
      setJobs(prev => prev.map(j =>
        j.id === id ? { ...j, status: 'cancelled', error: 'Отменено пользователем' } : j
      ));
    }
  }

  async function handleDelete(id) {
    await window.api?.jobsDelete(id);
    setJobs(prev => prev.filter(j => j.id !== id));
  }

  async function handleClear() {
    if (!confirm('Удалить все завершённые записи (done / failed / cancelled)?')) return;
    await window.api?.jobsClear();
    setJobs(prev => prev.filter(j => j.status === 'pending' || j.status === 'running'));
  }

  // ── счётчики для бейджей ───────────────────────────────────────────────
  const counts = FILTERS.reduce((acc, f) => {
    acc[f.key] = f.key === 'all' ? jobs.length : jobs.filter(j => j.status === f.key).length;
    return acc;
  }, {});

  // ── фильтрация ─────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const visible = jobs.filter(j => {
    if (filter !== 'all' && j.status !== filter) return false;
    if (q) {
      const name     = (j.profile_name  || j.profile_id   || '').toLowerCase();
      const title    = (j.title         || '').toLowerCase();
      const campaign = (j.campaign_name || '').toLowerCase();
      if (!name.includes(q) && !title.includes(q) && !campaign.includes(q)) return false;
    }
    return true;
  });

  const hasFinished = jobs.some(j => ['done', 'failed', 'cancelled'].includes(j.status));

  return (
    <div className="p-6 flex flex-col h-full">

      {/* ── Алерты об аккаунтах ───────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="mb-3 flex flex-col gap-2 shrink-0">
          {alerts.map(a => (
            <div key={a.id}
              className="flex items-center gap-3 px-4 py-2 rounded-lg bg-red-900/30 border border-red-700/50">
              <span className="text-lg">⚠️</span>
              <span className="text-sm text-red-300 flex-1">
                Аккаунт <strong>{a.name}</strong> вылетел — куки истекли.
                Перезайдите во вкладку «Аккаунты» и добавьте его заново.
              </span>
              <span className="text-xs text-red-500">{a.ts}</span>
              <button
                onClick={() => setAlerts(prev => prev.filter(x => x.id !== a.id))}
                className="text-red-500 hover:text-red-300 text-sm"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Шапка ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3 shrink-0 gap-3">
        <h2 className="text-sm font-semibold text-[#66c0f4] uppercase tracking-wider shrink-0">
          Лента активности
        </h2>
        <div className="flex items-center gap-2 ml-auto">
          {botRunning && (
            <span className="flex items-center gap-1.5 text-xs text-green-400 shrink-0">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Бот работает
            </span>
          )}
          <button onClick={loadJobs}
            className="text-xs text-[#66c0f4] hover:underline shrink-0">
            Обновить
          </button>
          {hasFinished && (
            <button onClick={handleClear}
              className="text-xs px-3 py-1 rounded-lg bg-[#1b2838] hover:bg-red-900/40
                         text-[#4d7a8a] hover:text-red-400 border border-[#3d6070]
                         hover:border-red-700 transition-colors shrink-0">
              🗑 Очистить историю
            </button>
          )}
        </div>
      </div>

      {/* ── Поиск ───────────────────────────────────────────────────────── */}
      <div className="mb-3 shrink-0">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по аккаунту, заголовку, кампании..."
          className="w-full bg-[#1b2838] text-white rounded-lg px-3 py-2 text-sm
                     border border-[#3d6070] focus:outline-none focus:border-[#66c0f4]
                     placeholder-[#4d7a8a]"
        />
      </div>

      {/* ── Фильтр-таббар ───────────────────────────────────────────────── */}
      <div className="flex gap-1.5 mb-4 shrink-0 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium
                        transition-colors
                        ${filter === f.key
                          ? 'bg-[#66c0f4] text-[#1b2838]'
                          : 'bg-[#1b2838] text-[#8fa5b5] hover:bg-[#243748]'}`}>
            {f.label}
            {counts[f.key] > 0 && (
              <span className={`px-1.5 rounded-full text-[10px] font-bold leading-4
                                ${filter === f.key
                                  ? 'bg-[#1b2838]/40 text-[#1b2838]'
                                  : filterBadgeColor(f.key)}`}>
                {counts[f.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Лог ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyFiltered hasJobs={jobs.length > 0} />
      ) : (
        <div className="flex-1 overflow-auto flex flex-col gap-2 min-h-0">
          {visible.map(job => (
            <JobRow key={job.id} job={job}
              onOpenUrl={handleOpenUrl}
              onCancel={handleCancel}
              onDelete={handleDelete} />
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* ── Панель логов бота ─────────────────────────────────────────── */}
      <div className="shrink-0 mt-3 border-t border-[#3d6070]/50">
        <button
          onClick={() => setShowLog(v => !v)}
          className="flex items-center gap-2 py-2 text-xs text-[#66c0f4] hover:underline"
        >
          <span className={`transition-transform ${showLog ? 'rotate-90' : ''}`}>▶</span>
          Лог бота ({logs.length})
          {logs.some(l => l.level === 'error') && (
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          )}
        </button>
        {showLog && (
          <div className="bg-[#0e1a26] rounded-lg p-3 max-h-48 overflow-auto font-mono text-xs leading-5 border border-[#2a475e]">
            {logs.length === 0 ? (
              <span className="text-[#4d7a8a]">Нет логов. Запустите бота.</span>
            ) : (
              logs.map((entry, i) => (
                <div key={i} className={`${
                  entry.level === 'error' ? 'text-red-400' :
                  entry.level === 'warn'  ? 'text-yellow-400' : 'text-[#8fa5b5]'
                }`}>
                  <span className="text-[#4d7a8a]">
                    {new Date(entry.ts).toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit',second:'2-digit'})}
                  </span>
                  {' '}
                  <span className={`uppercase font-bold ${
                    entry.level === 'error' ? 'text-red-500' :
                    entry.level === 'warn'  ? 'text-yellow-500' : 'text-[#66c0f4]'
                  }`}>{entry.level.padEnd(5)}</span>
                  {' '}{entry.message}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}

function filterBadgeColor(key) {
  if (key === 'done')      return 'bg-green-500/20 text-green-400';
  if (key === 'failed')    return 'bg-red-500/20 text-red-400';
  if (key === 'running')   return 'bg-yellow-400/20 text-yellow-300';
  if (key === 'pending')   return 'bg-[#3d6070]/60 text-[#8fa5b5]';
  if (key === 'cancelled') return 'bg-gray-600/30 text-gray-400';
  return 'bg-[#3d6070]/40 text-[#8fa5b5]';
}

function JobRow({ job, onOpenUrl, onCancel, onDelete }) {
  const { icon, color, label } = statusInfo(job.status);
  const [expanded, setExpanded] = useState(false);

  // Живой таймер
  const [now, setNow] = useState(() => Date.now());
  const liveStatus = job.status === 'pending' || job.status === 'running';
  useEffect(() => {
    if (!liveStatus) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [liveStatus]);

  const ts = job.executed_at || job.scheduled_at;
  const timeStr = ts
    ? new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : '--:--';
  const name    = job.profile_name || job.profile_id?.slice(0, 8);

  // Обратный отсчёт до scheduled_at (для pending)
  let timerEl = null;
  if (job.status === 'pending' && job.scheduled_at) {
    const diffMs = new Date(job.scheduled_at).getTime() - now;
    if (diffMs > 0) {
      const mins = Math.floor(diffMs / 60000);
      const secs = Math.floor((diffMs % 60000) / 1000);
      const txt  = mins > 0 ? `−${mins}м ${String(secs).padStart(2,'0')}с` : `−${secs}с`;
      timerEl = <span className="text-xs font-mono text-yellow-300 shrink-0 tabular-nums">{txt}</span>;
    } else {
      timerEl = <span className="text-xs font-mono text-yellow-500 shrink-0 animate-pulse">сейчас</span>;
    }
  }
  if (job.status === 'running') {
    const startMs = job.scheduled_at ? new Date(job.scheduled_at).getTime() : now;
    const elapsedSec = Math.max(0, Math.floor((now - startMs) / 1000));
    const em = Math.floor(elapsedSec / 60);
    const es = elapsedSec % 60;
    const txt = em > 0 ? `+${em}м ${String(es).padStart(2,'0')}с` : `+${es}с`;
    timerEl = <span className="text-xs font-mono text-orange-300 shrink-0 tabular-nums animate-pulse">{txt}</span>;
  }

  const canCancel = job.status === 'pending' || job.status === 'running';
  const canDelete = job.status === 'done' || job.status === 'failed' || job.status === 'cancelled';

  return (
    <>
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-[#1b2838]
                     border-l-2 ${color}`}>
      <span className="text-lg w-6 shrink-0">{icon}</span>
      <span className="text-xs text-[#4d7a8a] w-12 shrink-0">{timeStr}</span>
      <span className="text-sm font-semibold text-white w-28 truncate shrink-0">{name}</span>
      <span className="text-sm text-[#8fa5b5] flex-1 truncate">{job.title}</span>
      {timerEl}
      <span className={`text-xs shrink-0 ${labelColor(job.status)}`}>{label}</span>
      {job.topic_url && (
        <button
          onClick={() => onOpenUrl(job.topic_url)}
          className="text-xs text-[#66c0f4] hover:underline shrink-0"
        >
          Открыть ↗
        </button>
      )}
      {job.error && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-xs text-red-400 truncate max-w-[140px] hover:text-red-300 cursor-pointer"
          title={expanded ? 'Свернуть' : 'Показать подробности'}
        >
          {expanded ? '▼' : '▶'} {job.error.slice(0, expanded ? 999 : 30)}{!expanded && job.error.length > 30 ? '...' : ''}
        </button>
      )}
      {canCancel && (
        <button
          onClick={() => onCancel(job.id)}
          className="text-xs px-2 py-0.5 rounded bg-[#2a475e] hover:bg-red-900
                     text-[#4d7a8a] hover:text-red-300 shrink-0 transition-colors"
          title="Отменить задачу"
        >
          ✕
        </button>
      )}
      {canDelete && (
        <button
          onClick={() => onDelete(job.id)}
          className="text-xs px-2 py-0.5 rounded bg-[#1e3040] hover:bg-[#2a475e]
                     text-[#3d6070] hover:text-[#8fa5b5] shrink-0 transition-colors"
          title="Удалить из истории"
        >
          🗑
        </button>
      )}
    </div>
      {/* Раскрытая ошибка */}
      {expanded && job.error && (
        <div className="bg-red-900/20 border border-red-800/30 rounded-lg px-4 py-2 mt-1 text-xs text-red-300 font-mono whitespace-pre-wrap break-all">
          {job.error}
        </div>
      )}
    </>
  );
}

function statusInfo(status) {
  switch (status) {
    case 'done':      return { icon: '✅', color: 'border-green-500',  label: 'создана' };
    case 'failed':    return { icon: '❌', color: 'border-red-500',    label: 'ошибка' };
    case 'running':   return { icon: '⏳', color: 'border-yellow-400', label: 'выполняется...' };
    case 'cancelled': return { icon: '🚫', color: 'border-gray-600',   label: 'отменена' };
    default:          return { icon: '🕒', color: 'border-[#3d6070]',  label: 'ожидает' };
  }
}

function labelColor(status) {
  if (status === 'done')      return 'text-green-400';
  if (status === 'failed')    return 'text-red-400';
  if (status === 'running')   return 'text-yellow-300';
  if (status === 'cancelled') return 'text-gray-500';
  return 'text-[#4d7a8a]';
}

function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="w-8 h-8 rounded-full border-2 border-[#66c0f4] border-t-transparent animate-spin" />
    </div>
  );
}

function EmptyFiltered({ hasJobs }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-[#4d7a8a]">
      {hasJobs ? (
        <>
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-sm">Ничего не найдено.</p>
          <p className="text-xs mt-1">Попробуйте изменить фильтр или поисковый запрос.</p>
        </>
      ) : (
        <>
          <p className="text-4xl mb-3">📭</p>
          <p className="text-sm">Пока нет активности.</p>
          <p className="text-xs mt-1">Запустите бота и создайте кампанию.</p>
        </>
      )}
    </div>
  );
}
