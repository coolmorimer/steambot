import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AuthShell } from './Login';
import { Loader2, Gift, Zap, Crown, Building2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const TRIAL_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    icon: Zap,
    color: 'blue',
    features: ['5 Steam аккаунтов', '10 задач', '120 постов/день', 'Telegram бот'],
  },
  {
    id: 'pro',
    name: 'Pro',
    icon: Crown,
    color: 'purple',
    popular: true,
    features: ['12 Steam аккаунтов', '24 задачи', '288 постов/день', 'AI шаблоны'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    icon: Building2,
    color: 'yellow',
    features: ['Без ограничений', 'API доступ', 'Приоритетная поддержка'],
  },
];

export default function Register() {
  const { register } = useAuth();
  const navigate     = useNavigate();
  const [searchParams] = useSearchParams();

  const [form, setForm]       = useState({ name: '', email: '', password: '', password2: '', referralCode: '', trialPlan: 'starter' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) setForm(p => ({ ...p, referralCode: ref.toUpperCase() }));
  }, [searchParams]);

  const submit = async e => {
    e.preventDefault();
    if (form.password !== form.password2) return toast.error('Пароли не совпадают');
    if (!form.trialPlan) return toast.error('Выберите пробный тариф');
    setLoading(true);
    try {
      await register(form.email, form.password, form.name, form.referralCode || undefined, form.trialPlan);
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
      {/* Trial plan selection */}
      <div className="mb-4">
        <p className="text-sm font-semibold text-white mb-2">🎁 Выберите пробный тариф <span className="text-emerald-400">(3 дня бесплатно)</span></p>
        <div className="grid grid-cols-3 gap-2">
          {TRIAL_PLANS.map(plan => {
            const Icon = plan.icon;
            const selected = form.trialPlan === plan.id;
            const colors = {
              blue:   { ring: 'ring-blue-500',   bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/40' },
              purple: { ring: 'ring-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/40' },
              yellow: { ring: 'ring-yellow-500', bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/40' },
            }[plan.color];
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setForm(p => ({ ...p, trialPlan: plan.id }))}
                className={clsx(
                  'relative rounded-xl border p-3 text-center transition-all duration-200',
                  selected
                    ? `${colors.border} ${colors.bg} ring-2 ${colors.ring}`
                    : 'border-gray-700/50 bg-gray-800/30 hover:border-gray-600'
                )}
              >
                {plan.popular && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-full font-semibold">
                    Популярный
                  </span>
                )}
                {selected && (
                  <div className="absolute top-1.5 right-1.5">
                    <Check className={clsx('w-4 h-4', colors.text)} />
                  </div>
                )}
                <Icon className={clsx('w-5 h-5 mx-auto mb-1', selected ? colors.text : 'text-gray-500')} />
                <p className={clsx('text-sm font-bold', selected ? 'text-white' : 'text-gray-400')}>{plan.name}</p>
                <div className="mt-1.5 space-y-0.5">
                  {plan.features.slice(0, 2).map((f, i) => (
                    <p key={i} className="text-[10px] text-gray-500 leading-tight">{f}</p>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-500 mt-1.5 text-center">
          После пробного периода — бесплатный тариф Free (P2P обмен, баланс)
        </p>
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
