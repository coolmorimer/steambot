import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Settings, Save, RefreshCw, Database, Mail, CreditCard,
  Globe, Shield, Gauge, Monitor, ChevronDown, ChevronRight,
  AlertTriangle, CheckCircle, Eye, EyeOff, Info,
} from 'lucide-react';

const api = (url, opts = {}) =>
  fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('access_token')}`,
      ...opts.headers,
    },
  }).then(async r => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  });

const GROUP_ICONS = {
  general:    Globe,
  email:      Mail,
  stripe:     CreditCard,
  playwright: Monitor,
  rateLimit:  Gauge,
  database:   Database,
};

const GROUP_COLORS = {
  general:    'from-blue-500/20 to-blue-600/10 border-blue-500/30',
  email:      'from-green-500/20 to-green-600/10 border-green-500/30',
  stripe:     'from-purple-500/20 to-purple-600/10 border-purple-500/30',
  playwright: 'from-orange-500/20 to-orange-600/10 border-orange-500/30',
  rateLimit:  'from-red-500/20 to-red-600/10 border-red-500/30',
  database:   'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30',
};

export default function AdminConfig() {
  const [groups, setGroups]       = useState({});
  const [edits, setEdits]         = useState({});
  const [expanded, setExpanded]   = useState({});
  const [saving, setSaving]       = useState(false);
  const [loading, setLoading]     = useState(true);
  const [message, setMessage]     = useState(null);
  const [showSensitive, setShowSensitive] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await api('/api/admin/config');
      setGroups(data.groups);
      // Expand all groups by default
      const exp = {};
      for (const k of Object.keys(data.groups)) exp[k] = true;
      setExpanded(exp);
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleEdit = (key, value) => {
    setEdits(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!Object.keys(edits).length) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await api('/api/admin/config', {
        method: 'PUT',
        body: JSON.stringify({ settings: edits }),
      });
      setMessage({ type: 'success', text: `Сохранено ${res.saved} настроек. Некоторые изменения потребуют перезапуска.` });
      setEdits({});
      await load();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const hasEdits = Object.keys(edits).length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings className="w-7 h-7 text-brand-400" />
            Конфигурация сервера
          </h1>
          <p className="text-zinc-400 mt-1">
            Просмотр и редактирование серверных настроек
          </p>
        </div>

        <div className="flex gap-2">
          <Link to="/admin" className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm transition-colors">
            ← Назад
          </Link>
          <button onClick={load} disabled={loading}
            className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm transition-colors flex items-center gap-2 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </button>
          {hasEdits && (
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 animate-pulse">
              <Save className="w-4 h-4" />
              {saving ? 'Сохранение...' : `Сохранить (${Object.keys(edits).length})`}
            </button>
          )}
        </div>
      </div>

      {/* Admin navigation pills */}
      <div className="flex gap-2 flex-wrap">
        {[
          { to: '/admin',        label: 'Обзор' },
          { to: '/admin/users',  label: 'Пользователи' },
          { to: '/admin/plans',  label: 'Тарифы' },
          { to: '/admin/config', label: 'Конфигурация', active: true },
        ].map(t => (
          <Link key={t.to} to={t.to}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              t.active
                ? 'bg-brand-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}>
            {t.label}
          </Link>
        ))}
      </div>

      {/* Messages */}
      {message && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm ${
          message.type === 'success'
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
          {message.text}
        </div>
      )}

      {/* Info banner */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm">
        <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Как работают настройки</p>
          <p className="text-blue-400/80 mt-1">
            Базовые значения загружаются из переменных окружения при старте сервера.
            Здесь вы можете сохранить дополнительные настройки в базу данных.
            Некоторые изменения вступят в силу только после перезапуска сервера.
          </p>
        </div>
      </div>

      {/* Config groups */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groups).map(([groupKey, group]) => {
            const Icon = GROUP_ICONS[groupKey] || Settings;
            const isOpen = expanded[groupKey];
            const colors = GROUP_COLORS[groupKey] || 'from-zinc-500/20 to-zinc-600/10 border-zinc-500/30';

            return (
              <div key={groupKey} className={`rounded-xl border bg-gradient-to-br ${colors} overflow-hidden`}>
                {/* Group header */}
                <button
                  onClick={() => setExpanded(p => ({ ...p, [groupKey]: !p[groupKey] }))}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-white/80" />
                    <span className="text-white font-semibold text-base">{group.label}</span>
                    <span className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-0.5 rounded-full">
                      {Object.keys(group.items).length} параметров
                    </span>
                  </div>
                  {isOpen
                    ? <ChevronDown className="w-5 h-5 text-zinc-400" />
                    : <ChevronRight className="w-5 h-5 text-zinc-400" />}
                </button>

                {/* Group items */}
                {isOpen && (
                  <div className="border-t border-white/5">
                    <div className="divide-y divide-white/5">
                      {Object.entries(group.items).map(([key, item]) => {
                        const edited    = edits[key] !== undefined;
                        const isSensitive = item.sensitive;
                        const showVal   = showSensitive[key];

                        let displayValue = edited ? edits[key] : (item.dbValue || item.value || '');
                        if (isSensitive && !showVal && !edited) displayValue = item.value; // masked

                        return (
                          <div key={key} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                            {/* Key name */}
                            <div className="sm:w-56 flex-shrink-0">
                              <div className="flex items-center gap-2">
                                <code className="text-sm text-zinc-300 font-mono">{key}</code>
                                {item.overridden && (
                                  <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">DB</span>
                                )}
                                {edited && (
                                  <span className="text-[10px] bg-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded">Изменено</span>
                                )}
                              </div>
                              <p className="text-xs text-zinc-500 mt-0.5">{item.description}</p>
                            </div>

                            {/* Value */}
                            <div className="flex-1 flex items-center gap-2">
                              {item.editable && !isSensitive ? (
                                <input
                                  type="text"
                                  value={edited ? edits[key] : (item.dbValue || item.value || '')}
                                  onChange={e => handleEdit(key, e.target.value)}
                                  className={`w-full px-3 py-1.5 rounded-lg bg-zinc-900/80 border text-sm font-mono text-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand-500/50 ${
                                    edited ? 'border-brand-500/50' : 'border-zinc-700/50'
                                  }`}
                                />
                              ) : (
                                <div className="flex items-center gap-2 flex-1">
                                  <span className={`text-sm font-mono ${isSensitive ? 'text-zinc-500' : 'text-zinc-300'}`}>
                                    {displayValue || <span className="text-zinc-600 italic">не задано</span>}
                                  </span>
                                  {isSensitive && (
                                    <button
                                      onClick={() => setShowSensitive(p => ({ ...p, [key]: !p[key] }))}
                                      className="text-zinc-500 hover:text-zinc-300 transition-colors"
                                    >
                                      {showVal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Reset button */}
                              {edited && (
                                <button
                                  onClick={() => setEdits(p => { const n = { ...p }; delete n[key]; return n; })}
                                  className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                                >
                                  Сброс
                                </button>
                              )}
                            </div>

                            {/* Env badge */}
                            <div className="sm:w-16 flex-shrink-0">
                              {item.env && (
                                <span className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">ENV</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Security notice */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 text-xs">
        <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          Конфиденциальные значения (пароли, ключи) замаскированы и не могут быть изменены через интерфейс.
          Для их изменения используйте переменные окружения или Kubernetes Secrets.
        </p>
      </div>
    </div>
  );
}
