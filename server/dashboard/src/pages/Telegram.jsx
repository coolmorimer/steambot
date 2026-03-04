import { useEffect, useState } from 'react';
import { Send, Play, Square, Trash2, RefreshCw, AlertTriangle, Copy, Smartphone, ChevronDown, ChevronUp, ExternalLink, ClipboardCopy, BookOpen, CheckCircle2 } from 'lucide-react';
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-cyan-900/40 flex items-center justify-center shrink-0">
            <Send className="w-6 h-6 text-cyan-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white">{bot.label || 'Telegram бот'}</p>
            {bot.bot_username && (
              <p className="text-xs text-gray-500 mt-0.5">@{bot.bot_username}</p>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <span className={isRunning ? 'badge-green' : 'badge-gray'}>
                {isRunning ? '● Работает' : '○ Остановлен'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-1 self-end sm:self-auto">
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
            <code className="text-gray-300 text-xs">{bot.bot_token || '••••••••••:•••••••••••'}</code>
            <button onClick={() => navigator.clipboard.writeText(bot.bot_token || '')} className="text-gray-600 hover:text-gray-300">
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

      {/* Mini App Setup */}
      <MiniAppGuide />
    </div>
  );
}

function MiniAppGuide() {
  const [open, setOpen] = useState(false);
  const miniAppUrl = `${window.location.origin}/miniapp`;

  const copyUrl = () => {
    navigator.clipboard.writeText(miniAppUrl);
    toast.success('URL скопирован');
  };

  const steps = [
    {
      num: 1,
      title: 'Откройте @BotFather в Telegram',
      desc: 'Перейдите в чат с @BotFather и отправьте команду /mybots.',
      link: 'https://t.me/BotFather',
      linkText: 'Открыть @BotFather',
    },
    {
      num: 2,
      title: 'Выберите вашего бота',
      desc: 'Нажмите на кнопку с именем вашего бота из списка.',
    },
    {
      num: 3,
      title: 'Откройте настройки бота',
      desc: 'Нажмите «Bot Settings» → «Menu Button» → «Configure menu button».',
    },
    {
      num: 4,
      title: 'Укажите URL Mini App',
      desc: 'Вставьте URL вашего Mini App (скопируйте ниже) и задайте текст кнопки, например «📊 Панель».',
      hasUrl: true,
    },
    {
      num: 5,
      title: 'Готово!',
      desc: 'Теперь у вашего бота в чате появится кнопка меню, которая откроет мини-приложение с обзором, управлением задачами, аккаунтами и заданиями.',
      isDone: true,
    },
  ];

  return (
    <div className="border border-violet-600/20 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-violet-900/10 transition-colors"
      >
        <div className="w-9 h-9 rounded-lg bg-violet-600/15 flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Настройка Mini App</p>
          <p className="text-xs text-gray-500">Инструкция по добавлению мини-приложения в Telegram бота</p>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
        }
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-violet-600/10 pt-3">
          {/* URL block */}
          <div className="rounded-lg bg-gray-800/80 p-3">
            <p className="text-xs text-gray-500 mb-1.5">URL вашего Mini App</p>
            <div className="flex items-center gap-2">
              <code className="text-sm text-violet-400 font-mono flex-1 break-all select-all">{miniAppUrl}</code>
              <button
                onClick={copyUrl}
                className="shrink-0 p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                title="Скопировать"
              >
                <ClipboardCopy className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-0">
            {steps.map((step, i) => (
              <div key={step.num} className="flex gap-3 relative">
                {/* Vertical line */}
                {i < steps.length - 1 && (
                  <div className="absolute left-[15px] top-[30px] bottom-0 w-px bg-gray-800" />
                )}
                {/* Dot */}
                <div className={`w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold z-10 ${
                  step.isDone
                    ? 'bg-green-600/20 text-green-400'
                    : 'bg-violet-600/20 text-violet-400'
                }`}>
                  {step.isDone ? <CheckCircle2 className="w-4 h-4" /> : step.num}
                </div>
                {/* Content */}
                <div className="pb-4 flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{step.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{step.desc}</p>
                  {step.link && (
                    <a
                      href={step.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 mt-1.5 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" /> {step.linkText}
                    </a>
                  )}
                  {step.hasUrl && (
                    <button
                      onClick={copyUrl}
                      className="inline-flex items-center gap-1.5 text-xs mt-1.5 px-2.5 py-1 rounded-lg bg-violet-600/15 text-violet-400 hover:bg-violet-600/25 transition-colors"
                    >
                      <ClipboardCopy className="w-3 h-3" /> Скопировать URL
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Tip */}
          <div className="rounded-lg bg-blue-900/10 border border-blue-600/15 px-3 py-2.5">
            <div className="flex gap-2">
              <BookOpen className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-blue-300 font-medium">Подсказка</p>
                <p className="text-xs text-blue-400/70 mt-0.5">
                  Mini App позволяет управлять ботом, задачами и аккаунтами прямо из Telegram — без перехода в браузер. Также можно использовать команду <code className="bg-blue-900/30 px-1 rounded">/setmenubutton</code> в @BotFather для более быстрой настройки.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TelegramForm({ initial, onSaved, onClose }) {
  const [form, setForm] = useState({
    label:               initial?.label || '',
    bot_token:           '',  // токен всегда вводится заново (сервер отдаёт маскированный)
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
      // При редактировании — если токен не введён заново, не отправляем его
      if (initial && !payload.bot_token) delete payload.bot_token;
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
