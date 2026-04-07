import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Edit3, Search, ExternalLink } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function AdminPartners() {
  const [partners, setPartners]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null); // null | 'create' | partner obj
  const [users, setUsers]         = useState([]);
  const [userSearch, setUserSearch] = useState('');

  const [form, setForm] = useState({ user_id: '', code: '', label: '', commission_percent: 10 });

  const load = useCallback(() => {
    setLoading(true);
    api.get('/admin/partners')
      .then(r => setPartners(r.data))
      .catch(() => toast.error('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const searchUsers = (q) => {
    setUserSearch(q);
    if (q.length < 2) { setUsers([]); return; }
    api.get(`/admin/users?search=${encodeURIComponent(q)}&limit=5`)
      .then(r => setUsers(r.data.users || r.data || []))
      .catch(() => {});
  };

  const openCreate = () => {
    setForm({ user_id: '', code: '', label: '', commission_percent: 10 });
    setUserSearch('');
    setUsers([]);
    setModal('create');
  };

  const openEdit = (p) => {
    setForm({ user_id: p.user_id, code: p.code, label: p.label, commission_percent: parseFloat(p.commission_percent) });
    setModal(p);
  };

  const save = async () => {
    try {
      if (modal === 'create') {
        if (!form.user_id || !form.code) return toast.error('Укажите пользователя и код');
        await api.post('/admin/partners', form);
        toast.success('Партнёр создан');
      } else {
        await api.patch(`/admin/partners/${modal.id}`, {
          label: form.label,
          commission_percent: form.commission_percent,
        });
        toast.success('Обновлено');
      }
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const toggleActive = async (p) => {
    try {
      await api.patch(`/admin/partners/${p.id}`, { is_active: !p.is_active });
      setPartners(list => list.map(x => x.id === p.id ? { ...x, is_active: !p.is_active } : x));
      toast.success(p.is_active ? 'Деактивирован' : 'Активирован');
    } catch { toast.error('Ошибка'); }
  };

  const remove = async (p) => {
    if (!confirm(`Удалить партнёра "${p.label || p.code}"?`)) return;
    try {
      await api.delete(`/admin/partners/${p.id}`);
      setPartners(list => list.filter(x => x.id !== p.id));
      toast.success('Удалён');
    } catch { toast.error('Ошибка'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <h1 className="text-xl font-bold text-white">Партнёры</h1>
        <span className="badge-gray">{partners.length}</span>
        <button onClick={openCreate} className="btn-primary text-sm ml-auto !py-1.5 !px-3 flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : partners.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-2">Партнёров пока нет</p>
          <button onClick={openCreate} className="btn-primary text-sm">Добавить партнёра</button>
        </div>
      ) : (
        <div className="space-y-2">
          {partners.map(p => (
            <div key={p.id} className="card flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-white">{p.label || 'Без названия'}</span>
                  <span className={clsx(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                    p.is_active ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                  )}>
                    {p.is_active ? 'Активен' : 'Неактивен'}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Пользователь: <span className="text-gray-300">{p.steam_username || p.name || p.email}</span>
                </p>
                <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                  <span>Код: <span className="font-mono font-bold text-amber-300">{p.code}</span></span>
                  <span>Комиссия: <span className="text-white font-medium">{parseFloat(p.commission_percent)}%</span></span>
                  <span>Рефералов: <span className="text-white font-medium">{p.total_referrals}</span></span>
                  <span>Заработано: <span className="text-green-400 font-medium">{(p.total_earnings / 100).toFixed(0)} ₽</span></span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => toggleActive(p)} className={clsx(
                  'text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors',
                  p.is_active ? 'text-red-400 hover:bg-red-500/10' : 'text-green-400 hover:bg-green-500/10'
                )}>
                  {p.is_active ? 'Выкл' : 'Вкл'}
                </button>
                <button onClick={() => openEdit(p)} className="text-gray-500 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
                  <Edit3 className="w-4 h-4" />
                </button>
                <button onClick={() => remove(p)} className="text-gray-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">
              {modal === 'create' ? '➕ Новый партнёр' : '✏️ Редактирование'}
            </h2>

            {modal === 'create' && (
              <>
                <div>
                  <label className="label">Пользователь</label>
                  <input
                    className="input"
                    placeholder="Поиск по email / имени..."
                    value={userSearch}
                    onChange={e => searchUsers(e.target.value)}
                  />
                  {users.length > 0 && (
                    <div className="mt-1 bg-gray-800 rounded-lg border border-gray-700/50 max-h-40 overflow-y-auto">
                      {users.map(u => (
                        <button
                          key={u.id}
                          onClick={() => { setForm(f => ({ ...f, user_id: u.id })); setUserSearch(u.steam_username || u.name || u.email); setUsers([]); }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700/50 transition-colors"
                        >
                          {u.steam_username || u.name || u.email}
                          <span className="text-gray-600 ml-2">{u.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {form.user_id && <p className="text-xs text-green-400 mt-1">✓ Пользователь выбран</p>}
                </div>

                <div>
                  <label className="label">Реферальный код</label>
                  <input
                    className="input font-mono"
                    placeholder="YOUTUBE2026"
                    value={form.code}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    maxLength={20}
                  />
                </div>
              </>
            )}

            <div>
              <label className="label">Название / описание</label>
              <input
                className="input"
                placeholder="Ютубер XYZ, канал 100К"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              />
            </div>

            <div>
              <label className="label">Комиссия (%)</label>
              <input
                className="input"
                type="number"
                min={1}
                max={90}
                step={0.5}
                value={form.commission_percent}
                onChange={e => setForm(f => ({ ...f, commission_percent: parseFloat(e.target.value) || 10 }))}
              />
              <p className="text-xs text-gray-600 mt-1">Процент от оплат приведённых пользователей</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModal(null)} className="btn-ghost text-sm">Отмена</button>
              <button onClick={save} className="btn-primary text-sm">
                {modal === 'create' ? 'Создать' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
