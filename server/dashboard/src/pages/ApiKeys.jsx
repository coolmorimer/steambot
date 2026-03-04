import { useEffect, useState } from 'react';
import { Key, Plus, Trash2, Copy, Check, Clock, Shield, Code2, ExternalLink, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const PERM_LABELS = {
  read:   { label: 'Чтение',   color: 'badge-green',  desc: 'Просмотр аккаунтов, задач, заданий' },
  write:  { label: 'Запись',    color: 'badge-blue',   desc: 'Изменение задач, управление ботом' },
  delete: { label: 'Удаление', color: 'badge-red',    desc: 'Удаление ресурсов' },
};

export default function ApiKeys() {
  const { sub } = useAuth();
  const [keys, setKeys]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey]   = useState(null);
  const [showDocs, setShowDocs] = useState(false);

  const hasApi = sub?.features?.has_api_access;

  const load = () => {
    setLoading(true);
    api.get('/apikeys')
      .then(r => setKeys(r.data))
      .catch(() => toast.error('Ошибка загрузки'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (!hasApi) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-white">API интеграции</h1>
        <div className="card text-center py-12">
          <Code2 className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">API доступ недоступен в вашем тарифе</p>
          <p className="text-gray-600 text-sm mt-1">Улучшите подписку для получения доступа к API</p>
          <a href="/subscription" className="btn-primary mt-4 inline-flex">Улучшить</a>
        </div>
      </div>
    );
  }

  const handleDelete = async (id) => {
    if (!confirm('Удалить API-ключ? Это действие нельзя отменить.')) return;
    try {
      await api.delete(`/apikeys/${id}`);
      setKeys(list => list.filter(k => k.id !== id));
      toast.success('Ключ удалён');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-white">API интеграции</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowDocs(!showDocs)} className="btn-ghost text-sm">
            <Code2 className="w-4 h-4" /> Документация
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> Создать ключ
          </button>
        </div>
      </div>

      {/* New key display */}
      {newKey && (
        <div className="card border-green-600/30 bg-green-900/10">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-green-300 font-medium mb-1">API-ключ создан — скопируйте его сейчас!</p>
              <p className="text-xs text-green-400/70 mb-3">Ключ показывается только один раз. Сохраните его в безопасном месте.</p>
              <div className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2">
                <code className="text-green-400 text-xs flex-1 break-all font-mono">{newKey}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(newKey); toast.success('Скопировано!'); }}
                  className="text-gray-400 hover:text-white shrink-0"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <button onClick={() => setNewKey(null)} className="btn-ghost text-xs mt-2">Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {/* API Docs */}
      {showDocs && <ApiDocs />}

      {/* Keys list */}
      {loading ? (
        <div className="card h-40 animate-pulse bg-gray-800" />
      ) : keys.length === 0 ? (
        <div className="card text-center py-12">
          <Key className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">Нет API-ключей</p>
          <p className="text-gray-600 text-sm mt-1">Создайте ключ для интеграции с внешними системами</p>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map(k => (
            <KeyCard key={k.id} apiKey={k} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateKeyModal
          onClose={() => setShowCreate(false)}
          onCreated={(data) => {
            setNewKey(data.key);
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function KeyCard({ apiKey, onDelete }) {
  const perms = apiKey.permissions || ['read'];
  const isExpired = apiKey.expires_at && new Date(apiKey.expires_at) < new Date();

  return (
    <div className={clsx('card transition-all', isExpired && 'opacity-60 border-red-800/30')}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-violet-900/40 flex items-center justify-center shrink-0">
            <Key className="w-5 h-5 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-white">{apiKey.name}</p>
              {isExpired && <span className="badge-red text-xs">Истёк</span>}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <code className="text-xs text-gray-500 font-mono">{apiKey.key_prefix}••••••••</code>
              <span className="text-gray-700">·</span>
              {perms.map(p => (
                <span key={p} className={clsx('text-xs', PERM_LABELS[p]?.color || 'badge-gray')}>
                  {PERM_LABELS[p]?.label || p}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 self-end sm:self-auto">
          {apiKey.last_used_at && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(apiKey.last_used_at).toLocaleDateString('ru')}
            </span>
          )}
          {apiKey.expires_at && (
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              до {new Date(apiKey.expires_at).toLocaleDateString('ru')}
            </span>
          )}
          <button onClick={() => onDelete(apiKey.id)} className="btn-ghost p-1.5 hover:text-red-400">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateKeyModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    permissions: ['read'],
    expires: 'never',
  });
  const [saving, setSaving] = useState(false);

  const togglePerm = (perm) => {
    setForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm],
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.permissions.length === 0) return toast.error('Выберите хотя бы одно разрешение');
    setSaving(true);
    try {
      const body = {
        name: form.name || 'API Key',
        permissions: form.permissions,
      };
      if (form.expires !== 'never') {
        body.expires_in_days = Number(form.expires);
      }
      const { data } = await api.post('/apikeys', body);
      onCreated(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-white mb-4">Создать API-ключ</h3>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Название</label>
            <input
              className="input"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Моя интеграция"
            />
          </div>

          <div>
            <label className="label mb-2">Разрешения</label>
            <div className="space-y-2">
              {Object.entries(PERM_LABELS).map(([key, { label, desc, color }]) => (
                <label
                  key={key}
                  className={clsx(
                    'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                    form.permissions.includes(key)
                      ? 'border-violet-600/40 bg-violet-900/10'
                      : 'border-gray-800 bg-gray-900/50 hover:border-gray-700'
                  )}
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-violet-500"
                    checked={form.permissions.includes(key)}
                    onChange={() => togglePerm(key)}
                  />
                  <div>
                    <span className="text-sm text-white font-medium">{label}</span>
                    <p className="text-xs text-gray-500">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Срок действия</label>
            <select
              className="input bg-gray-800"
              value={form.expires}
              onChange={e => setForm(f => ({ ...f, expires: e.target.value }))}
            >
              <option value="never">Бессрочный</option>
              <option value="30">30 дней</option>
              <option value="90">90 дней</option>
              <option value="180">6 месяцев</option>
              <option value="365">1 год</option>
            </select>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-ghost">Отмена</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Создаю...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ApiDocs() {
  const baseUrl = window.location.origin;
  const [showToken, setShowToken] = useState(false);

  const endpoints = [
    { method: 'GET',   path: '/me',              desc: 'Информация о пользователе и подписке' },
    { method: 'GET',   path: '/profiles',         desc: 'Список Steam аккаунтов' },
    { method: 'GET',   path: '/profiles/:id',     desc: 'Один аккаунт' },
    { method: 'GET',   path: '/campaigns',        desc: 'Список задач' },
    { method: 'GET',   path: '/campaigns/:id',    desc: 'Одна задача' },
    { method: 'PATCH', path: '/campaigns/:id',    desc: 'Вкл/выкл задачи (is_active)' },
    { method: 'GET',   path: '/jobs',             desc: 'Задачи (limit, offset, status)' },
    { method: 'GET',   path: '/jobs/stats',       desc: 'Статистика задач' },
    { method: 'GET',   path: '/subscription',     desc: 'Текущая подписка' },
    { method: 'GET',   path: '/bot/status',       desc: 'Статус Steam-бота' },
    { method: 'POST',  path: '/bot/start',        desc: 'Запустить Steam-бота' },
    { method: 'POST',  path: '/bot/stop',         desc: 'Остановить Steam-бота' },
  ];

  const methodColors = {
    GET:   'text-green-400 bg-green-900/30',
    POST:  'text-blue-400 bg-blue-900/30',
    PATCH: 'text-yellow-400 bg-yellow-900/30',
    DELETE:'text-red-400 bg-red-900/30',
  };

  return (
    <div className="card border-violet-600/20">
      <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
        <Code2 className="w-4 h-4 text-violet-400" />
        Документация API v1
      </h3>

      <div className="bg-gray-900 rounded-lg p-3 mb-4">
        <p className="text-xs text-gray-500 mb-1">Base URL</p>
        <code className="text-sm text-violet-400 font-mono">{baseUrl}/api/v1</code>
      </div>

      <div className="bg-gray-900 rounded-lg p-3 mb-4">
        <p className="text-xs text-gray-500 mb-1">Авторизация</p>
        <code className="text-sm text-gray-300 font-mono">
          Authorization: Bearer {showToken ? 'spb_xxxxxxxxxxxxxxxx' : '••••••••••••••••'}
        </code>
        <button onClick={() => setShowToken(!showToken)} className="ml-2 text-gray-500 hover:text-gray-300">
          {showToken ? <EyeOff className="w-3.5 h-3.5 inline" /> : <Eye className="w-3.5 h-3.5 inline" />}
        </button>
      </div>

      <div className="space-y-1">
        {endpoints.map((ep, i) => (
          <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-800/50 last:border-0">
            <span className={clsx('text-xs font-mono font-bold px-2 py-0.5 rounded', methodColors[ep.method])}>
              {ep.method}
            </span>
            <code className="text-sm text-gray-300 font-mono flex-1">{ep.path}</code>
            <span className="text-xs text-gray-500 hidden sm:block">{ep.desc}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-gray-900 rounded-lg">
        <p className="text-xs text-gray-500 mb-2">Пример запроса (curl)</p>
        <code className="text-xs text-gray-400 font-mono whitespace-pre-wrap break-all">
{`curl -H "Authorization: Bearer spb_your_key" \\
  ${baseUrl}/api/v1/campaigns`}
        </code>
      </div>
    </div>
  );
}
