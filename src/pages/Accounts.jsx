import { useState, useEffect, useCallback } from 'react';

export default function Accounts() {
  const [accounts, setAccounts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [loginName, setLoginName] = useState('');
  const [logging, setLogging]     = useState(false);
  const [loginMsg, setLoginMsg]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await window.api?.accountsList() ?? [];
    setAccounts(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    window.api?.onLoginStatus(({ status, id, error }) => {
      if (status === 'done') {
        setLoginMsg({ type: 'ok', text: 'Аккаунт добавлен! Можно закрывать браузер.' });
        setLogging(false);
        load();
      } else if (status === 'error') {
        setLoginMsg({ type: 'err', text: `Ошибка: ${error}` });
        setLogging(false);
      }
    });
    return () => window.api?.removeAllListeners('accounts:login-status');
  }, [load]);

  async function handleLogin() {
    if (!loginName.trim()) return;
    setLogging(true);
    setLoginMsg({ type: 'info', text: 'Открывается браузер. Войдите в Steam вручную...' });
    await window.api?.accountsLogin(loginName.trim());
    setLoginName('');
  }

  async function handleDelete(id, name) {
    if (!confirm(`Удалить аккаунт «${name}»?`)) return;
    await window.api?.accountsDelete(id);
    load();
  }

  const activeCount  = accounts.filter(a => a.is_active).length;
  const expiredCount = accounts.length - activeCount;

  return (
    <div className="p-5 max-w-3xl mx-auto">

      {/* ── Добавить аккаунт ── */}
      <div className="glass rounded-2xl p-5 mb-6 animate-slide-up">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-7 h-7 rounded-lg bg-[#66c0f4]/15 flex items-center justify-center text-[#66c0f4] text-base">+</span>
          <h2 className="section-title">Добавить аккаунт</h2>
        </div>
        <div className="flex gap-3">
          <input
            className="input-base flex-1"
            placeholder="Имя аккаунта (например: morc00l)"
            value={loginName}
            onChange={e => setLoginName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            disabled={logging}
          />
          <button
            onClick={handleLogin}
            disabled={logging || !loginName.trim()}
            className="px-5 py-2 bg-[#66c0f4] hover:bg-[#7ed1ff] text-[#0e1a26] font-semibold
                       rounded-xl text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed
                       shadow-lg shadow-[#66c0f4]/20 hover:shadow-[#66c0f4]/40 shrink-0"
          >
            {logging ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-[#0e1a26] border-t-transparent animate-spin" />
                Ожидание...
              </span>
            ) : '+ Войти'}
          </button>
        </div>
        {loginMsg && (
          <div className={`mt-3 text-sm rounded-xl px-4 py-2.5 flex items-start gap-2
            ${loginMsg.type === 'ok'   ? 'bg-green-500/10 text-green-300 border border-green-500/20' :
              loginMsg.type === 'err'  ? 'bg-red-500/10 text-red-300 border border-red-500/20'    :
                                         'bg-[#66c0f4]/10 text-[#66c0f4] border border-[#66c0f4]/20'}`}>
            <span className="shrink-0 mt-0.5">
              {loginMsg.type === 'ok' ? '✓' : loginMsg.type === 'err' ? '✕' : '→'}
            </span>
            {loginMsg.text}
          </div>
        )}
      </div>

      {/* ── Заголовок списка ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="section-title">Аккаунты</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#2a475e] text-[#8fa5b5]">
            {accounts.length}
          </span>
        </div>
        {accounts.length > 0 && (
          <div className="flex items-center gap-3 text-xs">
            {activeCount > 0 && (
              <span className="badge-online px-2.5 py-1 rounded-full font-medium">
                {activeCount} {pluralRu(activeCount, 'активный', 'активных', 'активных')}
              </span>
            )}
            {expiredCount > 0 && (
              <span className="badge-offline px-2.5 py-1 rounded-full font-medium">
                {expiredCount} {pluralRu(expiredCount, 'истёкший', 'истёкших', 'истёкших')}
              </span>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : accounts.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-3">
          {accounts.map((acc, i) => (
            <AccountCard
              key={acc.id}
              acc={acc}
              index={i}
              onDelete={() => handleDelete(acc.id, acc.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountCard({ acc, index, onDelete }) {
  const active = acc.is_active;
  const initials = acc.name.slice(0, 2).toUpperCase();
  // Deterministic gradient from account name
  const hue = (acc.name.charCodeAt(0) * 23 + acc.name.charCodeAt(Math.min(1, acc.name.length - 1)) * 7) % 360;

  return (
    <div
      className="card-hover glass rounded-2xl px-5 py-4 animate-slide-up flex items-center justify-between gap-4"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-center gap-4 min-w-0">
        {/* Avatar */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm text-white shrink-0 shadow-lg"
          style={{
            background: `linear-gradient(135deg, hsl(${hue},60%,45%), hsl(${(hue+40)%360},50%,35%))`,
            boxShadow: `0 4px 12px hsl(${hue},60%,30%)/40%`,
          }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-white truncate">{acc.name}</p>
          <p className="text-xs text-[#4d7a8a] mt-0.5">
            Добавлен {acc.created_at?.slice(0, 10)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Статус */}
        <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full
          ${active ? 'badge-online' : 'badge-offline'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-400' : 'bg-red-400'}`} />
          {active ? 'Активен' : 'Куки истекли'}
        </span>
        {/* Удалить */}
        <button
          onClick={onDelete}
          className="w-8 h-8 rounded-lg flex items-center justify-center
                     text-[#3d6070] hover:text-red-400 hover:bg-red-500/10
                     transition-all"
          title="Удалить аккаунт"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
            <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>
            <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clipRule="evenodd"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="glass rounded-2xl px-5 py-4 flex items-center gap-4 animate-pulse">
          <div className="w-11 h-11 rounded-xl bg-[#2a475e]/60 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-[#2a475e]/60 rounded-lg w-36" />
            <div className="h-3 bg-[#2a475e]/40 rounded-lg w-24" />
          </div>
          <div className="h-6 w-20 bg-[#2a475e]/50 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-[#2a475e]/40 flex items-center justify-center mb-4">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
          className="w-8 h-8 text-[#3d6070]">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/>
        </svg>
      </div>
      <p className="text-[#8fa5b5] font-medium mb-1">Нет аккаунтов</p>
      <p className="text-sm text-[#4d7a8a]">Добавьте первый аккаунт Steam выше</p>
    </div>
  );
}

// Правильное русское склонение
function pluralRu(n, one, few, many) {
  const abs = Math.abs(n);
  const mod10  = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11)            return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
