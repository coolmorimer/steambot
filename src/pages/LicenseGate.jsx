import { useState, useEffect } from 'react';

const ERROR_MESSAGES = {
  not_found:         'Ключ не найден. Проверьте правильность ввода.',
  revoked:           'Этот ключ был отозван. Обратитесь в поддержку.',
  expired:           'Срок действия ключа истёк. Обратитесь в поддержку.',
  used_other_device: 'Ключ уже активирован на другом устройстве.',
  no_connection:     'Не удаётся подключиться к серверу лицензий. Проверьте интернет.',
  invalid_key:       'Некорректный формат ключа.',
  bad_signature:     'Ошибка проверки подписи сервера. Обратитесь в поддержку.',
  hwid_mismatch:     'Ключ активирован на другом устройстве.',
  grace_expired:     'Превышен лимит работы без интернета. Подключитесь к сети.',
  server_error:      'Ошибка сервера. Попробуйте позже.',
};

const STATUS_UI = {
  not_found:    { title: 'Требуется активация', icon: '🔐', accent: '#66c0f4' },
  revoked:      { title: 'Лицензия отозвана',   icon: '🚫', accent: '#e57373' },
  expired:      { title: 'Лицензия истекла',    icon: '⏰', accent: '#ffd54f' },
  hwid_mismatch:{ title: 'Другое устройство',   icon: '💻', accent: '#e57373' },
  grace_expired:{ title: 'Требуется интернет',  icon: '📡', accent: '#ffb74d' },
  server_error: { title: 'Ошибка сервера',      icon: '⚠️', accent: '#ffd54f' },
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

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-mesh text-[#c7d5e0] select-none px-4">

      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-5"
          style={{ background: `radial-gradient(circle, ${ui.accent}, transparent)` }} />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full opacity-5"
          style={{ background: `radial-gradient(circle, #4db86e, transparent)` }} />
      </div>

      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#66c0f4] to-[#3a8fc4]
                        flex items-center justify-center text-[#0e1a26] font-bold text-xl shadow-xl
                        shadow-[#66c0f4]/25">
          ♟
        </div>
        <div>
          <p className="text-white font-bold text-lg leading-tight">Steam Poster Bot</p>
          <p className="text-[#4d7a8a] text-xs">Автопостинг на форум Steam</p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-md glass rounded-3xl overflow-hidden shadow-2xl shadow-black/40">

        {/* Header */}
        <div className="flex flex-col items-center gap-3 py-8 px-8 border-b border-[#2a475e]/40"
          style={{ background: `linear-gradient(180deg, ${ui.accent}0d 0%, transparent 100%)` }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl
                          shadow-lg"
            style={{ background: `${ui.accent}18`, boxShadow: `0 8px 24px ${ui.accent}25` }}>
            {ui.icon}
          </div>
          <h1 className="text-lg font-bold" style={{ color: ui.accent }}>{ui.title}</h1>

          {status === 'not_found' && (
            <p className="text-xs text-[#8fa5b5] text-center max-w-xs leading-relaxed">
              Для работы с приложением необходима лицензия.<br/>Введите лицензионный ключ ниже.
            </p>
          )}
          {status === 'grace_expired' && (
            <p className="text-xs text-[#8fa5b5] text-center max-w-xs leading-relaxed">
              Приложение не могло проверить лицензию более 7 дней.<br/>
              Подключитесь к интернету и перезапустите приложение.
            </p>
          )}
          {status === 'revoked' && (
            <p className="text-xs text-[#8fa5b5] text-center max-w-xs leading-relaxed">
              Ваша лицензия была деактивирована.<br/>Обратитесь в поддержку для восстановления.
            </p>
          )}
          {status === 'used_other_device' && (
            <p className="text-xs text-[#8fa5b5] text-center max-w-xs leading-relaxed">
              Ключ привязан к другому устройству.<br/>Если сменили компьютер — обратитесь в поддержку.
            </p>
          )}
        </div>

        {needActivation && (
          <div className="p-8 flex flex-col gap-5">
            {/* Ввод ключа */}
            <div className="flex flex-col gap-2">
              <label className="section-title">Лицензионный ключ</label>
              <input
                type="text"
                value={key}
                onChange={handleInput}
                onKeyDown={e => e.key === 'Enter' && handleActivate()}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                maxLength={19}
                spellCheck={false}
                className="w-full glass-dark text-white rounded-xl px-4 py-3.5 text-base
                           font-mono tracking-[0.2em] font-semibold text-center
                           border border-[#3d6070] focus:outline-none focus:border-[#66c0f4]
                           focus:shadow-[0_0_0_3px_rgba(102,192,244,0.15)]
                           placeholder-[#2a475e] transition-all"
              />
              {error && (
                <p className="text-xs text-red-400 text-center flex items-center justify-center gap-1">
                  <span>✕</span> {error}
                </p>
              )}
            </div>

            <button
              onClick={handleActivate}
              disabled={loading || key.replace(/-/g, '').length < 14}
              className="w-full py-3.5 rounded-xl font-bold text-sm transition-all
                         bg-[#66c0f4] text-[#0e1a26]
                         hover:bg-[#7ed1ff] disabled:opacity-40 disabled:cursor-not-allowed
                         shadow-lg shadow-[#66c0f4]/25 hover:shadow-[#66c0f4]/40"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-[#0e1a26] border-t-transparent animate-spin" />
                  Проверка...
                </span>
              ) : 'Активировать'}
            </button>

            {hwid && (
              <div className="flex flex-col gap-1.5">
                <span className="section-title">Идентификатор устройства (HWID)</span>
                <button
                  onClick={copyHwid}
                  className="glass-dark border border-[#3d6070] hover:border-[#66c0f4] rounded-xl
                             px-3.5 py-2.5 text-xs font-mono text-[#66c0f4] text-left truncate
                             transition-all hover:shadow-[0_0_0_3px_rgba(102,192,244,0.1)]"
                  title="Нажмите, чтобы скопировать"
                >
                  {copied
                    ? <span className="text-green-400 font-semibold">✓ Скопировано!</span>
                    : hwid}
                </button>
                <p className="text-[11px] text-[#3d6070] text-center">
                  Сообщите HWID в поддержку при проблемах с активацией
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-6 text-[11px] text-[#3d6070]">
        Steam Poster Bot · Свяжитесь с продавцом для получения лицензии
      </p>
    </div>
  );
}
