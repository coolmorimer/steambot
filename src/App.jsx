import { useState, useEffect } from 'react';
import Accounts    from './pages/Accounts';
import Campaigns   from './pages/Campaigns';
import Activity    from './pages/Activity';
import Settings    from './pages/Settings';
import LicenseGate from './pages/LicenseGate';

const TABS = [
  { id: 'accounts',  label: 'Аккаунты',   icon: AccountsIcon  },
  { id: 'campaigns', label: 'Кампании',    icon: CampaignsIcon },
  { id: 'activity',  label: 'Активность',  icon: ActivityIcon  },
  { id: 'settings',  label: 'Настройки',   icon: SettingsIcon  },
];

export default function App() {
  const [tab, setTab]               = useState('accounts');
  const [botRunning, setBotRunning] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── Лицензия ──────────────────────────────────────────────────────────────
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [licenseExpiry, setLicenseExpiry] = useState(null);
  const [offlineDays,   setOfflineDays]   = useState(null);

  useEffect(() => {
    window.api?.licenseCheck().then(r => {
      setLicenseStatus(r?.status ?? 'not_found');
      setLicenseExpiry(r?.expiresAt ?? null);
      setOfflineDays(r?.offlineDaysLeft ?? null);
    }).catch(() => setLicenseStatus('server_error'));
  }, []);

  useEffect(() => {
    window.api?.botStatus().then(s => setBotRunning(s.running));
  }, []);

  useEffect(() => {
    window.api?.onBotStatusChanged?.(({ running }) => setBotRunning(running));
    return () => window.api?.removeAllListeners('bot:status-changed');
  }, []);

  async function toggleBot() {
    if (botRunning) {
      await window.api?.botStop();
      setBotRunning(false);
    } else {
      await window.api?.botStart();
      setBotRunning(true);
    }
  }

  // Пока не проверили — экран загрузки
  if (licenseStatus === null) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-mesh">
        <div className="w-10 h-10 rounded-full border-2 border-[#66c0f4] border-t-transparent animate-spin mb-4" />
        <span className="text-sm text-[#8fa5b5] animate-pulse">Инициализация...</span>
      </div>
    );
  }

  // Лицензия не валидна
  if (licenseStatus !== 'ok' && licenseStatus !== 'offline_ok') {
    return (
      <LicenseGate
        status={licenseStatus}
        onActivated={(r) => {
          setLicenseStatus('ok');
          setLicenseExpiry(r?.expiresAt ?? null);
        }}
      />
    );
  }

  return (
    <div className="flex h-screen bg-mesh text-[#c7d5e0] overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={`flex flex-col shrink-0 transition-all duration-200 ease-in-out select-none
          ${sidebarOpen ? 'w-52' : 'w-14'}
          border-r border-[#2a475e]/60 bg-[#0e1a26]/70 backdrop-blur-sm`}
      >
        {/* Logo */}
        <div className={`flex items-center gap-3 px-3.5 pt-6 pb-5 ${sidebarOpen ? '' : 'justify-center'}`}>
          <div className="shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-[#66c0f4] to-[#3a8fc4]
                          flex items-center justify-center text-[#0e1a26] font-bold text-base shadow-lg
                          shadow-[#66c0f4]/20">
            ♟
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-tight truncate">Steam Poster</p>
              <p className="text-[#4d7a8a] text-[10px] leading-tight">Bot Dashboard</p>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 flex flex-col gap-1 px-2">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`nav-item ${tab === t.id ? 'active' : ''} ${sidebarOpen ? '' : 'justify-center px-0'}`}
                title={!sidebarOpen ? t.label : ''}
              >
                <span className="nav-icon shrink-0 w-5 h-5 flex items-center justify-center text-base">
                  <Icon />
                </span>
                {sidebarOpen && <span className="truncate">{t.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Bot status + toggle */}
        <div className={`px-2 pb-4 mt-2 border-t border-[#2a475e]/40 pt-3 flex flex-col gap-2 ${sidebarOpen ? '' : 'items-center'}`}>
          {sidebarOpen && botRunning && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-green-500/8">
              <span className="pulse-green shrink-0" />
              <span className="text-xs text-green-400 truncate">Бот работает</span>
            </div>
          )}
          {sidebarOpen && !botRunning && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-[#4d7a8a] shrink-0" />
              <span className="text-xs text-[#4d7a8a] truncate">Бот остановлен</span>
            </div>
          )}
          <button
            onClick={toggleBot}
            className={`flex items-center justify-center gap-2 rounded-xl text-sm font-semibold
                        transition-all duration-150
                        ${botRunning ? 'btn-stop text-white' : 'btn-start'}
                        ${sidebarOpen ? 'w-full px-3 py-2' : 'w-9 h-9'}`}
            title={!sidebarOpen ? (botRunning ? 'Остановить бота' : 'Запустить бота') : ''}
          >
            {botRunning
              ? <><StopIcon />{sidebarOpen && 'Стоп'}</>
              : <><PlayIcon />{sidebarOpen && 'Старт'}</>
            }
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="flex items-center justify-center h-8 border-t border-[#2a475e]/40
                     text-[#3d6070] hover:text-[#8fa5b5] transition-colors text-xs"
          title={sidebarOpen ? 'Свернуть' : 'Развернуть'}
        >
          {sidebarOpen ? '◀' : '▶'}
        </button>
      </aside>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Топ-бар */}
        <header className="flex items-center justify-between px-5 py-3 shrink-0
                           border-b border-[#2a475e]/40 bg-[#0e1a26]/30 backdrop-blur-sm">
          {/* Заголовок текущей вкладки */}
          <div className="flex items-center gap-3">
            <h1 className="text-white font-semibold text-base">
              {TABS.find(t => t.id === tab)?.label}
            </h1>
            {licenseExpiry && (
              <span className="hidden sm:inline text-[10px] px-2 py-0.5 rounded-full
                               text-[#66c0f4] bg-[#66c0f4]/10 border border-[#66c0f4]/20">
                до {licenseExpiry.slice(0,10)}
              </span>
            )}
          </div>

          {/* Правая часть */}
          <div className="flex items-center gap-3">
            {botRunning && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full
                              bg-green-500/10 border border-green-500/20">
                <span className="pulse-green" />
                <span className="text-xs text-green-400 font-medium">Активен</span>
              </div>
            )}
          </div>
        </header>

        {/* Оффлайн-предупреждение */}
        {licenseStatus === 'offline_ok' && (
          <div className="flex items-center gap-2.5 px-5 py-2 text-xs shrink-0
                          bg-yellow-500/8 text-yellow-300 border-b border-yellow-600/20">
            <span className="text-sm">📡</span>
            <span>
              Сервер лицензий недоступен — оффлайн-режим.
              Осталось <strong>{offlineDays}</strong>{' '}
              {offlineDays === 1 ? 'день' : offlineDays < 5 ? 'дня' : 'дней'}.
              Подключитесь к интернету для продления.
            </span>
          </div>
        )}

        {/* Контент */}
        <main className="flex-1 overflow-auto">
          <div className="animate-fade-in h-full">
            {tab === 'accounts'  && <Accounts />}
            {tab === 'campaigns' && <Campaigns />}
            {tab === 'activity'  && <Activity botRunning={botRunning} />}
            {tab === 'settings'  && <Settings />}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ── SVG Icon components ── */
function AccountsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
      <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/>
    </svg>
  );
}
function CampaignsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h7a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd"/>
    </svg>
  );
}
function ActivityIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
      <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"/>
    </svg>
  );
}
function StopIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd"/>
    </svg>
  );
}

