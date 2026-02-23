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
    // Слушаем обновления статуса логина
    window.api?.onLoginStatus(({ status, id, error }) => {
      if (status === 'done') {
        setLoginMsg({ type: 'ok', text: '✅ Аккаунт добавлен! Можно закрывать браузер.' });
        setLogging(false);
        load();
      } else if (status === 'error') {
        setLoginMsg({ type: 'err', text: `❌ Ошибка: ${error}` });
        setLogging(false);
      }
    });
    return () => window.api?.removeAllListeners('accounts:login-status');
  }, [load]);

  async function handleLogin() {
    if (!loginName.trim()) return;
    setLogging(true);
    setLoginMsg({ type: 'info', text: '🌐 Открывается браузер. Войдите в Steam вручную...' });
    await window.api?.accountsLogin(loginName.trim());
    setLoginName('');
  }

  async function handleDelete(id, name) {
    if (!confirm(`Удалить аккаунт «${name}»?`)) return;
    await window.api?.accountsDelete(id);
    load();
  }

  return (
    <div className="p-6">

      {/* ── Добавить аккаунт ───────────────────────────────────────── */}
      <div className="bg-[#1b2838] rounded-xl p-4 mb-6">
        <h2 className="text-sm font-semibold text-[#66c0f4] uppercase tracking-wider mb-3">
          Добавить аккаунт
        </h2>
        <div className="flex gap-3">
          <input
            className="flex-1 bg-[#2a475e] text-white rounded-lg px-4 py-2 text-sm
                       border border-[#3d6070] focus:outline-none focus:border-[#66c0f4]
                       placeholder-[#4d7a8a]"
            placeholder="Имя аккаунта (например: morc00l)"
            value={loginName}
            onChange={e => setLoginName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            disabled={logging}
          />
          <button
            onClick={handleLogin}
            disabled={logging || !loginName.trim()}
            className="px-5 py-2 bg-[#66c0f4] hover:bg-[#7ed1ff] text-[#1b2838] font-semibold
                       rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {logging ? '⏳ Ожидание...' : '+ Войти в Steam'}
          </button>
        </div>
        {loginMsg && (
          <p className={`mt-3 text-sm rounded-lg px-3 py-2
            ${loginMsg.type === 'ok'   ? 'bg-green-900/40 text-green-300' :
              loginMsg.type === 'err'  ? 'bg-red-900/40 text-red-300'    :
                                         'bg-blue-900/40 text-blue-300'}`}>
            {loginMsg.text}
          </p>
        )}
      </div>

      {/* ── Список аккаунтов ───────────────────────────────────────── */}
      <h2 className="text-sm font-semibold text-[#66c0f4] uppercase tracking-wider mb-3">
        Аккаунты ({accounts.length})
      </h2>

      {loading ? (
        <Spinner />
      ) : accounts.length === 0 ? (
        <Empty text="Нет аккаунтов. Добавьте первый аккаунт выше." />
      ) : (
        <div className="grid gap-3">
          {accounts.map(acc => (
            <AccountCard
              key={acc.id}
              acc={acc}
              onDelete={() => handleDelete(acc.id, acc.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountCard({ acc, onDelete }) {
  const active = acc.is_active;
  return (
    <div className="flex items-center justify-between bg-[#1b2838] rounded-xl px-5 py-4">
      <div className="flex items-center gap-4">
        {/* Аватар-заглушка */}
        <div className="w-10 h-10 rounded-full bg-[#2a475e] flex items-center justify-center
                        text-lg font-bold text-[#66c0f4] shrink-0">
          {acc.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-white">{acc.name}</p>
          <p className="text-xs text-[#8fa5b5] mt-0.5">
            Добавлен: {acc.created_at?.slice(0, 10)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {/* Статус */}
        <span className={`flex items-center gap-1.5 text-sm font-medium
          ${active ? 'text-green-400' : 'text-red-400'}`}>
          <span className={`w-2 h-2 rounded-full ${active ? 'bg-green-400' : 'bg-red-400'}`} />
          {active ? 'Активен' : 'Куки истекли'}
        </span>
        {/* Удалить */}
        <button
          onClick={onDelete}
          className="text-[#4d7a8a] hover:text-red-400 transition-colors text-lg leading-none"
          title="Удалить аккаунт"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="w-8 h-8 rounded-full border-2 border-[#66c0f4] border-t-transparent animate-spin" />
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="text-center py-14 text-[#4d7a8a]">
      <p className="text-4xl mb-3">👤</p>
      <p className="text-sm">{text}</p>
    </div>
  );
}
