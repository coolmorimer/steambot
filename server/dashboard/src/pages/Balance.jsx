import { useState, useEffect } from 'react';
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, Loader2, History, CreditCard,
  AlertCircle, CheckCircle, Clock, XCircle, Link2, Sparkles,
  Shield, ExternalLink, ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

function formatRub(kopecks) {
  return (kopecks / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2 }) + ' ₽';
}

const TX_TYPE_LABELS = {
  deposit:    { label: 'Пополнение',  icon: ArrowDownCircle, color: 'text-green-400', emoji: '💰' },
  withdrawal: { label: 'Вывод',       icon: ArrowUpCircle,   color: 'text-red-400', emoji: '💸' },
  purchase:   { label: 'Покупка',     icon: CreditCard,      color: 'text-red-400', emoji: '🛒' },
  sale:       { label: 'Продажа',     icon: CreditCard,      color: 'text-green-400', emoji: '✅' },
  refund:     { label: 'Возврат',     icon: CheckCircle,     color: 'text-blue-400', emoji: '↩️' },
};

const STATUS_BADGES = {
  completed: { label: 'Выполнено', cls: 'badge-green' },
  pending:   { label: 'Ожидание',  cls: 'badge-yellow' },
  rejected:  { label: 'Отклонено', cls: 'badge-red' },
};

