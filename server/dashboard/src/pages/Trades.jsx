import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight, Search, Plus, Loader2, Package, RefreshCw,
  ChevronLeft, ChevronRight, ArrowRight, Filter, X, SlidersHorizontal,
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

  // ── Фильтры ──
  const [showFilters, setShowFilters] = useState(false);
  const [hasKnife, setHasKnife]         = useState(false);
  const [hasGloves, setHasGloves]       = useState(false);
  const [wantedTag, setWantedTag]       = useState('');
  const [minValue, setMinValue]         = useState('');
  const [maxValue, setMaxValue]         = useState('');
  const [hasDescription, setHasDescription] = useState(false);

  const activeFilterCount = [hasKnife, hasGloves, wantedTag, minValue, maxValue, hasDescription]
    .filter(Boolean).length;

  const clearFilters = () => {
    setHasKnife(false); setHasGloves(false); setWantedTag('');
    setMinValue(''); setMaxValue(''); setHasDescription(false);
    setPage(1);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, sort });
      if (search) params.set('search', search);
      if (hasKnife) params.set('has_knife', '1');
      if (hasGloves) params.set('has_gloves', '1');
      if (wantedTag) params.set('wanted_tag', wantedTag);
      if (minValue) params.set('min_value', minValue);
      if (maxValue) params.set('max_value', maxValue);
      if (hasDescription) params.set('has_description', '1');
      const { data } = await api.get(`/trades?${params}`);
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, [page, search, sort, hasKnife, hasGloves, wantedTag, minValue, maxValue, hasDescription]);

  useEffect(() => { load(); }, [load]);

  const bump = async (id) => {
    try {
      await api.post(`/trades/${id}/bump`);
      toast.success('Трейд поднят! ⚡');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-3 tracking-tight">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-600/20">
              <ArrowLeftRight className="w-5 h-5 text-white" />
            </div>
            P2P Обмен
          </h1>
          <p className="text-gray-500 text-sm mt-1.5 ml-[52px]">
            <span className="text-white font-semibold">{total}</span> активных предложений
          </p>
        </div>
        <Link to="/trades/create" className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Создать обмен
        </Link>
      </div>

      {/* Search & Sort */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input className="input pl-10" placeholder="🔍 Поиск по скинам..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <button
          onClick={() => setShowFilters(v => !v)}
          className={clsx(
            'relative flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all border',
            showFilters || activeFilterCount > 0
              ? 'bg-brand-600/15 text-brand-300 border-brand-500/30'
              : 'bg-gray-800/60 text-gray-400 border-gray-700/50 hover:border-gray-600/60'
          )}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="hidden sm:inline">Фильтры</span>
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-brand-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
        <select className="input w-40 text-sm" value={sort}
          onChange={e => { setSort(e.target.value); setPage(1); }}>
          <option value="bumped">⚡ Недавние</option>
          <option value="newest">🆕 Новые</option>
          <option value="value_desc">💎 Дорогие</option>
        </select>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="card-glass p-4 animate-slide-up space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Filter className="w-4 h-4 text-brand-400" /> Фильтры
            </h3>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-red-400 transition-colors flex items-center gap-1">
                <X className="w-3 h-3" /> Сбросить всё
              </button>
            )}
          </div>

          {/* Category chips */}
          <div>
            <p className="text-xs text-gray-500 mb-2">Категория предметов</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setHasKnife(v => !v); setPage(1); }}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                  hasKnife
                    ? 'bg-red-500/15 text-red-300 border-red-500/30'
                    : 'bg-gray-800/40 text-gray-400 border-gray-700/40 hover:border-gray-600/60'
                )}
              >
                🔪 Ножи
              </button>
              <button
                onClick={() => { setHasGloves(v => !v); setPage(1); }}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                  hasGloves
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : 'bg-gray-800/40 text-gray-400 border-gray-700/40 hover:border-gray-600/60'
                )}
              >
                🧤 Перчатки
              </button>
            </div>
          </div>

          {/* Wanted tags */}
          <div>
            <p className="text-xs text-gray-500 mb-2">Что хочет получить</p>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'any_knife',  label: '🔪 Любой нож',     activeClass: 'bg-red-500/15 text-red-300 border-red-500/30' },
                { value: 'any_gloves', label: '🧤 Любые перчатки', activeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
                { value: 'any_offers', label: '💬 Любые предложения', activeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
              ].map(tag => (
                <button
                  key={tag.value}
                  onClick={() => { setWantedTag(v => v === tag.value ? '' : tag.value); setPage(1); }}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                    wantedTag === tag.value
                      ? tag.activeClass
                      : 'bg-gray-800/40 text-gray-400 border-gray-700/40 hover:border-gray-600/60'
                  )}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </div>

          {/* Price range + has_description */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[120px]">
              <p className="text-xs text-gray-500 mb-1.5">Стоимость от, ₽</p>
              <input type="number" className="input text-sm" placeholder="0"
                value={minValue} onChange={e => { setMinValue(e.target.value); setPage(1); }} />
            </div>
            <div className="flex-1 min-w-[120px]">
              <p className="text-xs text-gray-500 mb-1.5">Стоимость до, ₽</p>
              <input type="number" className="input text-sm" placeholder="∞"
                value={maxValue} onChange={e => { setMaxValue(e.target.value); setPage(1); }} />
            </div>
            <label className="flex items-center gap-2 pb-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={hasDescription}
                onChange={e => { setHasDescription(e.target.checked); setPage(1); }}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-brand-500 focus:ring-brand-500 focus:ring-offset-0" />
              <span className="text-xs text-gray-400">С описанием</span>
            </label>
          </div>

          {/* Active filters summary */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-800/40">
              {hasKnife && (
                <span className="inline-flex items-center gap-1 bg-red-500/10 text-red-400 text-[11px] px-2 py-0.5 rounded-full ring-1 ring-red-500/20">
                  🔪 Ножи <button onClick={() => { setHasKnife(false); setPage(1); }}><X className="w-3 h-3" /></button>
                </span>
              )}
              {hasGloves && (
                <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 text-[11px] px-2 py-0.5 rounded-full ring-1 ring-amber-500/20">
                  🧤 Перчатки <button onClick={() => { setHasGloves(false); setPage(1); }}><X className="w-3 h-3" /></button>
                </span>
              )}
              {wantedTag && (
                <span className="inline-flex items-center gap-1 bg-purple-500/10 text-purple-400 text-[11px] px-2 py-0.5 rounded-full ring-1 ring-purple-500/20">
                  {WANTED_TAG_LABELS[wantedTag] || wantedTag} <button onClick={() => { setWantedTag(''); setPage(1); }}><X className="w-3 h-3" /></button>
                </span>
              )}
              {minValue && (
                <span className="inline-flex items-center gap-1 bg-green-500/10 text-green-400 text-[11px] px-2 py-0.5 rounded-full ring-1 ring-green-500/20">
                  от {minValue} ₽ <button onClick={() => { setMinValue(''); setPage(1); }}><X className="w-3 h-3" /></button>
                </span>
              )}
              {maxValue && (
                <span className="inline-flex items-center gap-1 bg-green-500/10 text-green-400 text-[11px] px-2 py-0.5 rounded-full ring-1 ring-green-500/20">
                  до {maxValue} ₽ <button onClick={() => { setMaxValue(''); setPage(1); }}><X className="w-3 h-3" /></button>
                </span>
              )}
              {hasDescription && (
                <span className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-400 text-[11px] px-2 py-0.5 rounded-full ring-1 ring-blue-500/20">
                  💬 С описанием <button onClick={() => { setHasDescription(false); setPage(1); }}><X className="w-3 h-3" /></button>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          <p className="text-sm text-gray-500">Загрузка обменов...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card text-center py-16 animate-scale-in">
          <div className="text-5xl mb-4">🔄</div>
          <p className="text-lg font-semibold text-white mb-1">Нет активных предложений</p>
          <p className="text-sm text-gray-500">Станьте первым — создайте обмен!</p>
          <Link to="/trades/create" className="btn-primary text-sm mt-5 inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Создать первый обмен
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((trade, i) => (
            <TradeCard key={trade.id} trade={trade} user={user} onBump={bump} idx={i} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button className="btn-secondary !p-2.5 !rounded-xl" disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-400 font-medium tabular-nums">{page} / {pages}</span>
          <button className="btn-secondary !p-2.5 !rounded-xl" disabled={page >= pages}
            onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════ Trade Card ═══════ */
function TradeCard({ trade, user, onBump, idx }) {
  const isOwner = user?.id === trade.creator_id;
  const offering = trade.offering_items || [];
  const wanted   = trade.wanted_items || [];
  const tags     = trade.wanted_tags || [];

  return (
    <div className="card-hover animate-slide-up" style={{ animationDelay: `${idx * 50}ms` }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        {trade.steam_avatar ? (
          <img src={trade.steam_avatar} className="w-11 h-11 rounded-xl ring-2 ring-gray-700/50 shadow-md" alt="" />
        ) : (
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 flex items-center justify-center text-white text-sm font-bold ring-2 ring-gray-700/30">
            {(trade.steam_username || trade.creator_name || '?')[0]}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white truncate">
            {trade.steam_username || trade.creator_name}
          </p>
          {trade.title && <p className="text-xs text-gray-500 truncate">{trade.title}</p>}
        </div>
        {trade.bumped_at && (
          <span className="text-[11px] text-gray-600 bg-gray-800/40 px-2 py-1 rounded-lg">
            ⚡ {formatTimeAgo(trade.bumped_at)}
          </span>
        )}
      </div>

      {/* Two-panel items */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-3 items-start">
        {/* Offering */}
        <div>
          <p className="text-xs font-bold mb-2.5 flex items-center gap-1.5 text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> Предлагает
          </p>
          <div className="flex flex-wrap gap-1.5">
            {offering.map((item, i) => (
              <SkinCard key={i} item={item} />
            ))}
          </div>
        </div>

        {/* Arrow */}
        <div className="hidden md:flex items-center justify-center py-8">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brand-500/10 to-purple-500/10 border border-brand-500/20 flex items-center justify-center">
            <ArrowRight className="w-4 h-4 text-brand-400" />
          </div>
        </div>
        <div className="md:hidden flex justify-center">
          <div className="w-8 h-8 rounded-full bg-gray-800/60 border border-gray-700/40 flex items-center justify-center rotate-90">
            <ArrowRight className="w-3 h-3 text-brand-400" />
          </div>
        </div>

        {/* Wanted */}
        <div>
          <p className="text-xs font-bold mb-2.5 flex items-center gap-1.5 text-purple-400">
            <span className="w-2 h-2 rounded-full bg-purple-400" /> Хочет получить
          </p>
          <div className="flex flex-wrap gap-1.5">
            {wanted.map((item, i) => (
              <SkinCard key={`w-${i}`} item={item} variant="purple" />
            ))}
            {tags.map(tag => (
              <div key={tag} className="flex items-center gap-1 px-3 py-2 bg-purple-500/5 border border-purple-500/15 rounded-xl">
                <span className="text-xs text-purple-300 font-medium">{WANTED_TAG_LABELS[tag] || tag}</span>
              </div>
            ))}
            {!wanted.length && !tags.length && (
              <span className="text-xs text-gray-600 italic">Не указано</span>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {trade.description && (
        <p className="text-xs text-gray-500 mt-4 border-t border-gray-800/40 pt-3 line-clamp-2">
          💬 {trade.description}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-800/40">
        {!isOwner && (
          <Link to={`/trades/${trade.id}`}
            className="btn-primary text-sm flex-1 justify-center flex items-center gap-1.5">
            <ArrowRight className="w-4 h-4" /> Перейти к обмену
          </Link>
        )}
        {isOwner && (
          <>
            <Link to={`/trades/${trade.id}`}
              className="btn-secondary text-sm flex items-center gap-1.5">
              <Package className="w-4 h-4" /> Предложения
            </Link>
            <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => onBump(trade.id)}>
              <RefreshCw className="w-4 h-4" /> ⚡ Поднять
            </button>
            <span className="badge-blue ml-auto">Ваш обмен</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════ Skin Card ═══════ */
function SkinCard({ item, variant = 'green' }) {
  const extShort = EXTERIOR_SHORT[item.exterior] || '';
  const extColorClass = EXTERIOR_COLOR[item.exterior] || '';
  const borderColor = variant === 'purple'
    ? 'border-purple-500/15 hover:border-purple-500/30'
    : 'border-gray-700/40 hover:border-gray-600/60';

  return (
    <div className={clsx(
      'relative bg-gray-800/40 rounded-xl border transition-all duration-200 p-2 w-[76px] sm:w-[84px] group',
      borderColor
    )}>
      {item.image ? (
        <img src={item.image} alt={item.name}
          className="w-full h-12 sm:h-14 object-contain group-hover:scale-105 transition-transform duration-200" />
      ) : (
        <div className="w-full h-12 sm:h-14 flex items-center justify-center">
          <Package className="w-4 h-4 text-gray-600" />
        </div>
      )}
      <p className="text-[9px] sm:text-[10px] text-gray-300 truncate mt-1.5 leading-tight font-medium">{item.name}</p>
      {extShort && (
        <span className={clsx('text-[8px] sm:text-[9px] font-bold', extColorClass.split(' ')[0])}>
          {extShort}
        </span>
      )}
      {item.sell_price_text && (
        <p className="text-[8px] sm:text-[9px] text-green-400 font-medium">{item.sell_price_text}</p>
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
