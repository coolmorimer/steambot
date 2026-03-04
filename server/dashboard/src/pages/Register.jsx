import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AuthShell } from './Login';
import { Loader2, Gift } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Register() {
  const { register } = useAuth();
  const navigate     = useNavigate();
  const [searchParams] = useSearchParams();

  const [form, setForm]       = useState({ name: '', email: '', password: '', password2: '', referralCode: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) setForm(p => ({ ...p, referralCode: ref.toUpperCase() }));
  }, [searchParams]);

  const submit = async e => {
    e.preventDefault();
    if (form.password !== form.password2) return toast.error('Пароли не совпадают');
    setLoading(true);
    try {
      await register(form.email, form.password, form.name, form.referralCode || undefined);
      toast.success('Добро пожаловать!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  const f = (k) => e => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <AuthShell title="Регистрация" subtitle="Создайте аккаунт за 30 секунд">
      {/* Trial info banner */}
      <div className="rounded-xl bg-emerald-900/20 border border-emerald-700/30 p-3 mb-4 flex items-center gap-3">
        <span className="text-2xl">🎁</span>
        <div>
          <p className="text-sm font-semibold text-emerald-300">3 дня бесплатно</p>
          <p className="text-xs text-gray-400">Пробный период активируется сразу после регистрации</p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">👤 Имя <span className="text-gray-600">(необязательно)</span></label>
          <input className="input" type="text" placeholder="Ваше имя" value={form.name} onChange={f('name')} />
        </div>
        <div>
          <label className="label">📧 Email</label>
          <input className="input" type="email" required autoFocus placeholder="you@example.com" value={form.email} onChange={f('email')} />
        </div>
        <div>
          <label className="label">🔒 Пароль <span className="text-gray-600">(минимум 8 символов)</span></label>
          <input className="input" type="password" required minLength={8} placeholder="••••••••" value={form.password} onChange={f('password')} />
        </div>
        <div>
          <label className="label">🔒 Повторите пароль</label>
          <input className="input" type="password" required placeholder="••••••••" value={form.password2} onChange={f('password2')} />
        </div>
        <div>
          <label className="label flex items-center gap-1.5">
            <Gift className="w-3.5 h-3.5 text-purple-400" /> Реферальный код <span className="text-gray-600">(если есть)</span>
          </label>
          <input
            className="input"
            type="text"
            placeholder="ABCD1234"
            value={form.referralCode}
            onChange={e => setForm(p => ({ ...p, referralCode: e.target.value.toUpperCase() }))}
            maxLength={16}
          />
          {form.referralCode && (
            <p className="text-xs text-purple-400 mt-1">🎁 Код применится при регистрации</p>
          )}
        </div>
        <button type="submit" className="btn-primary w-full py-3 text-base" disabled={loading}>
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : '✨ Зарегистрироваться'}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-gray-500">
        Уже есть аккаунт?{' '}
        <Link to="/login" className="text-brand-400 hover:text-brand-300 font-semibold transition-colors">Войти</Link>
      </p>
    </AuthShell>
  );
}