export default function Balance() {
  const { user, fetchMe } = useAuth();
  const [balance, setBalance]     = useState(0);
  const [txs, setTxs]             = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading]     = useState(true);

  const [depositAmount, setDepositAmount]   = useState('');
  const [depositing, setDepositing]         = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('card');
  const [withdrawCard, setWithdrawCard]     = useState('');
  const [withdrawing, setWithdrawing]       = useState(false);

  const [tab, setTab] = useState('overview');

  // Trade URL
  const [tradeUrl, setTradeUrl]   = useState(user?.trade_url || '');
  const [savingUrl, setSavingUrl] = useState(false);

  useEffect(() => { load(); }, []);
  useEffect(() => { setTradeUrl(user?.trade_url || ''); }, [user?.trade_url]);

  const load = async () => {
    setLoading(true);
    try {
      const [balRes, wdRes] = await Promise.all([
        api.get('/balance'),
        api.get('/balance/withdrawals'),
      ]);
      setBalance(balRes.data.balance);
      setTxs(balRes.data.transactions);
      setWithdrawals(wdRes.data);
    } catch (err) {
      toast.error('Ошибка загрузки баланса');
    } finally { setLoading(false); }
  };

  const handleDeposit = async () => {
    const amt = parseFloat(depositAmount);
    if (!amt || amt < 100) return toast.error('Минимум 100₽');
    setDepositing(true);
    try {
      const { data } = await api.post('/balance/deposit', { amount: amt });
      if (data.paymentUrl) {
        // ЮKassa: перенаправляем на страницу оплаты
        toast.success('Перенаправляем на страницу оплаты...');
        window.location.href = data.paymentUrl;
        return;
      }
      toast.success(`Баланс пополнен на ${amt}₽`);
      setBalance(data.balance);
      setDepositAmount('');
      load();
      fetchMe();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setDepositing(false); }
  };

  const handleWithdraw = async () => {
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt < 500) return toast.error('Минимум 500₽');
    if (!withdrawCard && withdrawMethod === 'card') return toast.error('Укажите номер карты');
    setWithdrawing(true);
    try {
      const { data } = await api.post('/balance/withdraw', {
        amount: amt,
        method: withdrawMethod,
        details: withdrawMethod === 'card' ? { card: withdrawCard } : { phone: withdrawCard },
      });
      toast.success('Заявка на вывод создана');
      setBalance(data.balance);
      setWithdrawAmount('');
      setWithdrawCard('');
      load();
      fetchMe();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setWithdrawing(false); }
  };

  const saveTradeUrl = async () => {
    if (!tradeUrl.trim()) return toast.error('Вставьте Trade URL');
    setSavingUrl(true);
    try {
      const { data } = await api.put('/balance/trade-url', { trade_url: tradeUrl });
      toast.success('Trade URL сохранён, Steam привязан!');
      fetchMe();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setSavingUrl(false); }
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
    </div>
  );

  const tabs = [
    { id: 'overview', label: '📊 Обзор',   icon: History },
    { id: 'deposit',  label: '💰 Пополнить', icon: ArrowDownCircle },
    { id: 'withdraw', label: '💸 Вывести',  icon: ArrowUpCircle },
    { id: 'profile',  label: '🎮 Профиль',  icon: Link2 },
  ];

  return (
    <div className="space-y-6 animate-slide-up">
      {/* ── Balance hero ── */}
      <div className="relative overflow-hidden rounded-2xl border border-brand-500/20 p-6 sm:p-8">
        {/* BG gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600/15 via-purple-600/10 to-transparent" />
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-brand-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl" />

        <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-gradient-to-br from-brand-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-600/30">
              <Wallet className="w-8 h-8 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-400 font-medium">Ваш баланс</p>
              <p className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">{formatRub(balance)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user?.steam_avatar && (
              <img src={user.steam_avatar} className="w-10 h-10 rounded-xl ring-2 ring-gray-700/50" alt="" />
            )}
            <div className="text-right">
              <span className="text-sm text-gray-300 font-medium block">{user?.steam_username || user?.name}</span>
              {user?.steam_id && (
                <span className="text-xs text-gray-600">ID: {user.steam_id}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="tab-bar">
        {tabs.map(t => (
          <button key={t.id}
            className={tab === t.id ? 'tab-active' : 'tab-inactive'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ Tab: Overview ══ */}
      {tab === 'overview' && (
        <div className="card space-y-4 animate-scale-in">
          <h2 className="section-title">
            <History className="w-5 h-5 text-gray-400" /> История операций
          </h2>
          {txs.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-4xl mb-3">📭</div>
              <p className="text-gray-400 font-medium">Нет операций</p>
              <p className="text-xs text-gray-600 mt-1">Пополните баланс, чтобы начать</p>
              <button onClick={() => setTab('deposit')} className="btn-primary text-sm mt-4">
                💰 Пополнить баланс
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {txs.map(tx => {
                const meta = TX_TYPE_LABELS[tx.type] || TX_TYPE_LABELS.deposit;
                const Icon = meta.icon;
                return (
                  <div key={tx.id} className="flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-gray-800/40 transition-all border-b border-gray-800/30 last:border-0">
                    <div className={`w-9 h-9 rounded-xl ${tx.amount >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-4 h-4 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium">{meta.emoji} {tx.description || meta.label}</p>
                      <p className="text-xs text-gray-600">{new Date(tx.created_at).toLocaleString('ru-RU')}</p>
                    </div>
                    <span className={`text-sm font-bold tabular-nums ${tx.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {tx.amount >= 0 ? '+' : ''}{formatRub(tx.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ Tab: Deposit ══ */}
      {tab === 'deposit' && (
        <div className="card space-y-5 max-w-lg mx-auto animate-scale-in">
          <h2 className="section-title">
            <ArrowDownCircle className="w-5 h-5 text-green-400" /> Пополнение баланса
          </h2>

          <div>
            <label className="label">💰 Сумма (₽)</label>
            <input className="input text-lg font-bold" type="number" min="100" step="100"
              placeholder="1000"
              value={depositAmount} onChange={e => setDepositAmount(e.target.value)} />
            <p className="text-xs text-gray-600 mt-1.5">Минимум: 100 ₽</p>
          </div>

          {/* Quick amounts */}
          <div className="grid grid-cols-4 gap-2">
            {[500, 1000, 2500, 5000].map(a => (
              <button key={a}
                className={`rounded-xl py-2.5 text-sm font-bold transition-all border ${
                  depositAmount === String(a)
                    ? 'bg-brand-500/15 border-brand-500/30 text-brand-400'
                    : 'bg-gray-800/50 border-gray-700/40 text-gray-400 hover:border-gray-600 hover:text-white'
                }`}
                onClick={() => setDepositAmount(String(a))}
              >
                {a} ₽
              </button>
            ))}
          </div>

          {/* Commission */}
          {depositAmount && parseFloat(depositAmount) >= 100 && (() => {
            const amt = parseFloat(depositAmount);
            const fee = Math.ceil(amt * 100 * 0.01) / 100; // 1%
            const credited = Math.max(0, amt - fee);
            return (
              <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/30 space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Сумма</span>
                  <span className="text-white font-semibold">{amt.toLocaleString('ru-RU')} ₽</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Комиссия сервиса (1%)</span>
                  <span className="text-red-400/80">−{fee.toFixed(2)} ₽</span>
                </div>
                <div className="border-t border-gray-700/30 my-1" />
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-gray-300">✅ На баланс</span>
                  <span className="text-green-400 text-base">{credited.toFixed(2)} ₽</span>
                </div>
              </div>
            );
          })()}

          <button className="btn-success w-full text-base py-3" onClick={handleDeposit} disabled={depositing}>
            {depositing ? <Loader2 className="w-5 h-5 animate-spin" /> : '💰 Пополнить баланс'}
          </button>
        </div>
      )}

      {/* ══ Tab: Withdraw ══ */}
      {tab === 'withdraw' && (
        <div className="card space-y-5 max-w-lg mx-auto animate-scale-in">
          <h2 className="section-title">
            <ArrowUpCircle className="w-5 h-5 text-red-400" /> Вывод средств
          </h2>

          <div>
            <label className="label">💸 Сумма (₽)</label>
            <input className="input text-lg font-bold" type="number" min="500" step="100"
              placeholder="1000"
              value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} />
            <p className="text-xs text-gray-600 mt-1.5">
              Минимум: 500 ₽ · Доступно: <span className="text-white font-semibold">{formatRub(balance)}</span>
            </p>
          </div>

          <div>
            <label className="label">Способ вывода</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'card', label: '💳 Карта', desc: 'Visa / MasterCard' },
                { id: 'sbp',  label: '📱 СБП',  desc: 'По номеру телефона' },
              ].map(m => (
                <button key={m.id}
                  className={`rounded-xl p-3 text-left transition-all border ${
                    withdrawMethod === m.id
                      ? 'bg-brand-500/10 border-brand-500/30'
                      : 'bg-gray-800/40 border-gray-700/40 hover:border-gray-600'
                  }`}
                  onClick={() => setWithdrawMethod(m.id)}
                >
                  <p className={`text-sm font-semibold ${withdrawMethod === m.id ? 'text-brand-400' : 'text-gray-300'}`}>{m.label}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">{withdrawMethod === 'card' ? '💳 Номер карты' : '📱 Номер телефона'}</label>
            <input className="input"
              placeholder={withdrawMethod === 'card' ? '0000 0000 0000 0000' : '+7 (___) ___-__-__'}
              value={withdrawCard} onChange={e => setWithdrawCard(e.target.value)} />
          </div>

          <button className="btn-primary w-full text-base py-3" onClick={handleWithdraw} disabled={withdrawing}>
            {withdrawing ? <Loader2 className="w-5 h-5 animate-spin" /> : '💸 Запросить вывод'}
          </button>

          {/* Withdrawal history */}
          {withdrawals.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-gray-800/40 pt-4">
              <h3 className="text-sm font-bold text-gray-400">📋 Заявки на вывод</h3>
              {withdrawals.map(w => {
                const st = STATUS_BADGES[w.status] || STATUS_BADGES.pending;
                return (
                  <div key={w.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-800/30 transition-all">
                    <div>
                      <p className="text-sm text-white font-medium">{formatRub(w.amount)}</p>
                      <p className="text-xs text-gray-600">{new Date(w.created_at).toLocaleString('ru-RU')}</p>
                    </div>
                    <span className={st.cls}>{st.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ Tab: Profile ══ */}
      {tab === 'profile' && (
        <div className="card space-y-5 max-w-lg mx-auto animate-scale-in">
          <h2 className="section-title">
            <Shield className="w-5 h-5 text-brand-400" /> Профиль и Steam
          </h2>

          {/* Steam linked */}
          {user?.steam_id ? (
            <div className="relative overflow-hidden rounded-xl border border-green-500/20 bg-green-500/5 p-4">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-green-500/5 rounded-full blur-2xl" />
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

          {/* Trade URL */}
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
        </div>
      )}
    </div>
  );
}
