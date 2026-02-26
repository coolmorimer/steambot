import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Check, Zap, Crown, Building2, CreditCard } from 'lucide-react';
import clsx from 'clsx';

const PLAN_ICONS = { free: '🆓', starter: '⚡', pro: '👑', enterprise: '🏢' };
const PLAN_COLORS = {
  free:       'border-gray-700',
  starter:    'border-blue-600',
  pro:        'border-purple-600 ring-2 ring-purple-600/30',
  enterprise: 'border-yellow-600',
};
const PLAN_BTN = {
  free:       'bg-gray-700 hover:bg-gray-600 text-white',
  starter:    'bg-blue-600 hover:bg-blue-700 text-white',
  pro:        'bg-purple-600 hover:bg-purple-700 text-white',
  enterprise: 'bg-yellow-500 hover:bg-yellow-400 text-gray-900',
};

export default function Subscription() {
  const { user, sub, fetchMe } = useAuth();
  const [plans, setPlans]   = useState([]);
  const [period, setPeriod] = useState('monthly');
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState('');

  useEffect(() => {
    api.get('/subscriptions/plans')
      .then(r => setPlans(r.data))
      .catch(() => toast.error('Ошибка загрузки тарифов'))
      .finally(() => setLoading(false));
  }, []);

  const handleUpgrade = async (planId) => {
    if (planId === sub?.plan_id) return toast('Это ваш текущий тариф');
    setUpgrading(planId);
    try {
      const { data } = await api.post('/subscriptions/upgrade', { plan_id: planId, billing_period: period });
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        await fetchMe();
        toast.success(`Тариф "${planId}" активирован`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setUpgrading('');
    }
  };

  const handleCancel = async () => {
    if (!confirm('Отменить подписку?')) return;
    try {
      await api.post('/subscriptions/cancel');
      await fetchMe();
      toast.success('Подписка отменена');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Подписка</h1>
      </div>

      {/* Current plan banner */}
      {sub && (
        <CurrentPlanCard sub={sub} onCancel={handleCancel} />
      )}

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3">
        <span className={clsx('text-sm', period === 'monthly' ? 'text-white' : 'text-gray-500')}>Ежемесячно</span>
        <button
          onClick={() => setPeriod(p => p === 'monthly' ? 'yearly' : 'monthly')}
          className={clsx(
            'relative w-12 h-6 rounded-full transition-colors',
            period === 'yearly' ? 'bg-brand-600' : 'bg-gray-700'
          )}
        >
          <span className={clsx(
            'absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform',
            period === 'yearly' && 'translate-x-6'
          )} />
        </button>
        <span className={clsx('text-sm', period === 'yearly' ? 'text-white' : 'text-gray-500')}>
          Ежегодно <span className="badge-green text-xs ml-1">−20%</span>
        </span>
      </div>

      {/* Plans grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-80 animate-pulse bg-gray-800" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              period={period}
              isCurrent={sub?.plan_id === plan.id}
              onUpgrade={handleUpgrade}
              upgrading={upgrading === plan.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CurrentPlanCard({ sub, onCancel }) {
  const statusColor = { active: 'badge-green', trial: 'badge-yellow', expired: 'badge-red', cancelled: 'badge-gray' };

  return (
    <div className="card bg-brand-600/10 border-brand-700/40">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs text-gray-500 mb-1">Текущий тариф</p>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-lg font-bold text-white">{sub.plan_name}</p>
            <span className={statusColor[sub.status] || 'badge-gray'}>{statusLabels[sub.status] || sub.status}</span>
          </div>
          {sub.trial_ends_at && (
            <p className="text-xs text-yellow-400 mt-1">
              Пробный период до {new Date(sub.trial_ends_at).toLocaleDateString('ru')}
            </p>
          )}
          {sub.expires_at && (
            <p className="text-xs text-gray-500 mt-1">
              Следующее списание: {new Date(sub.expires_at).toLocaleDateString('ru')}
            </p>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <LimitList limits={sub.limits} />
          {sub.plan_id !== 'free' && sub.status === 'active' && (
            <button onClick={onCancel} className="btn-ghost text-xs">Отменить</button>
          )}
        </div>
      </div>
    </div>
  );
}

function LimitList({ limits }) {
  if (!limits) return null;
  const items = [
    { label: 'Аккаунтов', value: limits.max_steam_accounts },
    { label: 'Кампаний',  value: limits.max_campaigns },
    { label: 'Заданий/день', value: limits.max_jobs_per_day },
  ];
  return (
    <div className="flex gap-4 flex-wrap">
      {items.map(({ label, value }) => (
        <div key={label} className="text-center">
          <p className="text-lg font-bold text-white">{value === -1 ? '∞' : value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      ))}
    </div>
  );
}

function PlanCard({ plan, period, isCurrent, onUpgrade, upgrading }) {
  const price = period === 'yearly' ? plan.price_yearly : plan.price_monthly;
  const features = buildFeatures(plan);

  return (
    <div className={clsx('card flex flex-col', PLAN_COLORS[plan.id] || 'border-gray-700')}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{PLAN_ICONS[plan.id] || '📦'}</span>
        <h3 className="font-bold text-white text-lg">{plan.name}</h3>
        {plan.id === 'pro' && <span className="badge-blue text-xs">Популярный</span>}
      </div>

      <div className="mb-4">
        <span className="text-3xl font-bold text-white">
          {price === 0 ? 'Бесплатно' : `$${price}`}
        </span>
        {price > 0 && (
          <span className="text-gray-500 text-sm ml-1">/ {period === 'yearly' ? 'год' : 'мес'}</span>
        )}
      </div>

      <ul className="space-y-2 flex-1 mb-4 text-sm">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-gray-300">
            <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        disabled={isCurrent || upgrading}
        onClick={() => onUpgrade(plan.id)}
        className={clsx('btn w-full text-sm', isCurrent ? 'opacity-50 cursor-default bg-gray-700' : PLAN_BTN[plan.id])}
      >
        {upgrading ? 'Подождите...' : isCurrent ? 'Текущий тариф' : plan.price_monthly === 0 ? 'Выбрать' : 'Перейти'}
      </button>
    </div>
  );
}

function buildFeatures(plan) {
  const f = [];
  f.push(`${plan.max_steam_accounts === -1 ? 'Неограниченно' : plan.max_steam_accounts} Steam аккаунта`);
  f.push(`${plan.max_campaigns === -1 ? 'Неограниченно' : plan.max_campaigns} кампании`);
  f.push(`${plan.max_jobs_per_day === -1 ? 'Неограниченно' : plan.max_jobs_per_day} постов в день`);
  if (plan.max_telegram_bots > 0) f.push('Telegram бот');
  if (plan.has_mini_app)         f.push('Telegram Mini App');
  if (plan.has_ai_templates)     f.push('AI шаблоны');
  if (plan.has_analytics)        f.push('Аналитика');
  if (plan.has_api_access)       f.push('API доступ');
  if (plan.has_priority_support) f.push('Приоритетная поддержка');
  return f;
}

const statusLabels = { active: 'Активна', trial: 'Пробный', expired: 'Истекла', cancelled: 'Отменена' };
