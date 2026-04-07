import { useEffect, useState } from 'react';
import { Send, RefreshCw, Loader2, Unlink, ExternalLink, Bell } from 'lucide-react';
import api from '../api/client';
import PageGuide from '../components/PageGuide';
import toast from 'react-hot-toast';

export default function Telegram() {
  const [info, setInfo]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [linkUrl, setLinkUrl] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/telegram')
      .then(r => setInfo(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleLink = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/telegram/link');
      setLinkUrl(data.link);
      window.open(data.link, '_blank');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setBusy(false); }
  };

  const handleUnlink = async () => {
    if (!confirm('Отвязать Telegram? Вы перестанете получать уведомления.')) return;
    setBusy(true);
    try {
      await api.delete('/telegram');
      setInfo(prev => prev ? { ...prev, telegram_chat_id: null } : prev);
      setLinkUrl(null);
      toast.success('Telegram отвязан');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setBusy(false); }
  };

  const handleTest = async () => {
    try {
      await api.post('/telegram/test');
      toast.success('Тестовое сообщение отправлено');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const handleSavePrefs = async (key, value) => {
    try {
      await api.put('/telegram', { [key]: value });
      setInfo(prev => prev ? { ...prev, [key]: value } : prev);
      toast.success('Сохранено');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const linked = !!info?.telegram_chat_id;
  const botReady = !!info?.bot_username && info?.bot_running;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-white">🔔 Уведомления</h1>
        <button onClick={load} className="btn-ghost"><RefreshCw className="w-4 h-4" /></button>
      </div>

      <PageGuide id="telegram-guide" emoji="🔔" title="📖 Инструкция: Уведомления" sections={[
        {
          icon: '🎯', heading: 'Для чего эта страница',
          text: 'Привяжите свой Telegram-аккаунт, чтобы получать уведомления об ошибках, успешных публикациях и истёкших аккаунтах прямо в мессенджер.',
        },
        {
          icon: '🔗', heading: 'Как привязать Telegram',
          steps: [
            { title: 'Нажмите «Привязать Telegram»', desc: 'система сгенерирует одноразовый код' },
            { title: 'Открыть бота', desc: 'вы будете перенаправлены в Telegram-бот' },
            { title: 'Нажмите Start', desc: 'бот автоматически привяжет ваш аккаунт' },
          ],
        },
        {
          icon: '⚙️', heading: 'Настройки уведомлений',
          items: [
            { label: 'Ошибки', desc: 'уведомление если публикация не удалась' },
            { label: 'Успехи', desc: 'подтверждение каждой успешной публикации' },
            { label: 'Истёкшие аккаунты', desc: 'если нужно заново авторизовать Steam' },
          ],
        },
      ]} />

      {loading ? <div className="card h-40 animate-pulse bg-gray-800" /> : (
        <>
          {/* Bot status */}
          {!botReady && (
            <div className="card border-amber-500/20 bg-amber-500/5 text-center py-8">
              <Send className="w-10 h-10 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">Telegram-бот не настроен</p>
              <p className="text-xs text-gray-600 mt-1">Обратитесь к администратору для настройки бота</p>
            </div>
          )}

          {botReady && !linked && (
            <div className="card space-y-5 max-w-lg mx-auto">
              <div className="text-center py-4">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-900/30 flex items-center justify-center mb-4">
                  <Send className="w-8 h-8 text-cyan-400" />
                </div>
                <h2 className="text-lg font-bold text-white">Привяжите Telegram</h2>
                <p className="text-sm text-gray-400 mt-2 max-w-sm mx-auto">
                  Нажмите кнопку ниже — вы будете перенаправлены в Telegram-бот.
                  Нажмите <strong>Start</strong> в боте для завершения привязки.
                </p>
              </div>

              <button onClick={handleLink} disabled={busy} className="btn-primary w-full py-3 text-base">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : '🔗 Привязать Telegram'}
              </button>

              {linkUrl && (
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-2">Не открылось автоматически?</p>
                  <a href={linkUrl} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-brand-400 hover:text-brand-300 inline-flex items-center gap-1">
                    <ExternalLink className="w-3.5 h-3.5" /> Открыть бота вручную
                  </a>
                </div>
              )}

              <p className="text-xs text-gray-600 text-center">
                Бот: <a href={`https://t.me/${info.bot_username}`} target="_blank" rel="noopener"
                  className="text-brand-400 hover:underline">@{info.bot_username}</a>
              </p>
            </div>
          )}

          {botReady && linked && (
            <div className="space-y-4 max-w-lg mx-auto">
              {/* Linked status */}
              <div className="card">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-green-900/30 flex items-center justify-center shrink-0">
                    <Send className="w-6 h-6 text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white">Telegram привязан</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Chat ID: <span className="font-mono text-gray-400">{info.telegram_chat_id}</span>
                    </p>
                    <span className="badge-green mt-1 inline-block">● Подключено</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={handleTest} className="btn-ghost text-sm py-1.5 px-3">
                      📨 Тест
                    </button>
                    <button onClick={handleUnlink} disabled={busy}
                      className="btn-ghost py-1.5 px-2 hover:text-red-400" title="Отвязать">
                      <Unlink className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Notification preferences */}
              <div className="card space-y-4">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-gray-400" /> Настройки уведомлений
                </h2>
                <div className="space-y-3">
                  {[
                    { key: 'tg_notify_errors',  label: '❌ Уведомлять об ошибках', desc: 'Если публикация не удалась' },
                    { key: 'tg_notify_success', label: '✅ Уведомлять об успехе', desc: 'Каждая успешная публикация' },
                    { key: 'tg_notify_expired', label: '⚠️ Истёкшие аккаунты', desc: 'Если сессия Steam истекла' },
                  ].map(({ key, label, desc }) => (
                    <label key={key}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-800/40 transition-all cursor-pointer">
                      <input type="checkbox" className="w-5 h-5 accent-brand-500 rounded"
                        checked={!!info[key]}
                        onChange={e => handleSavePrefs(key, e.target.checked)} />
                      <div className="flex-1">
                        <p className="text-sm text-white font-medium">{label}</p>
                        <p className="text-xs text-gray-500">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <p className="text-xs text-gray-600 text-center">
                Бот: <a href={`https://t.me/${info.bot_username}`} target="_blank" rel="noopener"
                  className="text-brand-400 hover:underline">@{info.bot_username}</a>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}