import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, UserX, UserCheck, Key } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function AdminUsers() {
  const [users, setUsers]   = useState([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [subModal, setSubModal] = useState(null);
  const LIMIT = 20;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: LIMIT, offset: page * LIMIT });
    if (search) params.set('search', search);
    api.get(`/admin/users?${params}`)
      .then(r => { setUsers(r.data.users || r.data); setTotal(r.data.total || r.data.length); })
      .catch(() => toast.error('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(load, [load]);

  const toggleActive = async (user) => {
    try {
      await api.patch(`/admin/users/${user.id}`, { is_active: !user.is_active });
      setUsers(list => list.map(u => u.id === user.id ? { ...u, is_active: !user.is_active } : u));
      toast.success(user.is_active ? 'Пользователь заблокирован' : 'Пользователь разблокирован');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Link to="/admin" className="text-gray-500 hover:text-white text-sm">← Назад</Link>
        <span className="text-gray-700">/</span>
        <h1 className="text-xl font-bold text-white">Пользователи</h1>
        <span className="badge-gray">{total}</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
        <input
          className="input pl-9"
          placeholder="Поиск по email или имени..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
        />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500">
                <th className="text-left px-4 py-3 font-medium">Пользователь</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Тариф</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Регистрация</th>
                <th className="text-left px-4 py-3 font-medium">Статус</th>
                <th className="text-right px-4 py-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-500">Загрузка...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-500">Нет пользователей</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-gray-200 font-medium">{u.name || '—'}</p>
                    <p className="text-gray-500 text-xs">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="badge-blue capitalize">{u.plan_id || 'free'}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">
                    {new Date(u.created_at).toLocaleDateString('ru')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={u.is_active ? 'badge-green' : 'badge-red'}>
                      {u.is_active ? 'Активен' : 'Заблокирован'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => toggleActive(u)}
                        className="btn-ghost p-1.5 text-xs"
                        title={u.is_active ? 'Заблокировать' : 'Разблокировать'}
                      >
                        {u.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => setSubModal(u)}
                        className="btn-ghost p-1.5 text-xs"
                        title="Управление подпиской"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="btn-ghost text-sm">← Назад</button>
          <span className="text-gray-500 text-sm">{page + 1} / {pages}</span>
          <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} className="btn-ghost text-sm">Вперёд →</button>
        </div>
      )}

      {/* Sub modal */}
      {subModal && (
        <SubModal user={subModal} onClose={() => { setSubModal(null); load(); }} />
      )}
    </div>
  );
}

function SubModal({ user, onClose }) {
  const [plans, setPlans]   = useState([]);
  const [form, setForm]     = useState({ plan_id: '', status: 'active', days: 30 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/subscriptions/plans').then(r => setPlans(r.data));
  }, []);

  const submit = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/admin/users/${user.id}/subscription`, {
        plan_id: form.plan_id,
        status:  form.status,
        days:    Number(form.days),
      });
      toast.success('Подписка обновлена');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="card w-full max-w-sm m-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-white mb-4">Подписка: {user.email}</h3>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Тариф</label>
            <select className="input bg-gray-800" value={form.plan_id} onChange={f('plan_id')} required>
              <option value="">— Выберите —</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Статус</label>
            <select className="input bg-gray-800" value={form.status} onChange={f('status')}>
              {['active','trial','expired','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Продолжительность (дней)</label>
            <input className="input" type="number" min={1} value={form.days} onChange={f('days')} />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-ghost">Отмена</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Сохраняю...' : 'Применить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
