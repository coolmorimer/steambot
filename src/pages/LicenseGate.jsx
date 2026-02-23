import { useState, useEffect } from 'react';

const ERROR_MESSAGES = {
  not_found:        'Ключ не найден. Проверьте правильность ввода.',
  revoked:          'Этот ключ был отозван. Обратитесь в поддержку.',
  expired:          'Срок действия ключа истёк. Обратитесь в поддержку.',
  used_other_device:'Ключ уже активирован на другом устройстве.',
  no_connection:    'Не удаётся подключиться к серверу лицензий. Проверьте интернет.',
  invalid_key:      'Некорректный формат ключа.',
  bad_signature:    'Ошибка проверки подписи сервера. Обратитесь в поддержку.',
  hwid_mismatch:    'Ключ активирован на другом устройстве.',
  grace_expired:    'Превышен лимит работы без интернета. Подключитесь к сети.',
  server_error:     'Ошибка сервера. Попробуйте позже.',
};

const STATUS_UI = {
  not_found:   { title: 'Активация требуется', icon: '🔐', color: 'text-[#66c0f4]' },
  revoked:     { title: 'Лицензия отозвана',   icon: '🚫', color: 'text-red-400' },
  expired:     { title: 'Лицензия истекла',    icon: '⏰', color: 'text-yellow-400' },
  hwid_mismatch:{ title: 'Другое устройство',  icon: '💻', color: 'text-red-400' },
  grace_expired:{ title: 'Требуется интернет', icon: '📡', color: 'text-orange-400' },
  server_error: { title: 'Ошибка сервера',     icon: '⚠️', color: 'text-yellow-400' },
};

export default function LicenseGate({ status, onActivated }) {
  const [key,     setKey]     = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [hwid,    setHwid]    = useState('');
  const [copied,  setCopied]  = useState(false);

  useEffect(() => {
    window.api?.licenseHwid().then(h => setHwid(h ?? ''));
  }, []);

  // Авто-форматирование ввода: XXXX-XXXX-XXXX-XXXX
  function handleInput(e) {
    let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const parts = [];
    for (let i = 0; i < v.length && parts.join('').length < 20; i += 4) {
      parts.push(v.slice(i, i + 4));
    }
    setKey(parts.join('-'));
    setError('');
  }

  async function handleActivate() {
    if (!key.trim()) return setError('Введите лицензионный ключ.');
    setLoading(true);
    setError('');
    try {
      const res = await window.api?.licenseActivate(key.trim());
      if (res?.ok) {
        onActivated(res);
      } else {
        setError(ERROR_MESSAGES[res?.status] ?? 'Неизвестная ошибка.');
      }
    } catch (_) {
      setError('Внутренняя ошибка. Попробуйте перезапустить приложение.');
    }
    setLoading(false);
  }

  function copyHwid() {
    if (!hwid) return;
    navigator.clipboard.writeText(hwid).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const ui = STATUS_UI[status] ?? STATUS_UI['not_found'];
  const needActivation = ['not_found', 'revoked', 'expired', 'hwid_mismatch'].includes(status);
  const infoOnly       = ['grace_expired', 'server_error'].includes(status);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#1b2838] text-[#c7d5e0] select-none px-6">

      {/* Лого */}
      <div className="flex items-center gap-2 mb-8">
        <span className="text-3xl">🎮</span>
        <span className="text-xl font-bold text-white">Steam Poster Bot</span>
      </div>

      {/* Карточка */}
      <div className="w-full max-w-md bg-[#2a475e] rounded-2xl border border-[#3d6070] shadow-2xl overflow-hidden">

        {/* Шапка */}
        <div className="flex flex-col items-center gap-2 py-7 px-8 bg-[#1e3448] border-b border-[#3d6070]">
          <span className="text-4xl">{ui.icon}</span>
          <h1 className={`text-lg font-bold ${ui.color}`}>{ui.title}</h1>
          {status === 'not_found' && (
            <p className="text-xs text-[#8fa5b5] text-center max-w-xs">
              Для работы с приложением необходима лицензия.<br />
              Введите лицензионный ключ ниже.
            </p>
          )}
          {status === 'grace_expired' && (
            <p className="text-xs text-[#8fa5b5] text-center max-w-xs">
              Приложение не могло проверить лицензию более {7} дней.<br />
              Подключитесь к интернету и перезапустите приложение.
            </p>
          )}
          {status === 'revoked' && (
            <p className="text-xs text-[#8fa5b5] text-center max-w-xs">
              Ваша лицензия была деактивирована.<br />
              Обратитесь в поддержку для восстановления.
            </p>
          )}
          {status === 'used_other_device' && (
            <p className="text-xs text-[#8fa5b5] text-center max-w-xs">
              Ключ привязан к другому устройству.<br />
              Если вы сменили компьютер — обратитесь в поддержку.
            </p>
          )}
        </div>

        {/* Форма активации */}
        {(needActivation || infoOnly) && (
          <div className="p-8 flex flex-col gap-5">
            {needActivation && (
              <>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-[#8fa5b5] font-medium uppercase tracking-wider">
                    Лицензионный ключ
                  </label>
                  <input
                    type="text"
                    value={key}
                    onChange={handleInput}
                    onKeyDown={e => e.key === 'Enter' && handleActivate()}
                    placeholder="SBXX-XXXX-XXXX-XXXX"
                    maxLength={19}
                    spellCheck={false}
                    className="bg-[#1b2838] text-white rounded-xl px-4 py-3 text-base
                               font-mono tracking-widest font-semibold text-center
                               border border-[#3d6070] focus:outline-none focus:border-[#66c0f4]
                               placeholder-[#4d7a8a]"
                  />
                  {error && (
                    <p className="text-xs text-red-400 text-center">{error}</p>
                  )}
                </div>

                <button
                  onClick={handleActivate}
                  disabled={loading || key.replace(/-/g, '').length < 14}
                  className="w-full py-3 rounded-xl font-semibold text-sm
                             bg-[#66c0f4] text-[#1b2838]
                             hover:bg-[#7ec8f8] disabled:opacity-40 disabled:cursor-not-allowed
                             transition-colors"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-[#1b2838] border-t-transparent animate-spin" />
                      Проверка...
                    </span>
                  ) : 'Активировать'}
                </button>
              </>
            )}

            {/* HWID */}
            {hwid && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-[#8fa5b5] uppercase tracking-wider">
                  Идентификатор устройства (HWID)
                </span>
                <button
                  onClick={copyHwid}
                  className="bg-[#1b2838] border border-[#3d6070] rounded-lg px-3 py-2
                             text-xs font-mono text-[#66c0f4] text-left truncate
                             hover:border-[#66c0f4] transition-colors"
                  title="Нажмите, чтобы скопировать"
                >
                  {copied ? <span className="text-green-400">✓ Скопировано!</span> : hwid}
                </button>
                <p className="text-[11px] text-[#4d7a8a]">
                  Сообщите HWID в поддержку при проблемах с активацией.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Версия */}
      <p className="mt-8 text-[11px] text-[#4d7a8a]">
        Steam Poster Bot · Свяжитесь с продавцом для получения лицензии
      </p>
    </div>
  );
}
