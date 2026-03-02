import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight, Search, Plus, Loader2, Package, ExternalLink, RefreshCw,
  ChevronLeft, ChevronRight, ArrowRight,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const EXTERIOR_SHORT = {
  'Factory New': 'FN',
  'Minimal Wear': 'MW',
  'Field-Tested': 'FT',
  'Well-Worn': 'WW',
  'Battle-Scarred': 'BS',
};

const EXTERIOR_COLOR = {
  'Factory New': 'text-green-400 border-green-500/30',
  'Minimal Wear': 'text-lime-400 border-lime-500/30',
  'Field-Tested': 'text-yellow-400 border-yellow-500/30',
  'Well-Worn': 'text-orange-400 border-orange-500/30',
  'Battle-Scarred': 'text-red-400 border-red-500/30',
};

const WANTED_TAG_LABELS = {
  any_knife:  '🔪 Любой нож',
  any_gloves: '🧤 Любые перчатки',
  any_offers: '💬 Любые предложения',
};

export default function Trades() {
  const { user } = useAuth();
  const [items, setItems]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [pages, setPages]     = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [sort, setSort]       = useState('bumped');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, sort });
      if (search) params.set('search', search);
      const { data } = await api.get(`/trades?${params}`);
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, [page, search, sort]);

  useEffect(() => { load(); }, [load]);

  const bump = async (id) => {
    try {
      await api.post(`/trades/${id}/bump`);
      toast.success('Трейд поднят!');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-brand-400" /> P2P Обмен
          </h1>
          <p className="text-gray-500 text-sm mt-1">{total} активных предложений</p>
        </div>
        <Link to="/trades/create" className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Создать обмен
        </Link>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input className="input pl-10" placeholder="Поиск по предметам..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="input w-40 text-sm" value={sort}
          onChange={e => { setSort(e.target.value); setPage(1); }}>
          <option value="bumped">Недавние</option>
          <option value="newest">Новые</option>
          <option value="value_desc">Дорогие</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="card text-center py-16">
          <ArrowLeftRight className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">Нет активных предложений</p>
          <Link to="/trades/create" className="btn-primary text-sm mt-4 inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Создать первый обмен
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(trade => (
            <TradeCard key={trade.id} trade={trade} user={user} onBump={bump} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button className="btn-secondary !p-2" disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-400">{page} / {pages}</span>
          <button className="btn-secondary !p-2" disabled={page >= pages}
            onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════ Trade Card — cs.money style ═══════ */
function TradeCard({ trade, user, onBump }) {
  const isOwner = user?.id === trade.creator_id;
  const offering = trade.offering_items || [];
  const wanted   = trade.wanted_items || [];
  const tags     = trade.wanted_tags || [];

  return (
    <div className="card hover:border-gray-600/50 transition-all">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        {trade.steam_avatar ? (
          <img src={trade.steam_avatar} className="w-10 h-10 rounded-full ring-2 ring-gray-700" alt="" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white text-sm font-bold ring-2 ring-gray-600">
            {(trade.steam_username || trade.creator_name || '?')[0]}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white truncate">
            {trade.steam_username || trade.creator_name}
          </p>
          {trade.title && <p className="text-xs text-gray-400 truncate">{trade.title}</p>}
        </div>
        <div className="text-right flex items-center gap-2">
          {trade.bumped_at && (
            <span className="text-[11px] text-gray-600">⚡ {formatTimeAgo(trade.bumped_at)}</span>
          )}
        </div>
      </div>

      {/* Two-panel items display */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-3 items-start">
        {/* Offering items */}
        <div>
          <p className="text-xs text-green-400 font-semibold mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Предлагает
          </p>
          <div className="flex flex-wrap gap-1.5">
            {offering.map((item, i) => (
              <SkinCard key={i} item={item} />
            ))}
          </div>
        </div>

        {/* Arrow separator */}
        <div className="hidden md:flex items-center justify-center py-8">
          <div className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center">
            <ArrowRight className="w-4 h-4 text-brand-400" />
          </div>
        </div>
        <div className="md:hidden flex justify-center">
          <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center rotate-90">
            <ArrowRight className="w-3 h-3 text-brand-400" />
          </div>
        </div>

        {/* Wanted items + tags */}
        <div>
          <p className="text-xs text-purple-400 font-semibold mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> Хочет получить
          </p>
          <div className="flex flex-wrap gap-1.5">
            {wanted.map((item, i) => (
              <SkinCard key={`w-${i}`} item={item} variant="purple" />
            ))}
            {tags.map(tag => (
              <div key={tag} className="flex items-center gap-1 px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <span className="text-xs text-purple-300">{WANTED_TAG_LABELS[tag] || tag}</span>
              </div>
            ))}
            {!wanted.length && !tags.length && (
              <span className="text-xs text-gray-500 italic">Не указано</span>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {trade.description && (
        <p className="text-xs text-gray-500 mt-3 border-t border-gray-800 pt-3 line-clamp-2">
          {trade.description}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-800">
        {trade.creator_trade_url && !isOwner && (
          <a href={trade.creator_trade_url} target="_blank" rel="noopener"
            className="btn-primary text-sm flex items-center gap-1.5 flex-1 justify-center">
            <ExternalLink className="w-4 h-4" /> Отправить трейд
          </a>
        )}
        {isOwner && (
          <>
            <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => onBump(trade.id)}>
              <RefreshCw className="w-4 h-4" /> Поднять
            </button>
            <span className="text-xs text-gray-600 ml-auto">Ваш обмен</span>
          </>
        )}
        {!trade.creator_trade_url && !isOwner && (
          <span className="text-xs text-gray-500 italic">Trade URL не указан</span>
        )}
      </div>
    </div>
  );
}

/* ═══════ Skin Card — individual item display ═══════ */
function SkinCard({ item, variant = 'green' }) {
  const extShort = EXTERIOR_SHORT[item.exterior] || '';
  const extColorClass = EXTERIOR_COLOR[item.exterior] || '';
  const borderColor = variant === 'purple' ? 'border-purple-500/20 hover:border-purple-500/40' : 'border-gray-700/50 hover:border-gray-600';

  return (
    <div className={clsx(
      'relative bg-gray-800/60 rounded-lg border transition-all p-1.5 w-[72px] sm:w-20',
      borderColor
    )}>
      {item.image ? (
        <img src={item.image} alt={item.name}
          className="w-full h-12 sm:h-14 object-contain" />
      ) : (
        <div className="w-full h-12 sm:h-14 flex items-center justify-center">
          <Package className="w-4 h-4 text-gray-600" />
        </div>
      )}
      <p className="text-[9px] sm:text-[10px] text-gray-300 truncate mt-1 leading-tight">{item.name}</p>
      {extShort && (
        <span className={clsx('text-[8px] sm:text-[9px] font-bold', extColorClass.split(' ')[0])}>
          {extShort}
        </span>
      )}
      {item.sell_price_text && (
        <p className="text-[8px] sm:text-[9px] text-green-400">{item.sell_price_text}</p>
      )}
    </div>
  );
}

function formatTimeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  return `${Math.floor(diff / 86400)} дн`;
}
