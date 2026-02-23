import { useState, useEffect } from 'react';

const inputCls = `w-full bg-[#1b2838] text-white rounded-lg px-3 py-2 text-sm
  border border-[#3d6070] focus:outline-none focus:border-[#66c0f4]
  placeholder-[#4d7a8a]`;

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

    // Подписка на автоматическое обновление URL от ngrok
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
    setTestResult({ ok: true, msg: '✓ Сохранено. Telegram-бот перезапущен.' });
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
    <div className="flex justify-center py-10">
      <div className="w-8 h-8 rounded-full border-2 border-[#66c0f4] border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-white font-semibold text-lg mb-5">⚙️ Настройки</h2>

      {/* ── Telegram бот ──────────────────────────────────────────────── */}
      <div className="bg-[#1b2838] rounded-xl p-5 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🤖</span>
          <div className="flex-1">
            <h3 className="text-white font-semibold">Telegram-бот</h3>
            <p className="text-xs text-[#8fa5b5]">
              Управляйте ботом и получайте уведомления через Telegram
            </p>
          </div>
          <Toggle enabled={tgActive} onChange={() => setTgActive(v => !v)} />
        </div>

        {tgActive && (
          <div className="flex flex-col gap-4 mt-3 pt-3 border-t border-[#3d6070]/50">

            {/* Инструкция */}
            <div className="bg-[#0e1a26] rounded-lg p-3 text-xs text-[#8fa5b5] leading-relaxed">
              <p className="font-semibold text-[#66c0f4] mb-1">Как настроить:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Откройте <strong>@BotFather</strong> в Telegram</li>
                <li>Создайте нового бота: <code>/newbot</code></li>
                <li>Скопируйте токен (формат: <code>123456:ABC-DEF...</code>)</li>
                <li>Напишите что-нибудь вашему боту и перейдите по ссылке:
                  <br/><code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>
                  <br/>Найдите <code>"chat":{`{"id":`}</code> — это ваш Chat ID</li>
              </ol>
            </div>

            {/* Токен */}
            <Field label="Bot Token">
              <input
                className={inputCls}
                type="password"
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                value={token}
                onChange={e => setToken(e.target.value)}
                autoComplete="off"
              />
            </Field>

            {/* Chat ID */}
            <Field label="Chat ID (можно несколько)">
              <textarea
                className={inputCls + ' resize-none'}
                rows={2}
                placeholder="123456789, 987654321"
                value={chatId}
                onChange={e => setChatId(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-[#4d7a8a] mt-1">
                Один или несколько ID через запятую / перенос строки
              </p>
            </Field>

            {/* Уведомления */}
            <Field label="Уведомления">
              <div className="flex flex-col gap-2">
                <CheckOption
                  checked={notifyErrors}
                  onChange={() => setNotifyErrors(v => !v)}
                  label="❌ Ошибки публикации"
                />
                <CheckOption
                  checked={notifySuccess}
                  onChange={() => setNotifySuccess(v => !v)}
                  label="✅ Успешные публикации"
                />
                <CheckOption
                  checked={notifyExpired}
                  onChange={() => setNotifyExpired(v => !v)}
                  label="⚠️ Вылет аккаунта (куки истекли)"
                />
                <CheckOption
                  checked={notifyBot}
                  onChange={() => setNotifyBot(v => !v)}
                  label="🤖 Старт/остановка бота"
                />
              </div>
            </Field>

            {/* Mini App */}
            <div className="pt-3 mt-1 border-t border-[#3d6070]/50">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🖥</span>
                <h4 className="text-white font-semibold text-sm">Mini App (веб-панель)</h4>
              </div>

              <div className="flex flex-col gap-3">
                {/* Автозапуск ngrok */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">Автозапуск ngrok</p>
                    <p className="text-xs text-[#4d7a8a]">
                      Автоматически создавать HTTPS-туннель при старте
                    </p>
                  </div>
                  <Toggle enabled={ngrokAuto} onChange={() => setNgrokAuto(v => !v)} />
                </div>

                {/* Текущий URL */}
                <Field label="URL Mini App">
                  {ngrokAuto ? (
                    <>
                      <div className={`w-full rounded-lg px-3 py-2 text-sm border ${
                        webAppUrl
                          ? 'bg-[#0e2a1a] border-green-700/50 text-green-400'
                          : 'bg-[#1b2838] border-[#3d6070] text-[#4d7a8a]'
                      }`}>
                        {webAppUrl || 'Ожидание запуска ngrok...'}
                      </div>
                      {webAppUrl && (
                        <p className="text-xs text-green-500/80 mt-1">
                          ✓ ngrok подключён, ссылка подставлена автоматически
                        </p>
                      )}
                      {!webAppUrl && (
                        <p className="text-xs text-[#4d7a8a] mt-1">
                          URL появится автоматически после сохранения настроек (требуется установленный ngrok)
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <input
                        className={inputCls}
                        placeholder="https://your-domain.com"
                        value={webAppUrl}
                        onChange={e => setWebAppUrl(e.target.value)}
                        autoComplete="off"
                      />
                      <p className="text-xs text-[#4d7a8a] mt-1">
                        Публичный HTTPS-адрес (VPS, Cloudflare Tunnel и т.д.)
                      </p>
                    </>
                  )}
                </Field>

                <Field label="Порт веб-сервера">
                  <input
                    className={inputCls}
                    type="number"
                    placeholder="3388"
                    value={webAppPort}
                    onChange={e => setWebAppPort(e.target.value)}
                    autoComplete="off"
                  />
                  <p className="text-xs text-[#4d7a8a] mt-1">
                    Локальный порт (по умолчанию 3388)
                  </p>
                </Field>

                {!ngrokAuto && (
                  <div className="bg-[#0e1a26] rounded-lg p-3 text-xs text-[#8fa5b5] leading-relaxed">
                    <p className="font-semibold text-[#66c0f4] mb-1">Ручная настройка:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Установите <strong>ngrok</strong>: <code>npm i -g ngrok</code></li>
                      <li>Запустите туннель: <code>ngrok http 3388</code></li>
                      <li>Скопируйте HTTPS-ссылку и вставьте в поле выше</li>
                    </ol>
                  </div>
                )}
              </div>
            </div>

            {/* Кнопки */}
            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={saving}
                className="px-6 py-2 bg-[#4db86e] hover:bg-[#5dd880] text-[#1b2838] font-semibold
                           rounded-lg text-sm transition-colors disabled:opacity-40">
                {saving ? 'Сохранение...' : '✓ Сохранить'}
              </button>
              <button onClick={handleTest} disabled={testing || !token.trim() || !chatId.trim()}
                className="px-6 py-2 bg-[#2a475e] hover:bg-[#3a5570] text-[#66c0f4]
                           rounded-lg text-sm transition-colors disabled:opacity-40">
                {testing ? 'Отправка...' : '📤 Тест'}
              </button>
            </div>

            {/* Результат */}
            {testResult && (
              <div className={`text-sm px-3 py-2 rounded-lg ${
                testResult.ok
                  ? 'bg-green-900/30 text-green-400 border border-green-700/50'
                  : 'bg-red-900/30 text-red-400 border border-red-700/50'
              }`}>
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
      className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors shrink-0
        ${enabled ? 'bg-[#4db86e]' : 'bg-[#3d6070]'}`}>
      <span className={`inline-block w-4 h-4 bg-white rounded-full shadow
                        transition-transform
                        ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#66c0f4] uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function CheckOption({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onChange}
        className="w-4 h-4 accent-[#66c0f4]" />
      <span className={`text-sm ${checked ? 'text-white' : 'text-[#8fa5b5]'}`}>{label}</span>
    </label>
  );
}
