import { useState, useEffect } from 'react';
import Accounts    from './pages/Accounts';
import Campaigns   from './pages/Campaigns';
import Activity    from './pages/Activity';
import Settings    from './pages/Settings';
import LicenseGate from './pages/LicenseGate';

const TABS = [
  { id: 'accounts',  label: '👤 Аккаунты' },
  { id: 'campaigns', label: '📋 Кампании' },
  { id: 'activity',  label: '📜 Активность' },
  { id: 'settings',  label: '⚙️ Настройки' },
];

export default function App() {
  const [tab, setTab]               = useState('accounts');
  const [botRunning, setBotRunning] = useState(false);

  // ── Лицензия ──────────────────────────────────────────────────────────────
  // null = проверяем, 'ok'/'offline_ok' = работаем, иначе = блокируем
  const [licenseStatus, setLicenseStatus]   = useState(null);
  const [licenseExpiry, setLicenseExpiry]   = useState(null);
  const [offlineDays,   setOfflineDays]     = useState(null);

  useEffect(() => {
    window.api?.licenseCheck().then(r => {
      setLicenseStatus(r?.status ?? 'not_found');
      setLicenseExpiry(r?.expiresAt ?? null);
      setOfflineDays(r?.offlineDaysLeft ?? null);
    }).catch(() => setLicenseStatus('server_error'));
  }, []);

  // Проверить статус бота при старте (всегда, хуки нельзя вызывать условно)
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

  // Пока не проверили — пустой экран (мигание устранено)
  if (licenseStatus === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1b2838]">
        <div className="w-8 h-8 rounded-full border-2 border-[#66c0f4] border-t-transparent animate-spin" />
      </div>
    );
  }

  // Лицензия не валидна — показываем экран активации
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
    <div className="flex flex-col h-screen bg-[#1b2838] text-[#c7d5e0]">

      {/* ── Оффлайн-предупреждение ──────────────────────────────────────── */}
      {licenseStatus === 'offline_ok' && (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs
                        bg-yellow-500/10 text-yellow-300 border-b border-yellow-600/30">
          <span>📡</span>
          <span>
            Сервер лицензий недоступен — оффлайн-режим.
            Осталось <strong>{offlineDays}</strong> {offlineDays === 1 ? 'день' : offlineDays < 5 ? 'дня' : 'дней'}.
            Подключитесь к интернету для продления.
          </span>
        </div>
      )}

      {/* ── Шапка / Title bar ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 pt-8 pb-3 shrink-0 select-none">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎮</span>
          <span className="text-lg font-semibold text-white">Steam Poster Bot</span>
        </div>

        {/* Кнопка Запустить / Остановить бота */}
        <button
          onClick={toggleBot}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
            ${botRunning
              ? 'bg-red-700 hover:bg-red-600 text-white'
              : 'bg-[#4db86e] hover:bg-[#5dd880] text-[#1b2838]'
            }`}
        >
          {botRunning ? '⏹ Остановить бота' : '▶ Запустить бота'}
        </button>
      </header>

      {/* ── Вкладки ───────────────────────────────────────────────────── */}
      <nav className="flex gap-1 px-5 mt-1 shrink-0 select-none">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-2 rounded-t-lg text-sm font-medium transition-colors
              ${tab === t.id
                ? 'bg-[#2a475e] text-white'
                : 'text-[#8fa5b5] hover:text-white hover:bg-[#243748]'
              }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── Контент ───────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto bg-[#2a475e] rounded-tr-xl rounded-b-xl mx-5 mb-5 shadow-inner">
        {tab === 'accounts'  && <Accounts />}
        {tab === 'campaigns' && <Campaigns />}
        {tab === 'activity'  && <Activity botRunning={botRunning} />}
        {tab === 'settings'  && <Settings />}
      </main>
    </div>
  );
}
