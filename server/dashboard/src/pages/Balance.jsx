import { useState, useEffect } from 'react';
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, Loader2, History, CreditCard,
  AlertCircle, CheckCircle, Clock, XCircle, Link2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

function formatRub(kopecks) {
  return (kopecks / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2 }) + ' ₽';
}

const TX_TYPE_LABELS = {
  deposit:    { label: 'Пополнение',  icon: ArrowDownCircle, color: 'text-green-400' },
  withdrawal: { label: 'Вывод',       icon: ArrowUpCircle,   color: 'text-red-400' },
  purchase:   { label: 'Покупка',     icon: CreditCard,      color: 'text-red-400' },
  sale:       { label: 'Продажа',     icon: CreditCard,      color: 'text-green-400' },
  refund:     { label: 'Возврат',     icon: CheckCircle,     color: 'text-blue-400' },
};

const STATUS_BADGES = {
  completed: { label: 'Выполнено', cls: 'bg-green-900/30 text-green-400' },
  pending:   { label: 'Ожидание',  cls: 'bg-yellow-900/30 text-yellow-400' },
  rejected:  { label: 'Отклонено', cls: 'bg-red-900/30 text-red-400' },
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
    } catch {}
    finally { setLoading(false); }
  };

  const handleDeposit = async () => {
    const amt = parseFloat(depositAmount);
    if (!amt || amt < 100) return toast.error('Минимум 100₽');
    setDepositing(true);
    try {
      const { data } = await api.post('/balance/deposit', { amount: amt });
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

  return (
    <div className="space-y-6">
      {/* Balance header */}
      <div className="card bg-gradient-to-br from-brand-600/20 to-purple-600/10 border border-brand-500/20">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-brand-500/20 rounded-2xl flex items-center justify-center">
              <Wallet className="w-7 h-7 text-brand-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Баланс</p>
              <p className="text-3xl font-bold text-white">{formatRub(balance)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user?.steam_avatar && (
              <img src={user.steam_avatar} className="w-8 h-8 rounded-full" alt="" />
            )}
            <span className="text-sm text-gray-300">{user?.steam_username || user?.name}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800/50 rounded-lg p-1">
        {[
          { id: 'overview', label: 'Обзор' },
          { id: 'deposit',  label: 'Пополнить' },
          { id: 'withdraw', label: 'Вывести' },
          { id: 'profile',  label: 'Профиль' },
        ].map(t => (
          <button key={t.id}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition ${
              tab === t.id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-gray-400" /> История операций
          </h2>
          {txs.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">Нет операций</p>
          ) : (
            <div className="space-y-2">
              {txs.map(tx => {
                const meta = TX_TYPE_LABELS[tx.type] || TX_TYPE_LABELS.deposit;
                const Icon = meta.icon;
                return (
                  <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-gray-800 last:border-0">
                    <Icon className={`w-5 h-5 ${meta.color} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white">{tx.description || meta.label}</p>
                      <p className="text-xs text-gray-500">{new Date(tx.created_at).toLocaleString('ru-RU')}</p>
                    </div>
                    <span className={`text-sm font-medium ${tx.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {tx.amount >= 0 ? '+' : ''}{formatRub(tx.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'deposit' && (
        <div className="card space-y-4 max-w-md">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <ArrowDownCircle className="w-5 h-5 text-green-400" /> Пополнение
          </h2>
          <div>
            <label className="label">Сумма (₽)</label>
            <input className="input" type="number" min="100" step="100" placeholder="1000"
              value={depositAmount} onChange={e => setDepositAmount(e.target.value)} />
            <p className="text-xs text-gray-500 mt-1">Минимум: 100₽</p>
          </div>
          <div className="flex gap-2">
            {[500, 1000, 2500, 5000].map(a => (
              <button key={a}
                className="btn-secondary text-sm flex-1"
                onClick={() => setDepositAmount(String(a))}
              >
                {a}₽
              </button>
            ))}
          </div>

          {/* Commission breakdown */}
          {depositAmount && parseFloat(depositAmount) >= 100 && (() => {
            const amt = parseFloat(depositAmount);
            const acquiringPct = 2.5;
            const servicePct = 0.3;
            const acquiringFee = Math.round(amt * acquiringPct) / 100;
            const serviceFee = Math.round(amt * servicePct) / 100;
            const totalFee = acquiringFee + serviceFee;
            const credited = Math.max(0, amt - totalFee);
            return (
              <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700/50 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Сумма пополнения</span>
                  <span className="text-white font-medium">{amt.toLocaleString('ru-RU')} ₽</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Комиссия эквайринга ({acquiringPct}%)</span>
                  <span className="text-red-400">−{acquiringFee.toFixed(2)} ₽</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Комиссия сервиса ({servicePct}%)</span>
                  <span className="text-red-400">−{serviceFee.toFixed(2)} ₽</span>
                </div>
                <div className="border-t border-gray-700/50 my-1" />
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-gray-300">На баланс</span>
                  <span className="text-green-400">{credited.toFixed(2)} ₽</span>
                </div>
              </div>
            );
          })()}

          <div className="bg-yellow-900/10 rounded-xl p-3 border border-yellow-700/20">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-400/80">
                При пополнении удерживается комиссия платёжной системы (эквайринг ~2,5%)
                и сервисная комиссия 0,3% от суммы пополнения.
              </p>
            </div>
          </div>

          <button className="btn-primary w-full" onClick={handleDeposit} disabled={depositing}>
            {depositing ? 'Пополнение...' : 'Пополнить баланс'}
          </button>
        </div>
      )}

      {tab === 'withdraw' && (
        <div className="card space-y-4 max-w-md">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <ArrowUpCircle className="w-5 h-5 text-red-400" /> Вывод средств
          </h2>
          <div>
            <label className="label">Сумма (₽)</label>
            <input className="input" type="number" min="500" step="100" placeholder="1000"
              value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} />
            <p className="text-xs text-gray-500 mt-1">
              Минимум: 500₽ | Доступно: {formatRub(balance)}
            </p>
          </div>
          <div>
            <label className="label">Способ вывода</label>
            <div className="flex gap-2">
              <button className={`flex-1 py-2 rounded-lg text-sm ${withdrawMethod === 'card' ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400'}`}
                onClick={() => setWithdrawMethod('card')}>💳 Карта</button>
              <button className={`flex-1 py-2 rounded-lg text-sm ${withdrawMethod === 'sbp' ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400'}`}
                onClick={() => setWithdrawMethod('sbp')}>📱 СБП</button>
            </div>
          </div>
          <div>
            <label className="label">{withdrawMethod === 'card' ? 'Номер карты' : 'Номер телефона'}</label>
            <input className="input"
              placeholder={withdrawMethod === 'card' ? '0000 0000 0000 0000' : '+7 (___) ___-__-__'}
              value={withdrawCard} onChange={e => setWithdrawCard(e.target.value)} />
          </div>
          <button className="btn-primary w-full" onClick={handleWithdraw} disabled={withdrawing}>
            {withdrawing ? 'Отправка...' : 'Запросить вывод'}
          </button>

          {/* Withdrawal history */}
          {withdrawals.length > 0 && (
            <div className="mt-6 space-y-2">
              <h3 className="text-sm font-semibold text-gray-400">Заявки на вывод</h3>
              {withdrawals.map(w => {
                const st = STATUS_BADGES[w.status] || STATUS_BADGES.pending;
                return (
                  <div key={w.id} className="flex items-center justify-between py-2 border-b border-gray-800">
                    <div>
                      <p className="text-sm text-white">{formatRub(w.amount)}</p>
                      <p className="text-xs text-gray-500">{new Date(w.created_at).toLocaleString('ru-RU')}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'profile' && (
        <div className="card space-y-4 max-w-md">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Link2 className="w-5 h-5 text-gray-400" /> Профиль маркета
          </h2>

          {/* Steam link */}
          {user?.steam_id ? (
            <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
              {user.steam_avatar && <img src={user.steam_avatar} className="w-10 h-10 rounded-full" alt="" />}
              <div>
                <p className="text-sm font-medium text-white">{user.steam_username}</p>
                <p className="text-xs text-gray-500">Steam ID: {user.steam_id}</p>
              </div>
              <CheckCircle className="w-5 h-5 text-green-400 ml-auto" />
            </div>
          ) : (
            <div className="border border-yellow-600/30 bg-yellow-900/10 rounded-lg p-4">
              <p className="text-sm text-yellow-300 mb-1">Steam не привязан</p>
              <p className="text-xs text-gray-500">Вставьте Trade URL ниже — Steam привяжется автоматически</p>
            </div>
          )}

          {/* Trade URL */}
          <div>
            <label className="label">Steam Trade URL</label>
            <input className="input text-sm"
              placeholder="https://steamcommunity.com/tradeoffer/new/?partner=...&token=..."
              value={tradeUrl} onChange={e => setTradeUrl(e.target.value)} />
            <p className="text-xs text-gray-500 mt-1">
              <a href="https://steamcommunity.com/my/tradeoffers/privacy#trade_offer_access_url"
                target="_blank" rel="noopener" className="text-brand-400 hover:underline">
                Где найти Trade URL? →
              </a>
            </p>
            {!user?.steam_id && tradeUrl && (
              <p className="text-xs text-green-400/70 mt-1">✨ Steam аккаунт привяжется автоматически при сохранении</p>
            )}
            <button className="btn-primary text-sm mt-2" onClick={saveTradeUrl} disabled={savingUrl}>
              {savingUrl ? 'Сохранение...' : user?.steam_id ? 'Обновить Trade URL' : '🎮 Привязать Steam и сохранить'}
            </button>
          </div>


        </div>
      )}
    </div>
  );
}
