import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import {
  Check, Zap, Crown, Building2, CreditCard, AlertTriangle,
  Clock, Shield, Wrench, ArrowRight, Lock,
} from 'lucide-react';
import clsx from 'clsx';

const PLAN_ICONS = { free: Zap, starter: Zap, pro: Crown, enterprise: Building2 };
const PLAN_COLORS = {
  free:       { border: 'border-gray-700', icon: 'bg-gray-600/20 text-gray-400', btn: 'bg-gray-700 hover:bg-gray-600 text-white' },
  starter:    { border: 'border-blue-600/40', icon: 'bg-blue-600/20 text-blue-400', btn: 'bg-blue-600 hover:bg-blue-700 text-white' },
  pro:        { border: 'border-purple-600/40 ring-2 ring-purple-600/20', icon: 'bg-purple-600/20 text-purple-400', btn: 'bg-purple-600 hover:bg-purple-700 text-white' },
  enterprise: { border: 'border-yellow-600/40', icon: 'bg-yellow-600/20 text-yellow-400', btn: 'bg-yellow-500 hover:bg-yellow-400 text-gray-900' },
};

export default function Subscription() {
  const { user, sub, fetchMe } = useAuth();
  const [plans, setPlans]     = useState([]);
  const [period, setPeriod]   = useState('monthly');
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    api.get('/subscriptions/plans')
      .then(r => setPlans(r.data))
      .catch(() => toast.error('Ошибка загрузки тарифов'))
      .finally(() => setLoading(false));
  }, []);

  const isTrialActive = sub?.status === 'trial' && sub?.trial_ends_at && new Date(sub.trial_ends_at) > new Date();
  const isExpired = !sub || sub.status === 'expired' || sub.status === 'cancelled'
    || (sub.status === 'trial' && sub.trial_ends_at && new Date(sub.trial_ends_at) <= new Date());
  const isActive = sub?.status === 'active';

  const trialDaysLeft = isTrialActive
    ? Math.max(0, Math.ceil((new Date(sub.trial_ends_at) - Date.now()) / 86400000))
    : 0;

  const handleUpgrade = async (planId) => {
    if (planId === sub?.plan_id && !isExpired) return toast('Это ваш текущий тариф');
    setShowPaymentModal(true);
    return;
    try {
      const { data } = await api.post('/subscriptions/upgrade', { plan_id: planId, billing_period: period });
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else if (data.code === 'PAYMENT_REQUIRED') {
        toast.error(data.error);
      } else {
        await fetchMe();
        toast.success(`Тариф "${planId}" активирован`);
      }
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'PAYMENT_REQUIRED') {
        toast.error(err.response.data.error);
      } else {
        toast.error(err.response?.data?.error || 'Ошибка');
      }
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
      {sub && <CurrentPlanCard sub={sub} isTrialActive={isTrialActive} trialDaysLeft={trialDaysLeft} onCancel={handleCancel} />}

      {/* ═══ EXPIRED — Payment placeholder ═══ */}
      {isExpired && (
        <div className="card border-yellow-600/30 bg-gradient-to-b from-yellow-900/10 to-transparent">
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mx-auto mb-4">
              <Wrench className="w-8 h-8 text-yellow-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Оплата пока недоступна</h2>
            <p className="text-gray-400 text-sm max-w-md mx-auto mb-4">
              Система оплаты находится в разработке. Для продления подписки обратитесь к администратору через чат поддержки.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Shield className="w-4 h-4" />
                <span>Безопасные платежи скоро</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <CreditCard className="w-4 h-4" />
                <span>Stripe, банковские карты</span>
              </div>
            </div>
          </div>
        </div>
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
              isTrialActive={isTrialActive}
              isExpired={isExpired}
              isActive={isActive}
              onUpgrade={handleUpgrade}
              upgrading={upgrading === plan.id}
            />
          ))}
        </div>
      )}

      {/* ═══ Payment modal ═══ */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowPaymentModal(false)}>
          <div className="w-full max-w-md rounded-2xl border border-yellow-600/30 bg-gray-900 p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mx-auto mb-4">
                <Wrench className="w-8 h-8 text-yellow-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Оплата в разработке</h2>
              <p className="text-gray-400 text-sm mb-6">
                Система оплаты находится в разработке. Для смены тарифа или продления подписки обратитесь к администратору через чат поддержки.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Shield className="w-4 h-4" />
                  <span>Безопасные платежи скоро</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <CreditCard className="w-4 h-4" />
                  <span>Stripe, банковские карты</span>
                </div>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="btn bg-gray-700 hover:bg-gray-600 text-white px-6"
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CurrentPlanCard({ sub, isTrialActive, trialDaysLeft, onCancel }) {
  const statusMap = {
    active: { label: 'Активна', badge: 'badge-green' },
    trial: { label: 'Пробный период', badge: 'badge-yellow' },
    expired: { label: 'Истекла', badge: 'badge-red' },
    cancelled: { label: 'Отменена', badge: 'badge-gray' },
  };
  const s = statusMap[sub.status] || { label: sub.status, badge: 'badge-gray' };

  return (
    <div className={clsx('card', sub.status === 'expired' ? 'bg-red-900/10 border-red-700/30' : 'bg-brand-600/10 border-brand-700/40')}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs text-gray-500 mb-1">Текущий тариф</p>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-lg font-bold text-white">{sub.plan_name}</p>
            <span className={s.badge}>{s.label}</span>
          </div>
          {isTrialActive && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <Clock className="w-3.5 h-3.5 text-yellow-400" />
              <p className="text-xs text-yellow-400">
                Пробный период — осталось {trialDaysLeft} дн. (до {new Date(sub.trial_ends_at).toLocaleDateString('ru')})
              </p>
            </div>
          )}
          {sub.status === 'expired' && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <p className="text-xs text-red-400">
                Подписка истекла. Оплатите тариф или обратитесь к администратору.
              </p>
            </div>
          )}
          {sub.expires_at && sub.status === 'active' && (
            <p className="text-xs text-gray-500 mt-1">
              Действует до: {new Date(sub.expires_at).toLocaleDateString('ru')}
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

function PlanCard({ plan, period, isCurrent, isTrialActive, isExpired, isActive, onUpgrade, upgrading }) {
  const price = period === 'yearly' ? plan.price_yearly : plan.price_monthly;
  const features = buildFeatures(plan);
  const colors = PLAN_COLORS[plan.id] || PLAN_COLORS.free;
  const IconComp = PLAN_ICONS[plan.id] || Zap;

  // Кнопка: все не-текущие планы показывают «Оплатить» (модалка)
  const showPaymentNeeded = !isCurrent || isExpired;

  let btnLabel = 'Оплатить';
  let btnDisabled = false;

  if (isCurrent && !isExpired) {
    btnLabel = 'Текущий тариф';
    btnDisabled = true;
  }

  return (
    <div className={clsx('card flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-lg group', colors.border)}>
      <div className="flex items-center gap-2 mb-2">
        <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center', colors.icon)}>
          <IconComp className="w-5 h-5" />
        </div>
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
        disabled={btnDisabled || upgrading}
        onClick={() => onUpgrade(plan.id)}
        className={clsx(
          'btn w-full text-sm transition-all',
          btnDisabled ? 'opacity-50 cursor-default bg-gray-700 text-gray-400' : colors.btn,
          showPaymentNeeded && 'flex items-center justify-center gap-1.5',
        )}
      >
        {upgrading ? 'Подождите...' : (
          <>
            {showPaymentNeeded && <Lock className="w-3.5 h-3.5" />}
            {btnLabel}
          </>
        )}
      </button>
    </div>
  );
}

function buildFeatures(plan) {
  const f = [];
  f.push(`${plan.max_steam_accounts === -1 ? 'Неограниченно' : plan.max_steam_accounts} Steam аккаунтов`);
  f.push(`${plan.max_campaigns === -1 ? 'Неограниченно' : plan.max_campaigns} кампаний`);
  f.push(`${plan.max_jobs_per_day === -1 ? 'Неограниченно' : plan.max_jobs_per_day} постов в день`);
  if (plan.max_telegram_bots > 0) f.push('Telegram бот');
  if (plan.has_mini_app)         f.push('Telegram Mini App');
  if (plan.has_ai_templates)     f.push('AI шаблоны');
  if (plan.has_analytics)        f.push('Аналитика');
  if (plan.has_api_access)       f.push('API доступ');
  if (plan.has_priority_support) f.push('Приоритетная поддержка');
  return f;
}
