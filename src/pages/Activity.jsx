import { useState, useEffect, useRef } from 'react';

const FILTERS = [
  { key: 'all',       label: 'Все' },
  { key: 'pending',   label: 'Ожидают' },
  { key: 'running',   label: 'В работе' },
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
  const [logs,    setLogs]    = useState([]);
  const [showLog, setShowLog] = useState(true);
  const [alerts,  setAlerts]  = useState([]);
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

    window.api?.onBotLog(entry => {
      setLogs(prev => [...prev.slice(-(MAX_LOGS - 1)), entry]);
    });

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

  const counts = FILTERS.reduce((acc, f) => {
    acc[f.key] = f.key === 'all' ? jobs.length : jobs.filter(j => j.status === f.key).length;
    return acc;
  }, {});

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
    <div className="p-5 flex flex-col h-full">

      {/* Алерты */}
      {alerts.length > 0 && (
        <div className="mb-3 flex flex-col gap-2 shrink-0">
          {alerts.map(a => (
            <div key={a.id}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-red-500/8 border border-red-500/20">
              <span className="text-base shrink-0">⚠️</span>
              <span className="text-sm text-red-300 flex-1">
                Аккаунт <strong>{a.name}</strong> вылетел — куки истекли.
                Перезайдите во вкладку «Аккаунты» и добавьте заново.
              </span>
              <span className="text-xs text-red-500/80 shrink-0">{a.ts}</span>
              <button
                onClick={() => setAlerts(prev => prev.filter(x => x.id !== a.id))}
                className="text-red-500/60 hover:text-red-400 text-sm w-6 h-6 flex items-center justify-center
                           rounded transition-colors shrink-0"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* Шапка */}
      <div className="flex items-center justify-between mb-3 shrink-0 gap-3">
        <div className="flex items-center gap-3">
          <h2 className="section-title">Лента активности</h2>
          {botRunning && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full
                            bg-green-500/10 border border-green-500/20">
              <span className="pulse-green" />
              <span className="text-xs text-green-400 font-medium">Бот работает</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={loadJobs}
            className="text-xs px-3 py-1.5 rounded-lg glass text-[#66c0f4] hover:text-white
                       transition-colors">
            ↻ Обновить
          </button>
          {hasFinished && (
            <button onClick={handleClear}
              className="text-xs px-3 py-1.5 rounded-lg glass
                         text-[#4d7a8a] hover:text-red-400 hover:bg-red-500/5
                         border border-transparent hover:border-red-500/20 transition-all">
              🗑 Очистить
            </button>
          )}
        </div>
      </div>

      {/* Поиск */}
      <div className="mb-3 shrink-0">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по аккаунту, заголовку, кампании..."
          className="input-base"
        />
      </div>

      {/* Фильтры */}
      <div className="flex gap-1.5 mb-4 shrink-0 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium
                        transition-all
                        ${filter === f.key
                          ? 'bg-[#66c0f4] text-[#0e1a26] shadow-sm shadow-[#66c0f4]/30'
                          : 'glass text-[#8fa5b5] hover:text-white'}`}>
            {f.label}
            {counts[f.key] > 0 && (
              <span className={`px-1.5 rounded-full text-[10px] font-bold leading-4
                                ${filter === f.key
                                  ? 'bg-[#0e1a26]/30 text-[#0e1a26]'
                                  : filterBadgeColor(f.key)}`}>
                {counts[f.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Список задач */}
      {loading ? (
        <LoadingSkeleton />
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

      {/* Панель логов бота */}
      <div className="shrink-0 mt-3 border-t border-[#2a475e]/40 pt-2">
        <button
          onClick={() => setShowLog(v => !v)}
          className="flex items-center gap-2 py-1.5 text-xs text-[#66c0f4] hover:text-white transition-colors w-full"
        >
          <span className={`transition-transform duration-150 text-[10px] ${showLog ? 'rotate-90' : ''}`}>▶</span>
          <span>Лог бота</span>
          <span className="text-[#3d6070]">({logs.length})</span>
          {logs.some(l => l.level === 'error') && (
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse ml-1" />
          )}
        </button>
        {showLog && (
          <div className="glass-dark rounded-xl p-3 max-h-48 overflow-auto
                          font-mono text-xs leading-5">
            {logs.length === 0 ? (
              <span className="text-[#3d6070]">Нет логов. Запустите бота.</span>
            ) : (
              logs.map((entry, i) => (
                <div key={i} className={
                  entry.level === 'error' ? 'text-red-400' :
                  entry.level === 'warn'  ? 'text-yellow-400' : 'text-[#8fa5b5]'
                }>
                  <span className="text-[#3d6070]">
                    {new Date(entry.ts).toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit',second:'2-digit'})}
                  </span>
                  {' '}
                  <span className={`uppercase font-bold text-[10px] ${
                    entry.level === 'error' ? 'text-red-500' :
                    entry.level === 'warn'  ? 'text-yellow-500' : 'text-[#66c0f4]'
                  }`}>{entry.level}</span>
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
  if (key === 'pending')   return 'bg-[#2a475e]/80 text-[#8fa5b5]';
  if (key === 'cancelled') return 'bg-gray-600/30 text-gray-400';
  return 'bg-[#2a475e]/50 text-[#8fa5b5]';
}

function JobRow({ job, onOpenUrl, onCancel, onDelete }) {
  const { icon, color, label } = statusInfo(job.status);
  const [expanded, setExpanded] = useState(false);

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
  const name = job.profile_name || job.profile_id?.slice(0, 8);

  let timerEl = null;
  if (job.status === 'pending' && job.scheduled_at) {
    const diffMs = new Date(job.scheduled_at).getTime() - now;
    if (diffMs > 0) {
      const mins = Math.floor(diffMs / 60000);
      const secs = Math.floor((diffMs % 60000) / 1000);
      const txt  = mins > 0 ? `-${mins}m ${String(secs).padStart(2,'0')}s` : `-${secs}s`;
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
    const txt = em > 0 ? `+${em}m ${String(es).padStart(2,'0')}s` : `+${es}s`;
    timerEl = <span className="text-xs font-mono text-orange-300 shrink-0 tabular-nums animate-pulse">{txt}</span>;
  }

  const canCancel = job.status === 'pending' || job.status === 'running';
  const canDelete = job.status === 'done' || job.status === 'failed' || job.status === 'cancelled';

  return (
    <>
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl glass
                       border-l-[3px] ${color} transition-all hover:bg-white/[0.02]`}>
        <span className="text-base w-5 shrink-0 text-center">{icon}</span>
        <span className="text-xs text-[#3d6070] w-11 shrink-0 font-mono">{timeStr}</span>
        <span className="text-sm font-semibold text-white w-24 truncate shrink-0">{name}</span>
        <span className="text-sm text-[#8fa5b5] flex-1 truncate min-w-0">{job.title}</span>
        {timerEl}
        <span className={`text-xs shrink-0 ${labelColor(job.status)}`}>{label}</span>
        {job.topic_url && (
          <button
            onClick={() => onOpenUrl(job.topic_url)}
            className="text-xs text-[#66c0f4] hover:text-white shrink-0 transition-colors"
          >
            ↗
          </button>
        )}
        {job.error && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-xs text-red-400 truncate max-w-[120px] hover:text-red-300 cursor-pointer shrink-0"
            title={expanded ? 'Свернуть' : 'Показать подробности'}
          >
            {expanded ? '▼ скрыть' : '▶ ошибка'}
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => onCancel(job.id)}
            className="text-xs px-2 py-0.5 rounded-lg glass hover:bg-red-900/30
                       text-[#4d7a8a] hover:text-red-300 shrink-0 transition-colors"
            title="Отменить задачу"
          >
            ✕
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => onDelete(job.id)}
            className="text-xs px-2 py-0.5 rounded-lg glass text-[#3d6070]
                       hover:text-[#8fa5b5] shrink-0 transition-colors"
            title="Удалить из истории"
          >
            🗑
          </button>
        )}
      </div>
      {expanded && job.error && (
        <div className="glass-dark border border-red-800/20 rounded-xl px-4 py-2.5
                        text-xs text-red-300 font-mono whitespace-pre-wrap break-all">
          {job.error}
        </div>
      )}
    </>
  );
}

function statusInfo(status) {
  switch (status) {
    case 'done':      return { icon: '✓', color: 'border-green-500',  label: 'создана' };
    case 'failed':    return { icon: '✕', color: 'border-red-500',    label: 'ошибка' };
    case 'running':   return { icon: '…', color: 'border-yellow-400', label: 'выполняется' };
    case 'cancelled': return { icon: '∅', color: 'border-gray-600',   label: 'отменена' };
    default:          return { icon: '◷', color: 'border-[#3d6070]',  label: 'ожидает' };
  }
}

function labelColor(status) {
  if (status === 'done')      return 'text-green-400';
  if (status === 'failed')    return 'text-red-400';
  if (status === 'running')   return 'text-yellow-300';
  if (status === 'cancelled') return 'text-gray-500';
  return 'text-[#4d7a8a]';
}

function LoadingSkeleton() {
  return (
    <div className="flex-1 flex flex-col gap-2">
      {[1,2,3,4].map(i => (
        <div key={i} className="glass rounded-xl px-4 py-3 flex items-center gap-3 animate-pulse">
          <div className="w-5 h-5 rounded bg-[#2a475e]/60 shrink-0" />
          <div className="w-11 h-3 rounded bg-[#2a475e]/60 shrink-0" />
          <div className="w-24 h-4 rounded bg-[#2a475e]/60 shrink-0" />
          <div className="flex-1 h-3 rounded bg-[#2a475e]/40" />
          <div className="w-16 h-3 rounded bg-[#2a475e]/40 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function EmptyFiltered({ hasJobs }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-[#2a475e]/30 flex items-center justify-center mb-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
          className="w-7 h-7 text-[#3d6070]">
          {hasJobs ? (
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z"/>
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/>
          )}
        </svg>
      </div>
      {hasJobs ? (
        <>
          <p className="text-[#8fa5b5] font-medium mb-1">Ничего не найдено</p>
          <p className="text-xs text-[#4d7a8a]">Попробуйте изменить фильтр или запрос</p>
        </>
      ) : (
        <>
          <p className="text-[#8fa5b5] font-medium mb-1">Нет активности</p>
          <p className="text-xs text-[#4d7a8a]">Запустите бота и создайте кампанию</p>
        </>
      )}
    </div>
  );
}
