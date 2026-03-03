import { useEffect, useState, useCallback } from 'react';
import { Copy, Gift, Users, Clock, Trophy, ExternalLink, CheckCircle2 } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';
import clsx from 'clsx';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} д назад`;
}

export default function Referrals() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/referrals/my')
      .then(r => setData(r.data))
      .catch(() => toast.error('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const copyLink = () => {
    if (!data?.link) return;
    navigator.clipboard.writeText(data.link);
    setCopied(true);
    toast.success('Ссылка скопирована!');
    setTimeout(() => setCopied(false), 2000);
  };

  const copyCode = () => {
    if (!data?.code) return;
    navigator.clipboard.writeText(data.code);
    toast.success('Код скопирован!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const stats = data?.stats || {};
  const partner = data?.partner;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          🎁 Реферальная программа
        </h1>
        <p className="text-gray-400 mt-1">
          Приглашайте друзей и получайте бонусы к подписке
        </p>
      </div>

      {/* Reward info */}
      <div className="card-glass p-5 border-purple-500/20">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-600/15 flex items-center justify-center shrink-0">
            <Gift className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">+7 дней за каждого друга</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              За каждого друга, <span className="text-purple-300 font-semibold">оплатившего подписку</span> после регистрации по вашей ссылке, 
              вы получаете <span className="text-purple-300 font-semibold">+7 дней</span> к вашей подписке.
              А ваш друг получает <span className="text-green-300 font-semibold">+3 бонусных дня</span> в подарок!
              Количество приглашений не ограничено!
            </p>
          </div>
        </div>
      </div>

      {/* Referral link & code */}
      <div className="card-glass p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          🔗 Ваша реферальная ссылка
        </h3>
        <div className="flex gap-2">
          <div className="flex-1 bg-gray-800/60 rounded-xl px-4 py-2.5 text-sm text-gray-300 truncate border border-gray-700/50">
            {data?.link || '...'}
          </div>
          <button
            onClick={copyLink}
            className={clsx(
              'px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 shrink-0',
              copied
                ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                : 'bg-brand-600/20 text-brand-300 hover:bg-brand-600/30 border border-brand-500/30'
            )}
          >
            {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Скопировано' : 'Копировать'}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs text-gray-500">Реферальный код:</span>
          <button
            onClick={copyCode}
            className="inline-flex items-center gap-1.5 bg-gray-800/60 px-3 py-1 rounded-lg text-sm font-mono font-bold text-brand-300 hover:bg-gray-800/80 transition-colors border border-gray-700/50"
          >
            {data?.code || '...'}
            <Copy className="w-3 h-3 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-glass p-4 text-center">
          <div className="w-10 h-10 rounded-xl bg-blue-600/15 flex items-center justify-center mx-auto mb-2">
            <Users className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white">{stats.total || 0}</p>
          <p className="text-xs text-gray-500">Приглашено друзей</p>
        </div>
        <div className="card-glass p-4 text-center">
          <div className="w-10 h-10 rounded-xl bg-green-600/15 flex items-center justify-center mx-auto mb-2">
            <Clock className="w-5 h-5 text-green-400" />
          </div>
          <p className="text-2xl font-bold text-white">{stats.totalDays || 0}</p>
          <p className="text-xs text-gray-500">Дней получено</p>
        </div>
        <div className="card-glass p-4 text-center">
          <div className="w-10 h-10 rounded-xl bg-purple-600/15 flex items-center justify-center mx-auto mb-2">
            <Trophy className="w-5 h-5 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-white">{stats.rewarded || 0}</p>
          <p className="text-xs text-gray-500">Бонусов выдано</p>
        </div>
      </div>

      {/* Partner section */}
      {partner && (
        <div className="card-glass p-5 border-amber-500/20">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            ⭐ Партнёрская программа
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-800/40 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Комиссия</p>
              <p className="text-xl font-bold text-amber-400">{partner.commissionPercent}%</p>
            </div>
            <div className="bg-gray-800/40 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Рефералов</p>
              <p className="text-xl font-bold text-white">{partner.totalReferrals}</p>
            </div>
            <div className="bg-gray-800/40 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Заработано</p>
              <p className="text-xl font-bold text-green-400">{(partner.totalEarnings / 100).toFixed(0)} ₽</p>
            </div>
            <div className="bg-gray-800/40 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Статус</p>
              <span className={clsx(
                'text-xs font-bold px-2 py-0.5 rounded-full',
                partner.isActive ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
              )}>
                {partner.isActive ? 'Активна' : 'Неактивна'}
              </span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <span>Партнёрский код:</span>
            <span className="font-mono font-bold text-amber-300">{partner.code}</span>
          </div>
        </div>
      )}

      {/* Referrals list */}
      {stats.referrals?.length > 0 && (
        <div className="card-glass p-5">
          <h3 className="text-sm font-semibold text-white mb-3">📋 Приглашённые пользователи</h3>
          <div className="space-y-2">
            {stats.referrals.map(ref => (
              <div key={ref.id} className="flex items-center gap-3 bg-gray-800/40 rounded-lg px-3 py-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-600/15 flex items-center justify-center text-brand-400 text-xs font-bold shrink-0">
                  {(ref.name || ref.email || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{ref.steam_username || ref.name || ref.email?.split('@')[0] || 'Пользователь'}</p>
                  <p className="text-[10px] text-gray-500">{timeAgo(ref.created_at)}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  {ref.reward_given ? (
                    <>
                      {ref.reward_type === 'trial_days' && (
                        <span className="bg-green-500/15 text-green-400 px-2 py-0.5 rounded-full font-medium">
                          +{ref.reward_amount} дн.
                        </span>
                      )}
                      {ref.reward_type === 'commission' && (
                        <span className="bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full font-medium">
                          Комиссия
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="bg-gray-500/15 text-gray-400 px-2 py-0.5 rounded-full font-medium">
                      Ожидает оплаты
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!stats.referrals?.length && (
        <div className="card-glass p-8 text-center">
          <Users className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 mb-1">Пока никого не пригласили</p>
          <p className="text-sm text-gray-600">Поделитесь ссылкой с друзьями и получите бонус!</p>
        </div>
      )}
    </div>
  );
}
