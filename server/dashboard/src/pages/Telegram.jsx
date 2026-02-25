import { useEffect, useState } from 'react';
import { Send, Play, Square, Trash2, RefreshCw, AlertTriangle, Copy } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { EmptyState } from './Accounts';
import toast from 'react-hot-toast';

export default function Telegram() {
  const { sub } = useAuth();
  const [bot, setBot]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy]     = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/telegram')
      .then(r => setBot(r.data))   // GET возвращает объект бота напрямую или null
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const hasTgFeature = sub?.limits?.max_telegram_bots > 0;

  if (!hasTgFeature) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-white">Telegram бот</h1>
        <div className="card text-center py-12">
          <Send className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">Telegram бот недоступен в вашем тарифе</p>
          <p className="text-gray-600 text-sm mt-1">Улучшите подписку для подключения Telegram бота</p>
          <a href="/subscription" className="btn-primary mt-4 inline-flex">Улучшить</a>
        </div>
      </div>
    );
  }

  const handleStart = async () => {
    setBusy(true);
    try {
      await api.post('/telegram/start');
      toast.success('Бот запущен');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setBusy(false); }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await api.post('/telegram/stop');
      toast.success('Бот остановлен');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Удалить конфигурацию бота?')) return;
    await api.delete('/telegram');
    setBot(null);
    toast.success('Удалено');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Telegram бот</h1>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost"><RefreshCw className="w-4 h-4" /></button>
          {!bot && <button onClick={() => setShowForm(true)} className="btn-primary"><Send className="w-4 h-4" /> Подключить</button>}
        </div>
      </div>

      {loading ? <div className="card h-40 animate-pulse bg-gray-800" /> :
        !bot ? (
          <>
            {showForm
              ? <TelegramForm onSaved={b => { setBot(b); setShowForm(false); }} onClose={() => setShowForm(false)} />
              : <EmptyState
                  title="Бот не подключён"
                  desc="Создайте бота в @BotFather и подключите его здесь для управления через Telegram."
                  action={<button onClick={() => setShowForm(true)} className="btn-primary"><Send className="w-4 h-4" /> Подключить бота</button>}
                />
            }
          </>
        ) : (
          <BotCard bot={bot} busy={busy} onStart={handleStart} onStop={handleStop} onDelete={handleDelete} onEdit={() => setShowForm(true)} />
        )
      }

      {bot && showForm && (
        <TelegramForm
          initial={bot}
          onSaved={b => { setBot(b); setShowForm(false); }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

function BotCard({ bot, busy, onStart, onStop, onDelete, onEdit }) {
  const isRunning = bot.is_running;

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-cyan-900/40 flex items-center justify-center">
          <Send className="w-6 h-6 text-cyan-400" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-white">{bot.label || 'Telegram бот'}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={isRunning ? 'badge-green' : 'badge-gray'}>
              {isRunning ? '● Работает' : '○ Остановлен'}
            </span>
          </div>
        </div>
        <div className="flex gap-1">
          {isRunning
            ? <button disabled={busy} onClick={onStop} className="btn-danger text-sm py-1.5 px-3">
                <Square className="w-3.5 h-3.5" /> Стоп
              </button>
            : <button disabled={busy} onClick={onStart} className="btn-primary text-sm py-1.5 px-3">
                <Play className="w-3.5 h-3.5" /> Старт
              </button>
          }
          <button onClick={onEdit} className="btn-ghost text-sm py-1.5 px-2">Изменить</button>
          <button onClick={onDelete} className="btn-ghost py-1.5 px-2 hover:text-red-400">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Token masked */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-gray-800 px-3 py-2">
          <p className="text-gray-500 text-xs mb-1">Bot Token</p>
          <div className="flex items-center gap-2">
            <code className="text-gray-300 text-xs">{bot.bot_token_masked || '••••••••••:•••••••••••'}</code>
            <button onClick={() => navigator.clipboard.writeText(bot.bot_token_masked || '')} className="text-gray-600 hover:text-gray-300">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="rounded-lg bg-gray-800 px-3 py-2">
          <p className="text-gray-500 text-xs mb-1">Chat IDs</p>
          <p className="text-gray-300 text-xs">
            {bot.authorized_chat_ids?.join(', ') || 'Все пользователи'}
          </p>
        </div>
      </div>

      {/* Notifications */}
      <div>
        <p className="text-xs text-gray-500 mb-2">Уведомления</p>
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'notify_errors',   label: 'Ошибки' },
            { key: 'notify_success',  label: 'Успех' },
            { key: 'notify_expired',  label: 'Истёкшие' },
          ].map(({ key, label }) => (
            <span key={key} className={bot[key] ? 'badge-green' : 'badge-gray'}>
              {label}: {bot[key] ? 'вкл' : 'выкл'}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TelegramForm({ initial, onSaved, onClose }) {
  const [form, setForm] = useState({
    label:               initial?.label || '',
    bot_token:           initial?.bot_token || '',
    authorized_chat_ids: (initial?.authorized_chat_ids || []).join('\n'),
    notify_errors:       initial?.notify_errors ?? true,
    notify_success:      initial?.notify_success ?? true,
    notify_expired:      initial?.notify_expired ?? true,
  });
  const [saving, setSaving] = useState(false);

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        authorized_chat_ids: form.authorized_chat_ids.split('\n').map(s => s.trim()).filter(Boolean),
      };
      // Всегда PUT — upsert на сервере (создаёт или обновляет)
      await api.put('/telegram', payload);
      // Загрузить актуальный объект бота после сохранения
      const { data: fresh } = await api.get('/telegram');
      onSaved(fresh);
      toast.success(initial ? 'Сохранено' : 'Бот подключён');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card border-cyan-800/40">
      <h2 className="font-semibold text-white mb-4">{initial ? 'Изменить бота' : 'Подключить бота'}</h2>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Название (необязательно)</label>
          <input className="input" value={form.label} onChange={f('label')} placeholder="Мой бот" />
        </div>
        <div>
          <label className="label">Bot Token (от @BotFather)</label>
          <input className="input font-mono text-sm" required value={form.bot_token} onChange={f('bot_token')}
            placeholder="123456789:ABC-DEF..." />
          <p className="text-xs text-gray-600 mt-1">
            Создайте бота в <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-brand-400 hover:underline">@BotFather</a>
          </p>
        </div>
        <div>
          <label className="label">Разрешённые Chat IDs (по одному на строку, пусто = все)</label>
          <textarea className="input font-mono text-sm resize-none" rows={3}
            value={form.authorized_chat_ids} onChange={f('authorized_chat_ids')}
            placeholder="123456789&#10;987654321" />
        </div>
        <div className="space-y-2">
          <p className="label">Уведомления</p>
          {[
            { key: 'notify_errors',  label: 'Уведомлять об ошибках' },
            { key: 'notify_success', label: 'Уведомлять об успешных публикациях' },
            { key: 'notify_expired', label: 'Уведомлять об истёкших аккаунтах' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-brand-500"
                checked={form[key]} onChange={f(key)} />
              <span className="text-sm text-gray-300">{label}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">Отмена</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Сохраняю...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  );
}
