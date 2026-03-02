import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function AdminPlans() {
  const [plans, setPlans]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | plan object | 'new'

  const load = () => {
    setLoading(true);
    api.get('/admin/plans')
      .then(r => setPlans(r.data))
      .catch(() => toast.error('Ошибка'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async id => {
    if (!confirm('Удалить тариф?')) return;
    try {
      await api.delete(`/admin/plans/${id}`);
      setPlans(p => p.filter(x => x.id !== id));
      toast.success('Удалено');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Нельзя удалить тариф с пользователями');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Link to="/admin" className="text-gray-500 hover:text-white text-sm">← Назад</Link>
        <span className="text-gray-700">/</span>
        <h1 className="text-xl font-bold text-white">Тарифы</h1>
      </div>

      <button onClick={() => setEditing('new')} className="btn-primary">
        <Plus className="w-4 h-4" /> Добавить тариф
      </button>

      {editing && (
        <PlanForm
          plan={editing === 'new' ? null : editing}
          onSaved={() => { setEditing(null); load(); }}
          onClose={() => setEditing(null)}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          [...Array(4)].map((_, i) => <div key={i} className="card h-40 animate-pulse bg-gray-800" />)
        ) : plans.map(plan => (
          <div key={plan.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-white text-lg capitalize">{plan.name}</p>
                <p className="text-gray-500 text-sm">{plan.id}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setEditing(plan)} className="btn-ghost p-1.5">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(plan.id)} className="btn-ghost p-1.5 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-400">
              <div>Цена/мес: <span className="text-white">{plan.price_monthly.toLocaleString('ru')} ₽</span></div>
              <div>Цена/год: <span className="text-white">{plan.price_yearly.toLocaleString('ru')} ₽</span></div>
              <div>Аккаунты: <span className="text-white">{plan.max_steam_accounts === -1 ? '∞' : plan.max_steam_accounts}</span></div>
              <div>Кампании: <span className="text-white">{plan.max_campaigns === -1 ? '∞' : plan.max_campaigns}</span></div>
              <div>Постов/день: <span className="text-white">{plan.max_jobs_per_day === -1 ? '∞' : plan.max_jobs_per_day}</span></div>
              <div>TG боты: <span className="text-white">{plan.max_telegram_bots}</span></div>
              <div>Steam-групп: <span className="text-white">{plan.max_steam_groups ?? 0}</span></div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {plan.has_mini_app      && <span className="badge-blue">Mini App</span>}
              {plan.has_ai_templates  && <span className="badge-purple">AI</span>}
              {plan.has_analytics     && <span className="badge-green">Аналитика</span>}
              {plan.has_api_access    && <span className="badge-gray">API</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const DEFAULTS = {
  id: '', name: '', price_monthly: 0, price_yearly: 0,
  max_steam_accounts: 1, max_campaigns: 1, max_jobs_per_day: 5, max_telegram_bots: 0,
  max_steam_groups: 0,
  has_mini_app: false, has_ai_templates: false, has_analytics: false,
  has_api_access: false, has_priority_support: false, stripe_price_id_monthly: '',
  stripe_price_id_yearly: '', is_active: true,
};

function PlanForm({ plan, onSaved, onClose }) {
  const [form, setForm] = useState(plan ? { ...plan } : { ...DEFAULTS });
  const [saving, setSaving] = useState(false);
  const isNew = !plan;

  const f = k => e => {
    const val = e.target.type === 'checkbox' ? e.target.checked
      : e.target.type === 'number' ? Number(e.target.value)
      : e.target.value;
    setForm(p => ({ ...p, [k]: val }));
  };

  const submit = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isNew) await api.post('/admin/plans', form);
      else       await api.put(`/admin/plans/${form.id}`, form);
      toast.success(isNew ? 'Тариф создан' : 'Тариф обновлён');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const numField = (key, label, min = -1) => (
    <div>
      <label className="label">{label}</label>
      <input className="input" type="number" min={min} value={form[key]} onChange={f(key)} />
    </div>
  );

  return (
    <div className="card border-brand-700/40">
      <h2 className="font-semibold text-white mb-4">{isNew ? 'Новый тариф' : `Редактировать: ${form.name}`}</h2>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">ID (slug)</label>
            <input className="input" required disabled={!isNew} value={form.id} onChange={f('id')} placeholder="pro" />
          </div>
          <div>
            <label className="label">Название</label>
            <input className="input" required value={form.name} onChange={f('name')} placeholder="Pro" />
          </div>
          {numField('price_monthly', 'Цена/мес (₽)', 0)}
          {numField('price_yearly',  'Цена/год (₽)',  0)}
          {numField('max_steam_accounts', 'Макс. аккаунтов (-1=∞)')}
          {numField('max_campaigns',      'Макс. кампаний (-1=∞)')}
          {numField('max_jobs_per_day',   'Постов в день (-1=∞)')}
          {numField('max_telegram_bots',  'TG ботов', 0)}
          {numField('max_steam_groups',   'Steam-групп', 0)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          {[
            { key: 'has_mini_app',         label: 'Telegram Mini App' },
            { key: 'has_ai_templates',     label: 'AI шаблоны' },
            { key: 'has_analytics',        label: 'Аналитика' },
            { key: 'has_api_access',       label: 'API доступ' },
            { key: 'has_priority_support', label: 'Приоритетная поддержка' },
            { key: 'is_active',            label: 'Активен' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer text-gray-300">
              <input type="checkbox" className="w-4 h-4 accent-brand-500" checked={!!form[key]} onChange={f(key)} />
              {label}
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
