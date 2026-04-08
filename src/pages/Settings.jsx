import { useState, useEffect } from 'react';

export default function Settings() {
  const [token,         setToken]         = useState('');
  const [chatId,        setChatId]        = useState('');
  const [notifyErrors,  setNotifyErrors]  = useState(true);
  const [notifySuccess, setNotifySuccess] = useState(false);
  const [notifyExpired, setNotifyExpired] = useState(true);
  const [notifyBot,     setNotifyBot]     = useState(true);
  const [tgActive,      setTgActive]      = useState(false);
  const [webAppUrl,     setWebAppUrl]     = useState('');
  const [webAppPort,    setWebAppPort]    = useState('3388');
  const [ngrokAuto,     setNgrokAuto]     = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [testing,       setTesting]       = useState(false);
  const [testResult,    setTestResult]    = useState(null);
  const [loaded,        setLoaded]        = useState(false);

  useEffect(() => {
    window.api?.settingsGet().then(s => {
      if (s.tg_token)          setToken(s.tg_token);
      if (s.tg_chat_id)        setChatId(s.tg_chat_id);
      if (s.tg_notify_errors !== undefined)  setNotifyErrors(s.tg_notify_errors === '1');
      if (s.tg_notify_success !== undefined) setNotifySuccess(s.tg_notify_success === '1');
      if (s.tg_notify_expired !== undefined) setNotifyExpired(s.tg_notify_expired === '1');
      if (s.tg_notify_bot !== undefined)     setNotifyBot(s.tg_notify_bot === '1');
      if (s.tg_active !== undefined)         setTgActive(s.tg_active === '1');
      if (s.tg_webapp_url)                   setWebAppUrl(s.tg_webapp_url);
      if (s.tg_webapp_port)                  setWebAppPort(s.tg_webapp_port);
      if (s.tg_ngrok_auto !== undefined)     setNgrokAuto(s.tg_ngrok_auto !== '0');
      setLoaded(true);
    });

    window.api?.onNgrokUrl((url) => {
      if (url) setWebAppUrl(url);
    });

    return () => {
      window.api?.removeAllListeners('settings:ngrok-url');
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    setTestResult(null);
    await window.api?.settingsSave({
      tg_token:          token.trim(),
      tg_chat_id:        chatId.trim(),
      tg_notify_errors:  notifyErrors  ? '1' : '0',
      tg_notify_success: notifySuccess ? '1' : '0',
      tg_notify_expired: notifyExpired ? '1' : '0',
      tg_notify_bot:     notifyBot     ? '1' : '0',
      tg_active:         tgActive      ? '1' : '0',
      tg_webapp_url:     webAppUrl.trim(),
      tg_webapp_port:    webAppPort.trim() || '3388',
      tg_ngrok_auto:     ngrokAuto     ? '1' : '0',
    });
    setSaving(false);
    setTestResult({ ok: true, msg: 'Сохранено. Telegram-бот перезапущен.' });
    setTimeout(() => setTestResult(null), 4000);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const res = await window.api?.telegramTest();
    setTesting(false);
    setTestResult(res);
  }

  if (!loaded) return (
    <div className="flex justify-center items-center py-20">
      <div className="w-8 h-8 rounded-full border-2 border-[#66c0f4] border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="p-5 max-w-2xl mx-auto">
      <h2 className="text-white font-bold text-lg mb-5">Настройки</h2>

      {/* Telegram */}
      <div className="glass rounded-2xl overflow-hidden mb-4 animate-slide-up">
        {/* Шапка блока */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a475e]/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#229ED9]/15 flex items-center justify-center text-lg">
              🤖
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">Telegram-бот</h3>
              <p className="text-xs text-[#4d7a8a]">Управление и уведомления через Telegram</p>
            </div>
          </div>
          <Toggle enabled={tgActive} onChange={() => setTgActive(v => !v)} />
        </div>

        {tgActive && (
          <div className="p-5 flex flex-col gap-5">

            {/* Инструкция */}
            <div className="glass-dark rounded-xl p-4 text-xs text-[#8fa5b5] leading-relaxed">
              <p className="font-semibold text-[#66c0f4] mb-2 flex items-center gap-1.5">
                <span>ℹ️</span> Как настроить
              </p>
              <ol className="list-decimal list-inside space-y-1.5">
                <li>Откройте <strong className="text-white">@BotFather</strong> в Telegram</li>
                <li>Создайте нового бота: <code className="text-[#66c0f4]">/newbot</code></li>
                <li>Скопируйте токен (формат: <code className="text-[#66c0f4]">123456:ABC-DEF...</code>)</li>
                <li>Напишите боту что-нибудь, затем зайдите по ссылке:
                  <br/><code className="text-[#66c0f4] break-all">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>
                  <br/>Найдите <code className="text-[#66c0f4]">"chat":{"{"}"id":</code> — это ваш Chat ID
                </li>
              </ol>
            </div>

            {/* Токен */}
            <SettingsField label="Bot Token">
              <input
                className="input-base"
                type="password"
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                value={token}
                onChange={e => setToken(e.target.value)}
                autoComplete="off"
              />
            </SettingsField>

            {/* Chat ID */}
            <SettingsField label="Chat ID (можно несколько)">
              <textarea
                className="input-base resize-none"
                rows={2}
                placeholder="123456789, 987654321"
                value={chatId}
                onChange={e => setChatId(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-[#3d6070] mt-1">Один или несколько ID через запятую / перенос строки</p>
            </SettingsField>

            {/* Уведомления */}
            <SettingsField label="Уведомления">
              <div className="grid grid-cols-2 gap-2">
                <CheckOption checked={notifyErrors}  onChange={() => setNotifyErrors(v => !v)}  label="Ошибки публикации" icon="❌" />
                <CheckOption checked={notifySuccess} onChange={() => setNotifySuccess(v => !v)} label="Успешные публикации" icon="✅" />
                <CheckOption checked={notifyExpired} onChange={() => setNotifyExpired(v => !v)} label="Вылет аккаунта" icon="⚠️" />
                <CheckOption checked={notifyBot}     onChange={() => setNotifyBot(v => !v)}     label="Старт/стоп бота" icon="🤖" />
              </div>
            </SettingsField>

            {/* Mini App */}
            <div className="pt-4 border-t border-[#2a475e]/40">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-base">🖥</span>
                <h4 className="text-white font-semibold text-sm">Mini App (веб-панель)</h4>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm text-white font-medium">Автозапуск ngrok</p>
                    <p className="text-xs text-[#4d7a8a] mt-0.5">Автоматически создавать HTTPS-туннель</p>
                  </div>
                  <Toggle enabled={ngrokAuto} onChange={() => setNgrokAuto(v => !v)} />
                </div>

                <SettingsField label="URL Mini App">
                  {ngrokAuto ? (
                    <>
                      <div className={`input-base ${
                        webAppUrl
                          ? 'border-green-500/40 bg-green-500/5 text-green-400'
                          : 'text-[#4d7a8a]'
                      }`}>
                        {webAppUrl || 'Ожидание ngrok...'}
                      </div>
                      <p className={`text-xs mt-1 ${webAppUrl ? 'text-green-500/70' : 'text-[#3d6070]'}`}>
                        {webAppUrl
                          ? 'ngrok подключён, ссылка подставлена автоматически'
                          : 'URL появится после старта (нужен установленный ngrok)'}
                      </p>
                    </>
                  ) : (
                    <>
                      <input
                        className="input-base"
                        placeholder="https://your-domain.com"
                        value={webAppUrl}
                        onChange={e => setWebAppUrl(e.target.value)}
                        autoComplete="off"
                      />
                      <p className="text-xs text-[#3d6070] mt-1">Публичный HTTPS-адрес (VPS, Cloudflare Tunnel и т.д.)</p>
                    </>
                  )}
                </SettingsField>

                <SettingsField label="Порт веб-сервера">
                  <input
                    className="input-base"
                    type="number"
                    placeholder="3388"
                    value={webAppPort}
                    onChange={e => setWebAppPort(e.target.value)}
                    autoComplete="off"
                  />
                  <p className="text-xs text-[#3d6070] mt-1">Локальный порт (по умолчанию 3388)</p>
                </SettingsField>

                {!ngrokAuto && (
                  <div className="glass-dark rounded-xl p-4 text-xs text-[#8fa5b5] leading-relaxed">
                    <p className="font-semibold text-[#66c0f4] mb-2">Ручная настройка:</p>
                    <ol className="list-decimal list-inside space-y-1.5">
                      <li>Установите ngrok: <code className="text-[#66c0f4]">npm i -g ngrok</code></li>
                      <li>Запустите туннель: <code className="text-[#66c0f4]">ngrok http 3388</code></li>
                      <li>Скопируйте HTTPS-ссылку и вставьте выше</li>
                    </ol>
                  </div>
                )}
              </div>
            </div>

            {/* Кнопки */}
            <div className="flex gap-3 pt-1">
              <button onClick={handleSave} disabled={saving}
                className="px-6 py-2.5 bg-[#4db86e] hover:bg-[#5dd880] text-[#0e1a26] font-bold
                           rounded-xl text-sm transition-all disabled:opacity-40
                           shadow-lg shadow-green-500/20">
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-[#0e1a26] border-t-transparent animate-spin" />
                    Сохранение...
                  </span>
                ) : 'Сохранить'}
              </button>
              <button onClick={handleTest} disabled={testing || !token.trim() || !chatId.trim()}
                className="px-6 py-2.5 glass hover:bg-[#3a5570]/60 text-[#66c0f4]
                           rounded-xl text-sm transition-colors disabled:opacity-40">
                {testing ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Отправка...
                  </span>
                ) : '📤 Тест'}
              </button>
            </div>

            {testResult && (
              <div className={`text-sm px-4 py-3 rounded-xl flex items-center gap-2 ${
                testResult.ok
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                <span>{testResult.ok ? '✓' : '✕'}</span>
                {testResult.msg || testResult.error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({ enabled, onChange }) {
  return (
    <button onClick={onChange}
      className={`relative inline-flex items-center w-11 h-6 rounded-full transition-all shrink-0
        ${enabled
          ? 'bg-[#4db86e] shadow-sm shadow-green-500/30'
          : 'bg-[#2a475e]'}`}>
      <span className="inline-block w-4 h-4 bg-white rounded-full shadow transition-transform"
        style={{ transform: enabled ? 'translateX(22px)' : 'translateX(3px)' }} />
    </button>
  );
}

function SettingsField({ label, children }) {
  return (
    <div>
      <label className="block section-title mb-2">{label}</label>
      {children}
    </div>
  );
}

function CheckOption({ checked, onChange, label, icon }) {
  return (
    <label className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl cursor-pointer
                       border transition-all
                       ${checked
                         ? 'bg-[#66c0f4]/8 border-[#66c0f4]/25'
                         : 'bg-[#0e1a26]/30 border-[#3d6070]/40 hover:border-[#3d6070]'}`}>
      <input type="checkbox" checked={checked} onChange={onChange}
        className="w-4 h-4 accent-[#66c0f4] shrink-0" />
      <span className="text-base shrink-0">{icon}</span>
      <span className={`text-xs ${checked ? 'text-white' : 'text-[#8fa5b5]'}`}>{label}</span>
    </label>
  );
}
