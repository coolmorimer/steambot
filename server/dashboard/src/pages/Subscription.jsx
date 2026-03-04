import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import {
  Check, Zap, Crown, Building2, CreditCard, AlertTriangle,
  Clock, Shield, Calendar, Receipt, ArrowRight, ChevronDown,
  ChevronUp, Banknote, Smartphone, RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';
import PageGuide from '../components/PageGuide';

const PLAN_ICONS = { free: Zap, starter: Zap, pro: Crown, enterprise: Building2 };
const PLAN_COLORS = {
  free:       { border: 'border-gray-700', icon: 'bg-gray-600/20 text-gray-400', btn: 'bg-gray-700 hover:bg-gray-600 text-white' },
  starter:    { border: 'border-blue-600/40', icon: 'bg-blue-600/20 text-blue-400', btn: 'bg-blue-600 hover:bg-blue-700 text-white' },
  pro:        { border: 'border-purple-600/40 ring-2 ring-purple-600/20', icon: 'bg-purple-600/20 text-purple-400', btn: 'bg-purple-600 hover:bg-purple-700 text-white' },
  enterprise: { border: 'border-yellow-600/40', icon: 'bg-yellow-600/20 text-yellow-400', btn: 'bg-yellow-500 hover:bg-yellow-400 text-gray-900' },
};

const STATUS_MAP = {
  active:    { label: 'Активна',         badge: 'badge-green',  icon: '✅' },
  trial:     { label: 'Пробный период',  badge: 'badge-yellow', icon: '⏳' },
  expired:   { label: 'Истекла',         badge: 'badge-red',    icon: '❌' },
  cancelled: { label: 'Отменена',        badge: 'badge-gray',   icon: '⛔' },
  past_due:  { label: 'Просрочена',      badge: 'badge-red',    icon: '⚠️' },
};

const PAYMENT_METHODS = {
  sberbank: '💳 Банковская карта',
  sbp:      '💳 СБП',
  stripe:   '💳 Stripe',
  manual:   '🛠 Вручную',
};

export default function Subscription() {
  const { user, sub, fetchMe } = useAuth();
  const [plans, setPlans]             = useState([]);
  const [period, setPeriod]           = useState('monthly');
  const [loading, setLoading]         = useState(true);
  const [upgrading, setUpgrading]     = useState('');
  const [currentSub, setCurrentSub]   = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(null); // { planId, payment }
  const [refreshing, setRefreshing]   = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [plansRes, subRes, txRes] = await Promise.all([
        api.get('/subscriptions/plans'),
        api.get('/subscriptions/current'),
        api.get('/subscriptions/transactions').catch(() => ({ data: [] })),
      ]);
      setPlans(plansRes.data);
      setCurrentSub(subRes.data);
      setTransactions(txRes.data);
    } catch {
      toast.error('Ошибка загрузки данных подписки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const cs = currentSub || sub; // fallback to AuthContext sub

  const isTrialActive = cs?.status === 'trial' && cs?.trial_ends_at && new Date(cs.trial_ends_at) > new Date();
  const isExpired = !cs || cs.status === 'expired' || cs.status === 'cancelled'
    || (cs.status === 'trial' && cs.trial_ends_at && new Date(cs.trial_ends_at) <= new Date());
  const isActive = cs?.status === 'active';

  const daysLeft = cs?.days_left ?? (
    isTrialActive ? Math.max(0, Math.ceil((new Date(cs.trial_ends_at) - Date.now()) / 86400000))
    : cs?.expires_at ? Math.max(0, Math.ceil((new Date(cs.expires_at) - Date.now()) / 86400000))
    : null
  );

  const handleUpgrade = async (planId) => {
    if (planId === cs?.plan_id && !isExpired) return toast('Это ваш текущий тариф');
    setUpgrading(planId);
    try {
      const { data } = await api.post('/subscriptions/upgrade', { plan_id: planId, billing_period: period });
      if (data.payment_required && data.payment) {
        setShowPaymentModal({ planId, payment: data.payment });
      } else if (data.ok) {
        await fetchMe();
        await loadData();
        toast.success(`Тариф "${planId}" активирован`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setUpgrading('');
    }
  };

  const handleCancel = async () => {
    if (!confirm('Отменить подписку? Она останется активной до конца оплаченного периода.')) return;
    try {
      await api.post('/subscriptions/cancel');
      await fetchMe();
      await loadData();
      toast.success('Подписка отменена');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    await fetchMe();
    setRefreshing(false);
    toast.success('Данные обновлены');
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-brand-500/20 border border-purple-500/20 flex items-center justify-center">
            <span className="text-lg">�</span>
          </div>
          <h1 className="text-xl font-extrabold text-white tracking-tight">Тариф</h1>
        </div>
        <button onClick={handleRefresh} className="btn-ghost flex items-center gap-1.5 text-xs" disabled={refreshing}>
          <RefreshCw className={clsx('w-3.5 h-3.5', refreshing && 'animate-spin')} />
          Обновить
        </button>
      </div>

      <PageGuide id="subscription-guide" emoji="💎" title="📖 Инструкция: Тариф" sections={[
        {
          icon: '🎯', heading: 'Для чего эта страница',
          text: 'Здесь вы видите текущий тариф, можете сменить его или оплатить подписку. Также здесь история платежей.',
        },
        {
          icon: '🎁', heading: 'Пробный период',
          text: 'При регистрации вы получаете 3 дня бесплатно с полным доступом к функциям Starter-тарифа.',
        },
        {
          icon: '💳', heading: 'Как оплатить',
          steps: [
            { title: 'Выберите тариф', desc: 'Starter, Pro или Enterprise — чем выше, тем больше аккаунтов и задач' },
            { title: 'Выберите период', desc: 'месячная или годовая оплата (скидка)' },
            { title: 'Оплатите', desc: 'банковской картой или через СБП' },
          ],
        },
        {
          icon: '📋', heading: 'Тарифы и лимиты',
          items: [
            { label: 'Starter', desc: 'базовые лимиты, идеален для старта' },
            { label: 'Pro', desc: 'больше аккаунтов, задач и Telegram-бот' },
            { label: 'Enterprise', desc: 'без лимитов, API-доступ, приоритетная поддержка' },
          ],
          tip: 'Подписка активируется мгновенно после оплаты. Отменить можно в любой момент.',
        },
      ]} />

      {/* ═══ Current plan card ═══ */}
      {cs && <CurrentPlanCard cs={cs} daysLeft={daysLeft} isTrialActive={isTrialActive} isActive={isActive} onCancel={handleCancel} />}

      {/* ═══ Payment info card ═══ */}
      {cs && <PaymentInfoCard cs={cs} daysLeft={daysLeft} isActive={isActive} isTrialActive={isTrialActive} />}

      {/* ═══ Payment history ═══ */}
      {transactions.length > 0 && (
        <div className="card">
          <button
            onClick={() => setShowHistory(v => !v)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-semibold text-white">История платежей</span>
              <span className="text-xs text-gray-500">({transactions.length})</span>
            </div>
            {showHistory ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {showHistory && (
            <div className="mt-4 space-y-2">
              {transactions.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ Billing toggle ═══ */}
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

      {/* ═══ Plans grid ═══ */}
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
              isCurrent={cs?.plan_id === plan.id}
              isExpired={isExpired}
              isActive={isActive}
              onUpgrade={handleUpgrade}
              upgrading={upgrading === plan.id}
            />
          ))}
        </div>
      )}

      {/* ═══ Payment Modal (SBP) ═══ */}
      {showPaymentModal && (
        <PaymentModal
          payment={showPaymentModal.payment}
          planId={showPaymentModal.planId}
          plans={plans}
          onClose={() => setShowPaymentModal(null)}
          onSuccess={async () => {
            setShowPaymentModal(null);
            await fetchMe();
            await loadData();
            toast.success('Подписка активирована!');
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Current Plan Card — статус, дни, дата
   ═══════════════════════════════════════════════════════════════════════════ */
function CurrentPlanCard({ cs, daysLeft, isTrialActive, isActive, onCancel }) {
  const s = STATUS_MAP[cs.status] || { label: cs.status, badge: 'badge-gray', icon: '❓' };

  const expiresDate = cs.expires_at
    ? new Date(cs.expires_at).toLocaleDateString('ru', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className={clsx('card', cs.status === 'expired' || cs.status === 'cancelled'
      ? 'bg-red-900/10 border-red-700/30'
      : isTrialActive ? 'bg-yellow-900/10 border-yellow-700/30'
      : 'bg-brand-600/10 border-brand-700/40'
    )}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-xs text-gray-500 mb-1">Текущий тариф</p>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-lg font-bold text-white">{cs.plan_name}</p>
            <span className={s.badge}>{s.label}</span>
          </div>

          {/* Оставшиеся дни */}
          {daysLeft !== null && (
            <div className="flex items-center gap-2 mt-3">
              <div className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold',
                daysLeft > 7 ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : daysLeft > 0 ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
              )}>
                <Clock className="w-4 h-4" />
                {daysLeft > 0 ? (
                  <span>Осталось {daysLeft} {pluralDays(daysLeft)}</span>
                ) : (
                  <span>Срок истёк</span>
                )}
              </div>
            </div>
          )}

          {/* Дата начала / окончания */}
          <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
            {cs.started_at && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>Начало: {new Date(cs.started_at).toLocaleDateString('ru')}</span>
              </div>
            )}
            {expiresDate && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>До: {expiresDate}</span>
              </div>
            )}
            {cs.billing_period && (
              <div className="flex items-center gap-1">
                <RefreshCw className="w-3 h-3" />
                <span>{cs.billing_period === 'yearly' ? 'Годовая' : 'Ежемесячная'}</span>
              </div>
            )}
          </div>

          {/* Trial */}
          {isTrialActive && (
            <div className="flex items-center gap-1.5 mt-2">
              <Clock className="w-3.5 h-3.5 text-yellow-400" />
              <p className="text-xs text-yellow-400">
                Пробный период — до {new Date(cs.trial_ends_at).toLocaleDateString('ru')}.
                После окончания — бесплатный тариф Free.
              </p>
            </div>
          )}

          {/* Expired */}
          {(cs.status === 'expired' || cs.status === 'cancelled') && (
            <div className="flex items-center gap-1.5 mt-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <p className="text-xs text-red-400">
                Подписка истекла. Выберите тариф и оплатите.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <LimitList limits={cs.limits} />
          {cs.plan_id !== 'free' && isActive && (
            <button onClick={onCancel} className="btn-ghost text-xs">Отменить</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Payment Info Card — цена, последний платёж
   ═══════════════════════════════════════════════════════════════════════════ */
function PaymentInfoCard({ cs, daysLeft, isActive, isTrialActive }) {
  const hasPrice = cs.price_rub > 0;
  const lastPayment = cs.last_payment;

  if (!hasPrice && !lastPayment) return null;

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Banknote className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-semibold text-white">Информация об оплате</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Стоимость подписки */}
        {hasPrice && (
          <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
            <p className="text-xs text-gray-500 mb-1">Стоимость</p>
            <p className="text-xl font-bold text-white">{cs.price_rub.toLocaleString('ru')} ₽</p>
            <p className="text-xs text-gray-500 mt-0.5">/ {cs.billing_period === 'yearly' ? 'год' : 'месяц'}</p>
          </div>
        )}

        {/* Последний платёж */}
        {lastPayment && (
          <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
            <p className="text-xs text-gray-500 mb-1">Последний платёж</p>
            <p className="text-xl font-bold text-green-400">
              {lastPayment.amount.toLocaleString('ru')} {lastPayment.currency === 'RUB' ? '₽' : lastPayment.currency}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {new Date(lastPayment.date).toLocaleDateString('ru', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>
        )}

        {/* Следующее продление */}
        {isActive && cs.expires_at && (
          <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
            <p className="text-xs text-gray-500 mb-1">Следующее продление</p>
            <p className="text-lg font-bold text-white">
              {new Date(cs.expires_at).toLocaleDateString('ru', { day: '2-digit', month: 'long' })}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              через {daysLeft} {pluralDays(daysLeft)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Transaction Row — строка платежа в истории
   ═══════════════════════════════════════════════════════════════════════════ */
function TransactionRow({ tx }) {
  const statusMap = {
    completed: { label: 'Оплачено', color: 'text-green-400' },
    pending:   { label: 'Ожидание', color: 'text-yellow-400' },
    failed:    { label: 'Ошибка',   color: 'text-red-400' },
    refunded:  { label: 'Возврат',  color: 'text-blue-400' },
  };
  const st = statusMap[tx.status] || { label: tx.status, color: 'text-gray-400' };
  const meta = typeof tx.metadata === 'string' ? JSON.parse(tx.metadata || '{}') : (tx.metadata || {});

  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-gray-800/30 border border-gray-700/30">
      <div className="flex items-center gap-3">
        <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center text-sm',
          tx.status === 'completed' ? 'bg-green-500/10' : 'bg-gray-700/50'
        )}>
          {tx.status === 'completed' ? '✅' : tx.status === 'pending' ? '⏳' : tx.status === 'refunded' ? '↩️' : '❌'}
        </div>
        <div>
          <p className="text-sm font-medium text-white">
            {meta.description || meta.plan_name || tx.plan_id || 'Платёж'}
          </p>
          <p className="text-xs text-gray-500">
            {new Date(tx.created_at).toLocaleDateString('ru', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className={clsx('text-sm font-semibold', st.color)}>
          {tx.status === 'completed' ? '+' : ''}{tx.amount.toLocaleString('ru')} {tx.currency === 'RUB' ? '₽' : tx.currency}
        </p>
        <p className={clsx('text-xs', st.color)}>{st.label}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Payment Modal (SBP)
   ═══════════════════════════════════════════════════════════════════════════ */
function PaymentModal({ payment, planId, plans, onClose, onSuccess }) {
  const plan = plans.find(p => p.id === planId);
  const [polling, setPolling] = useState(false);
  const [pollMsg, setPollMsg] = useState('');

  const isYookassa = payment?.provider === 'yookassa';
  const pollUrl = isYookassa
    ? `/payments/yookassa/${encodeURIComponent(payment?.paymentId)}/status`
    : `/payments/sbp/${encodeURIComponent(payment?.paymentId)}/status`;

  // Поллинг статуса платежа каждые 5 сек после открытия ссылки
  useEffect(() => {
    if (!polling || !payment?.paymentId) return;
    let active = true;
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(pollUrl);
        if (!active) return;
        if (data.status === 'succeeded' || data.paid) {
          clearInterval(interval);
          setPolling(false);
          onSuccess();
        } else if (data.status === 'canceled' || data.status === 'failed') {
          clearInterval(interval);
          setPolling(false);
          setPollMsg('Платёж отклонён. Попробуйте ещё раз.');
        }
      } catch { /* silent */ }
    }, 5000);
    return () => { active = false; clearInterval(interval); };
  }, [polling, payment?.paymentId, pollUrl, onSuccess]);

  const handlePay = () => {
    if (payment.confirmationUrl) {
      window.open(payment.confirmationUrl, '_blank');
    }
    setPolling(true);
    setPollMsg('');
    toast('Перейдите по ссылке для оплаты. Статус обновится автоматически.', { icon: '💳', duration: 5000 });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-brand-700/40 bg-gray-900 p-0 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-br from-brand-600/20 to-purple-900/20 p-6 text-center border-b border-gray-800">
          <div className="w-16 h-16 rounded-2xl bg-brand-600/20 border border-brand-600/30 flex items-center justify-center mx-auto mb-3">
            <CreditCard className="w-8 h-8 text-brand-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Оплата подписки</h2>
          <p className="text-gray-400 text-sm">Банковская карта, SberPay или СБП</p>
        </div>

        {/* Order details */}
        <div className="p-6 space-y-4">
          <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700/50">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-400">Тариф</span>
              <span className="text-sm font-semibold text-white">{plan?.name || planId}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-400">Период</span>
              <span className="text-sm text-white">{payment.description}</span>
            </div>
            <div className="border-t border-gray-700/50 my-2" />
            <div className="flex justify-between items-center">
              <span className="text-base font-semibold text-gray-300">Итого</span>
              <span className="text-2xl font-bold text-white">{payment.amount.toLocaleString('ru')} ₽</span>
            </div>
          </div>

          {/* SBP info */}
          <div className="bg-blue-900/10 rounded-xl p-4 border border-blue-700/20">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-blue-300 mb-1">Безопасная оплата</p>
                <p className="text-xs text-blue-400/70">
                  Оплата обрабатывается через защищённый платёжный шлюз.
                  Вы будете перенаправлены на страницу оплаты.
                </p>
              </div>
            </div>
          </div>

          {/* Payment status notice */}
          {pollMsg && (
            <div className="bg-red-900/10 rounded-xl p-3 border border-red-700/20">
              <p className="text-xs text-red-400 text-center">❌ {pollMsg}</p>
            </div>
          )}
          {polling && !pollMsg && (
            <div className="bg-blue-900/10 rounded-xl p-3 border border-blue-700/20">
              <p className="text-xs text-blue-400 text-center flex items-center justify-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Ожидаем подтверждение оплаты...
              </p>
            </div>
          )}
          {!polling && !pollMsg && (
            <div className="bg-green-900/10 rounded-xl p-3 border border-green-700/20">
              <p className="text-xs text-green-400/80 text-center">
                🔒 Платёж защищён SSL-шифрованием
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <button onClick={onClose} className="btn bg-gray-700 hover:bg-gray-600 text-white flex-1">
              Отмена
            </button>
            <button
              onClick={handlePay}
              disabled={polling}
              className={clsx(
                'btn text-white flex-1 flex items-center justify-center gap-2',
                polling ? 'bg-gray-600 cursor-wait' : 'bg-brand-600 hover:bg-brand-700'
              )}
            >
              {polling ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Ожидание...</>
              ) : (
                <><CreditCard className="w-4 h-4" /> Оплатить</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Plan Card
   ═══════════════════════════════════════════════════════════════════════════ */
function PlanCard({ plan, period, isCurrent, isExpired, isActive, onUpgrade, upgrading }) {
  const priceRub = period === 'yearly' ? plan.price_yearly_rub : plan.price_monthly_rub;
  const features = buildFeatures(plan);
  const colors = PLAN_COLORS[plan.id] || PLAN_COLORS.free;
  const IconComp = PLAN_ICONS[plan.id] || Zap;

  const showPaymentNeeded = !isCurrent || isExpired;

  let btnLabel = 'Оплатить';
  let btnDisabled = false;

  if (isCurrent && !isExpired) {
    btnLabel = plan.id === 'free' ? 'Текущий тариф' : 'Текущий тариф';
    btnDisabled = true;
  } else if (priceRub === 0) {
    btnLabel = isCurrent ? 'Текущий тариф' : 'Бесплатный';
    btnDisabled = isCurrent;
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
        {priceRub === 0 ? (
          <span className="text-3xl font-bold text-white">Бесплатно</span>
        ) : (
          <>
            <span className="text-3xl font-bold text-white">{priceRub.toLocaleString('ru')} ₽</span>
            <span className="text-gray-500 text-sm ml-1">/ {period === 'yearly' ? 'год' : 'мес'}</span>
          </>
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
        {upgrading ? (
          <span className="flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Подождите...</span>
        ) : (
          <>
            {showPaymentNeeded && priceRub > 0 && <CreditCard className="w-3.5 h-3.5" />}
            {btnLabel}
          </>
        )}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════════ */
function LimitList({ limits }) {
  if (!limits) return null;
  const items = [
    { label: 'Аккаунтов', value: limits.max_steam_accounts },
    { label: 'Задач',  value: limits.max_campaigns },
    { label: 'Заданий/день', value: limits.max_jobs_per_day },
    { label: 'Групп',     value: limits.max_steam_groups },
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

function pluralDays(n) {
  if (n === null || n === undefined) return 'дней';
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return 'дней';
  if (last > 1 && last < 5) return 'дня';
  if (last === 1) return 'день';
  return 'дней';
}

function buildFeatures(plan) {
  const f = [];
  // Free plan — only P2P trades
  if (plan.id === 'free') {
    f.push('P2P обмен предметами');
    f.push('Баланс и вывод средств');
    return f;
  }
  // Paid plans — all posting features + trades
  f.push('P2P обмен предметами');
  f.push(`${plan.max_steam_accounts === -1 ? 'Неограниченно' : plan.max_steam_accounts} Steam аккаунтов`);
  f.push(`${plan.max_campaigns === -1 ? 'Неограничено' : plan.max_campaigns} задач`);
  f.push(`${plan.max_jobs_per_day === -1 ? 'Неограниченно' : plan.max_jobs_per_day} постов в день`);
  if (plan.max_steam_groups > 0) f.push(`${plan.max_steam_groups} Steam-групп`);
  if (plan.max_telegram_bots > 0) f.push('Telegram бот');
  if (plan.has_mini_app)         f.push('Telegram Mini App');
  if (plan.has_ai_templates)     f.push('AI шаблоны');
  if (plan.has_analytics)        f.push('Аналитика');
  if (plan.has_api_access)       f.push('API доступ');
  if (plan.has_priority_support) f.push('Приоритетная поддержка');
  return f;
}
