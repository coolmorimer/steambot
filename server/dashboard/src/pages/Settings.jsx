import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function Settings() {
  const { user, fetchMe } = useAuth();

  const [profile, setProfile] = useState({ name: user?.name || '' });
  const [pass, setPass]       = useState({ current: '', next: '', next2: '' });
  const [savingP, setSavingP] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  const saveProfile = async e => {
    e.preventDefault();
    setSavingP(true);
    try {
      await api.patch('/auth/profile', { name: profile.name });
      await fetchMe();
      toast.success('Профиль сохранён');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setSavingP(false);
    }
  };

  const savePassword = async e => {
    e.preventDefault();
    if (pass.next !== pass.next2) return toast.error('Пароли не совпадают');
    setSavingPw(true);
    try {
      await api.patch('/auth/profile', { current_password: pass.current, new_password: pass.next });
      setPass({ current: '', next: '', next2: '' });
      toast.success('Пароль изменён');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-xl font-bold text-white">Настройки</h1>

      {/* Profile */}
      <section className="card space-y-4">
        <h2 className="font-semibold text-white">Профиль</h2>
        <form onSubmit={saveProfile} className="space-y-3">
          <div>
            <label className="label">Email</label>
            <input className="input opacity-60 cursor-not-allowed" value={user?.email} readOnly />
          </div>
          <div>
            <label className="label">Имя</label>
            <input className="input" value={profile.name}
              onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
          </div>
          <button type="submit" className="btn-primary" disabled={savingP}>
            {savingP ? 'Сохраняю...' : 'Сохранить'}
          </button>
        </form>
      </section>

      {/* Password */}
      <section className="card space-y-4">
        <h2 className="font-semibold text-white">Смена пароля</h2>
        <form onSubmit={savePassword} className="space-y-3">
          <div>
            <label className="label">Текущий пароль</label>
            <input className="input" type="password" required
              value={pass.current} onChange={e => setPass(p => ({ ...p, current: e.target.value }))} />
          </div>
          <div>
            <label className="label">Новый пароль</label>
            <input className="input" type="password" required minLength={8}
              value={pass.next} onChange={e => setPass(p => ({ ...p, next: e.target.value }))} />
          </div>
          <div>
            <label className="label">Повторите новый пароль</label>
            <input className="input" type="password" required
              value={pass.next2} onChange={e => setPass(p => ({ ...p, next2: e.target.value }))} />
          </div>
          <button type="submit" className="btn-primary" disabled={savingPw}>
            {savingPw ? 'Сохраняю...' : 'Изменить пароль'}
          </button>
        </form>
      </section>

      {/* Account info */}
      <section className="card space-y-2 text-sm">
        <h2 className="font-semibold text-white">Информация об аккаунте</h2>
        <div className="flex justify-between text-gray-400">
          <span>ID</span><span className="font-mono text-gray-300">{user?.id?.slice(0, 8)}…</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Роль</span><span className="text-gray-300">{user?.role}</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Дата регистрации</span>
          <span className="text-gray-300">{new Date(user?.created_at).toLocaleDateString('ru')}</span>
        </div>
      </section>
    </div>
  );
}
