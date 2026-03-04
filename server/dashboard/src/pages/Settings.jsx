import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, ExternalLink, Info } from 'lucide-react';
import { RestartTourButton } from '../components/OnboardingTour';
import { resetAllHints } from '../components/PageHint';
import PageHint from '../components/PageHint';
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
    <div className="space-y-6 max-w-xl animate-slide-up">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-500/20 to-brand-500/20 border border-gray-500/20 flex items-center justify-center">
          <span className="text-lg">👤</span>
        </div>
        <h1 className="text-xl font-extrabold text-white tracking-tight">Профиль</h1>
      </div>

      <PageHint id="settings-intro" emoji="👤" title="Здесь можно настроить ваш профиль"
        steps={[
          'Измените имя или смените пароль',
          'Ниже — инструкция, как узнать Telegram User ID (нужен для уведомлений)',
          'Перезапустите обучение или покажите все подсказки заново',
        ]} />

      {/* Profile */}
      <section className="card-glass space-y-4">
        <h2 className="font-bold text-white flex items-center gap-2">👤 Профиль</h2>
        <form onSubmit={saveProfile} className="space-y-3">
          <div>
            <label className="label">📧 Email</label>
            <input className="input opacity-60 cursor-not-allowed" value={user?.email} readOnly />
          </div>
          <div>
            <label className="label">✏️ Имя</label>
            <input className="input" value={profile.name} placeholder="Ваше имя"
              onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
          </div>
          <button type="submit" className="btn-primary" disabled={savingP}>
            {savingP ? <Loader2 className="w-4 h-4 animate-spin" /> : '💾 Сохранить'}
          </button>
        </form>
      </section>

      {/* Password */}
      <section className="card-glass space-y-4">
        <h2 className="font-bold text-white flex items-center gap-2">🔐 Смена пароля</h2>
        <form onSubmit={savePassword} className="space-y-3">
          <div>
            <label className="label">🔒 Текущий пароль</label>
            <input className="input" type="password" required placeholder="••••••••"
              value={pass.current} onChange={e => setPass(p => ({ ...p, current: e.target.value }))} />
          </div>
          <div>
            <label className="label">🆕 Новый пароль</label>
            <input className="input" type="password" required minLength={8} placeholder="Минимум 8 символов"
              value={pass.next} onChange={e => setPass(p => ({ ...p, next: e.target.value }))} />
          </div>
          <div>
            <label className="label">🔒 Повторите новый пароль</label>
            <input className="input" type="password" required placeholder="••••••••"
              value={pass.next2} onChange={e => setPass(p => ({ ...p, next2: e.target.value }))} />
          </div>
          <button type="submit" className="btn-primary" disabled={savingPw}>
            {savingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : '🔄 Изменить пароль'}
          </button>
        </form>
      </section>

      {/* Telegram User ID instruction */}
      <section className="card-glass space-y-3">
        <h2 className="font-bold text-white flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" />
          Как узнать Telegram User ID
        </h2>
        <p className="text-sm text-gray-400">
          User ID нужен для поля «Chat IDs» при подключении Telegram-бота (раздел «Уведомления»).
          Это число вида <code className="bg-gray-800 px-1.5 py-0.5 rounded text-brand-400 text-xs">123456789</code>.
        </p>
        <div className="rounded-xl bg-blue-900/10 border border-blue-700/20 p-3 space-y-1">
          <p className="text-sm text-blue-300 font-medium">Через бота @userinfobot:</p>
          <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm text-brand-400 hover:text-brand-300 font-medium transition-colors">
            <ExternalLink className="w-4 h-4" />
            Открыть @userinfobot в Telegram
          </a>
          <p className="text-xs text-gray-500">Нажмите Start — бот покажет ваш User ID. Скопируйте число и вставьте в поле Chat IDs.</p>
        </div>
      </section>

      {/* Account info */}
      <section className="card-glass space-y-3 text-sm">
        <h2 className="font-bold text-white flex items-center gap-2">ℹ️ Информация об аккаунте</h2>
        <div className="flex justify-between text-gray-400">
          <span>ID</span><span className="font-mono text-gray-300 bg-gray-800 px-2 py-0.5 rounded">{user?.id?.slice(0, 8)}…</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Роль</span><span className="text-gray-300 capitalize">{user?.role}</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Дата регистрации</span>
          <span className="text-gray-300">{new Date(user?.created_at).toLocaleDateString('ru')}</span>
        </div>
      </section>

      {/* Tour restart */}
      <section className="card-glass space-y-3">
        <h2 className="font-bold text-white flex items-center gap-2">🎓 Обучение</h2>
        <p className="text-sm text-gray-400">Пройдите интерактивный тур по интерфейсу ещё раз, если забыли где что находится.</p>
        <div className="flex flex-wrap gap-2">
          <RestartTourButton userId={user?.id} />
          <button onClick={() => { resetAllHints(); toast.success('Все подсказки 💡 снова видны'); }}
            className="btn-ghost text-sm flex items-center gap-2">
            💡 Показать все подсказки
          </button>
        </div>
      </section>
    </div>
  );
}
