import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, Link2, ExternalLink, ArrowRight, Sparkles, CheckCircle, ShieldCheck, ShieldOff } from 'lucide-react';
import { RestartTourButton } from '../components/OnboardingTour';
import { resetAllHints } from '../components/PageHint';
import PageGuide from '../components/PageGuide';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function Settings() {
  const { user, fetchMe } = useAuth();

  const [profile, setProfile] = useState({ name: user?.name || '' });
  const [pass, setPass]       = useState({ current: '', next: '', next2: '' });
  const [savingP, setSavingP] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  // Trade URL
  const [tradeUrl, setTradeUrl]   = useState(user?.trade_url || '');
  const [savingUrl, setSavingUrl] = useState(false);

  // 2FA
  const [tfa, setTfa]             = useState({ enabled: false, method: null });
  const [tfaMethod, setTfaMethod] = useState('email');
  const [tfaCode, setTfaCode]     = useState('');
  const [tfaStep, setTfaStep]     = useState('idle'); // idle | sent | confirming
  const [tfaLoading, setTfaLoading] = useState(false);
  const [disablePw, setDisablePw] = useState('');

  useEffect(() => { setTradeUrl(user?.trade_url || ''); }, [user?.trade_url]);

  useEffect(() => {
    api.get('/auth/2fa/status').then(r => setTfa(r.data)).catch(() => {});
  }, []);

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

  const saveTradeUrl = async () => {
    if (!tradeUrl.trim()) return toast.error('Вставьте Trade URL');
    setSavingUrl(true);
    try {
      await api.put('/balance/trade-url', { trade_url: tradeUrl });
      toast.success('Trade URL сохранён!');
      fetchMe();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setSavingUrl(false); }
  };

  return (
    <div className="space-y-6 max-w-xl animate-slide-up">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-500/20 to-brand-500/20 border border-gray-500/20 flex items-center justify-center">
          <span className="text-lg">👤</span>
        </div>
        <h1 className="text-xl font-extrabold text-white tracking-tight">Профиль</h1>
      </div>

      <PageGuide id="settings-guide" emoji="👤" title="📖 Инструкция: Профиль" sections={[
        {
          icon: '🎯', heading: 'Для чего эта страница',
          text: 'Здесь вы можете изменить имя, сменить пароль, посмотреть информацию об аккаунте и перезапустить обучение.',
        },
        {
          icon: '⚙️', heading: 'Настройки профиля',
          items: [
            { label: 'Email', desc: 'ваш адрес эл. почты (нельзя изменить)' },
            { label: 'Имя', desc: 'отображаемое имя в системе' },
            { label: 'Пароль', desc: 'измените текущий пароль на новый (мин. 8 символов)' },
          ],
        },
        {
          icon: '🎓', heading: 'Обучение',
          text: 'В блоке «Обучение» можно перезапустить интерактивный тур или показать все подсказки заново.',
        },
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

      {/* 2FA */}
      <section className="card-glass space-y-4">
        <h2 className="font-bold text-white flex items-center gap-2">
          {tfa.enabled ? <ShieldCheck className="w-5 h-5 text-green-400" /> : <ShieldOff className="w-5 h-5 text-gray-500" />}
          🔐 Двухфакторная аутентификация
        </h2>

        {tfa.enabled ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-300">2FA включена</p>
                <p className="text-xs text-gray-400 mt-0.5">Метод: {tfa.method === 'email' ? '📧 Email' : '📱 Telegram'}</p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="label">🔒 Пароль для отключения</label>
              <input className="input" type="password" placeholder="Текущий пароль"
                value={disablePw} onChange={e => setDisablePw(e.target.value)} />
              <button className="btn-secondary text-sm w-full" disabled={tfaLoading || !disablePw}
                onClick={async () => {
                  setTfaLoading(true);
                  try {
                    await api.post('/auth/2fa/disable', { password: disablePw });
                    setTfa({ enabled: false, method: null });
                    setDisablePw('');
                    toast.success('2FA отключена');
                  } catch (err) {
                    toast.error(err.response?.data?.error || 'Ошибка');
                  } finally { setTfaLoading(false); }
                }}>
                {tfaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '🔓 Отключить 2FA'}
              </button>
            </div>
          </div>
        ) : tfaStep === 'idle' ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-400">Добавьте дополнительную защиту — при каждом входе потребуется код из Email или Telegram.</p>
            <div className="flex gap-2">
              <button className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                tfaMethod === 'email'
                  ? 'bg-brand-500/10 border-brand-500/30 text-brand-400'
                  : 'bg-gray-800/50 border-gray-700/30 text-gray-400 hover:border-gray-600'
              }`} onClick={() => setTfaMethod('email')}>📧 Email</button>
              <button className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                tfaMethod === 'telegram'
                  ? 'bg-brand-500/10 border-brand-500/30 text-brand-400'
                  : 'bg-gray-800/50 border-gray-700/30 text-gray-400 hover:border-gray-600'
              }`} onClick={() => setTfaMethod('telegram')}>📱 Telegram</button>
            </div>
            <button className="btn-primary w-full" disabled={tfaLoading}
              onClick={async () => {
                setTfaLoading(true);
                try {
                  await api.post('/auth/2fa/enable', { method: tfaMethod });
                  setTfaStep('sent');
                  toast.success('Код отправлен!');
                } catch (err) {
                  toast.error(err.response?.data?.error || 'Ошибка');
                } finally { setTfaLoading(false); }
              }}>
              {tfaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '🔐 Включить 2FA'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-400">Код отправлен {tfaMethod === 'email' ? 'на вашу почту' : 'в Telegram'}. Введите его ниже:</p>
            <input className="input text-center text-lg tracking-widest font-mono" maxLength={6}
              placeholder="000000" value={tfaCode}
              onChange={e => setTfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            <button className="btn-primary w-full" disabled={tfaLoading || tfaCode.length !== 6}
              onClick={async () => {
                setTfaLoading(true);
                try {
                  const r = await api.post('/auth/2fa/confirm', { code: tfaCode });
                  setTfa({ enabled: true, method: r.data.method });
                  setTfaStep('idle');
                  setTfaCode('');
                  toast.success('2FA успешно включена! 🔐');
                } catch (err) {
                  toast.error(err.response?.data?.error || 'Неверный код');
                } finally { setTfaLoading(false); }
              }}>
              {tfaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '✅ Подтвердить'}
            </button>
            <button className="btn-ghost text-xs w-full" onClick={() => { setTfaStep('idle'); setTfaCode(''); }}>
              ← Назад
            </button>
          </div>
        )}
      </section>

      {/* Steam / Trade URL */}
      <section className="card-glass space-y-4">
        <h2 className="font-bold text-white flex items-center gap-2">🎮 Steam профиль</h2>

        {user?.steam_id ? (
          <div className="relative overflow-hidden rounded-xl border border-green-500/20 bg-green-500/5 p-4">
            <div className="relative flex items-center gap-4">
              {user.steam_avatar ? (
                <img src={user.steam_avatar} className="w-14 h-14 rounded-xl ring-2 ring-green-500/20 shadow-lg" alt="" />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-green-500/20 flex items-center justify-center text-green-400 text-xl">🎮</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-base font-bold text-white">{user.steam_username}</p>
                  <CheckCircle className="w-4 h-4 text-green-400" />
                </div>
                <p className="text-xs text-gray-500 font-mono mt-0.5">ID: {user.steam_id}</p>
              </div>
              <a href={`https://steamcommunity.com/profiles/${user.steam_id}`}
                target="_blank" rel="noopener"
                className="btn-ghost text-xs px-2.5 py-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 text-center">
            <div className="text-3xl mb-2">🎮</div>
            <p className="text-sm text-amber-300 font-semibold">Steam не привязан</p>
            <p className="text-xs text-gray-500 mt-1">Вставьте Trade URL ниже — система автоматически привяжет ваш Steam</p>
          </div>
        )}

        <div className="space-y-3">
          <label className="label flex items-center gap-2">
            <Link2 className="w-4 h-4 text-gray-500" /> Steam Trade URL
          </label>
          <input className="input"
            placeholder="https://steamcommunity.com/tradeoffer/new/?partner=...&token=..."
            value={tradeUrl} onChange={e => setTradeUrl(e.target.value)} />

          <div className="flex items-center justify-between">
            <a href="https://steamcommunity.com/my/tradeoffers/privacy#trade_offer_access_url"
              target="_blank" rel="noopener"
              className="text-xs text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1 transition-colors">
              🔍 Где найти Trade URL? <ArrowRight className="w-3 h-3" />
            </a>
          </div>

          {!user?.steam_id && tradeUrl && (
            <div className="flex items-center gap-2 text-xs text-green-400/80 bg-green-500/5 rounded-lg px-3 py-2 border border-green-500/10">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              Steam привяжется автоматически при сохранении
            </div>
          )}

          <button
            className={`w-full text-sm py-3 ${user?.steam_id ? 'btn-secondary' : 'btn-success'}`}
            onClick={saveTradeUrl} disabled={savingUrl}
          >
            {savingUrl ? <Loader2 className="w-4 h-4 animate-spin" /> : user?.steam_id ? '🔄 Обновить Trade URL' : '🎮 Привязать Steam'}
          </button>
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
