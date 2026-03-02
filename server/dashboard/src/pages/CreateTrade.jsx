import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowLeftRight, Plus, Loader2, Search, Package, Check, X,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
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
  'Factory New': 'text-green-400',
  'Minimal Wear': 'text-lime-400',
  'Field-Tested': 'text-yellow-400',
  'Well-Worn': 'text-orange-400',
  'Battle-Scarred': 'text-red-400',
};

const CATEGORIES = [
  { id: '', label: 'Все' },
  { id: 'knife', label: '🔪 Ножи' },
  { id: 'gloves', label: '🧤 Перчатки' },
  { id: 'rifle', label: '🔫 Винтовки' },
  { id: 'pistol', label: '🔫 Пистолеты' },
  { id: 'smg', label: '🔫 ПП' },
  { id: 'sniper', label: '🎯 Снайперские' },
  { id: 'shotgun', label: '🔫 Дробовики' },
];

const TAGS = [
  { id: 'any_knife',  label: '🔪 Любой нож' },
  { id: 'any_gloves', label: '🧤 Любые перчатки' },
  { id: 'any_offers', label: '💬 Любые предложения' },
];

export default function CreateTrade() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [offeringItems, setOfferingItems] = useState([]);
  const [wantedItems, setWantedItems] = useState([]);
  const [wantedTags, setWantedTags]   = useState([]);
  const [submitting, setSubmitting]   = useState(false);

  // Steam inventory (for "Предлагаю")
  const [inventory, setInventory] = useState([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [invSearch, setInvSearch]   = useState('');

  // Steam Market search (for "Хочу")
  const [marketSearch, setMarketSearch] = useState('');
  const [marketCategory, setMarketCategory] = useState('');
  const [marketItems, setMarketItems] = useState([]);
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [marketSearched, setMarketSearched] = useState(false);

  useEffect(() => {
    if (user?.steam_id) loadInventory();
  }, [user?.steam_id]);

  const loadInventory = async () => {
    setLoadingInv(true);
    try {
      const { data } = await api.get(`/steam-inventory/${user.steam_id}`);
      setInventory(data.items || []);
    } catch { /* ignore */ }
    finally { setLoadingInv(false); }
  };

  const searchMarket = useCallback(async () => {
    if (!marketSearch.trim() && !marketCategory) return;
    setLoadingMarket(true);
    setMarketSearched(true);
    try {
      const params = new URLSearchParams({ count: '50' });
      if (marketSearch.trim()) params.set('q', marketSearch.trim());
      if (marketCategory) params.set('category', marketCategory);
      const { data } = await api.get(`/steam-items/search?${params}`);
      setMarketItems(data.items || []);
    } catch { toast.error('Ошибка поиска предметов'); }
    finally { setLoadingMarket(false); }
  }, [marketSearch, marketCategory]);

  // Auto-search when category changes
  useEffect(() => {
    if (marketCategory) searchMarket();
  }, [marketCategory]);

  const addFromInventory = (item) => {
    if (offeringItems.find(i => i.asset_id === item.asset_id)) return;
    setOfferingItems(prev => [...prev, {
      name: item.name,
      image: item.image,
      exterior: item.exterior,
      type: item.type,
      rarity: item.rarity,
      asset_id: item.asset_id,
    }]);
  };

  const addWantedItem = (item) => {
    if (wantedItems.find(i => i.name === item.name)) return;
    setWantedItems(prev => [...prev, {
      name: item.name,
      image: item.image,
      exterior: item.exterior,
      type: item.type,
      sell_price_text: item.sell_price_text,
    }]);
  };

  const removeOffering = (idx) => {
    setOfferingItems(prev => prev.filter((_, i) => i !== idx));
  };

  const removeWanted = (idx) => {
    setWantedItems(prev => prev.filter((_, i) => i !== idx));
  };

  const toggleTag = (tag) => {
    setWantedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const submit = async () => {
    if (!offeringItems.length) return toast.error('Добавьте предметы, которые предлагаете');
    if (!wantedItems.length && !wantedTags.length) return toast.error('Укажите, что хотите получить');
    setSubmitting(true);
    try {
      await api.post('/trades', {
        title,
        description,
        offering_items: offeringItems,
        wanted_items: wantedItems,
        wanted_tags: wantedTags,
        total_value: 0,
      });
      toast.success('Трейд создан!');
      navigate('/trades');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setSubmitting(false); }
  };

  const filteredInv = inventory.filter(i =>
    !offeringItems.find(o => o.asset_id === i.asset_id) &&
    i.name.toLowerCase().includes(invSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/trades')} className="flex items-center gap-1 text-gray-400 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4" /> Назад к трейдам
      </button>

      <h1 className="text-2xl font-bold text-white flex items-center gap-3">
        <ArrowLeftRight className="w-7 h-7 text-brand-400" />
        Создать обмен
      </h1>

      {/* Title & Description */}
      <div className="card space-y-3">
        <input className="input" placeholder="Заголовок (необязательно)"
          value={title} onChange={e => setTitle(e.target.value)} />
        <textarea className="input" rows={2} placeholder="Описание обмена, условия..."
          value={description} onChange={e => setDescription(e.target.value)} />
      </div>

      {/* Two-panel trade layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ══════ LEFT: ПРЕДЛАГАЮ ══════ */}
        <div className="space-y-4">
          <div className="card border-green-500/20">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-green-400" />
                </div>
                Предлагаю
                <span className="text-sm font-normal text-gray-500">({offeringItems.length})</span>
              </h2>
            </div>

            {/* Selected offering items */}
            {offeringItems.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
                {offeringItems.map((item, idx) => (
                  <ItemCard key={idx} item={item} onRemove={() => removeOffering(idx)} />
                ))}
              </div>
            )}

            {/* Inventory picker */}
            {user?.steam_id ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input className="input pl-10 text-sm" placeholder="Поиск в инвентаре..."
                      value={invSearch} onChange={e => setInvSearch(e.target.value)} />
                  </div>
                  <button className="btn-secondary !p-2" onClick={loadInventory} title="Обновить инвентарь">
                    <RefreshCw className={clsx('w-4 h-4', loadingInv && 'animate-spin')} />
                  </button>
                </div>

                {loadingInv ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
                  </div>
                ) : filteredInv.length === 0 ? (
                  <div className="text-center py-6 text-gray-500 text-sm">
                    {inventory.length === 0 ? 'Инвентарь пуст или недоступен' : 'Ничего не найдено'}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
                    {filteredInv.map((item, i) => (
                      <button key={i}
                        className="group relative bg-gray-800/50 rounded-lg border border-gray-700/50 hover:border-green-500/50 transition-all p-1.5 text-left"
                        onClick={() => addFromInventory(item)}
                      >
                        <div className="absolute inset-0 bg-green-500/5 rounded-lg opacity-0 group-hover:opacity-100 transition" />
                        <img src={item.image} alt={item.name}
                          className="w-full h-16 object-contain mb-1" />
                        <p className="text-[10px] text-gray-300 truncate leading-tight">{item.name}</p>
                        {item.exterior && (
                          <span className={clsx('text-[9px] font-medium', EXTERIOR_COLOR[item.exterior] || 'text-gray-500')}>
                            {EXTERIOR_SHORT[item.exterior] || item.exterior}
                          </span>
                        )}
                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                          <Plus className="w-3 h-3 text-white" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <LinkSteamInline />
            )}
          </div>
        </div>

        {/* ══════ RIGHT: ХОЧУ ══════ */}
        <div className="space-y-4">
          <div className="card border-purple-500/20">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Search className="w-4 h-4 text-purple-400" />
                </div>
                Хочу получить
                <span className="text-sm font-normal text-gray-500">
                  ({wantedItems.length + wantedTags.length})
                </span>
              </h2>
            </div>

            {/* Selected wanted items */}
            {wantedItems.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
                {wantedItems.map((item, idx) => (
                  <ItemCard key={idx} item={item} onRemove={() => removeWanted(idx)} variant="purple" />
                ))}
              </div>
            )}

            {/* Quick tags */}
            <div className="flex flex-wrap gap-2 mb-4">
              {TAGS.map(tag => (
                <button key={tag.id}
                  className={clsx(
                    'px-3 py-1.5 rounded-full text-sm transition border',
                    wantedTags.includes(tag.id)
                      ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-purple-500/30 hover:text-gray-300'
                  )}
                  onClick={() => toggleTag(tag.id)}
                >
                  {tag.label}
                </button>
              ))}
            </div>

            {/* Steam Market search */}
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input className="input pl-10 text-sm" placeholder="Поиск скинов Steam..."
                    value={marketSearch}
                    onChange={e => setMarketSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchMarket()}
                  />
                </div>
                <button className="btn-primary text-sm !px-4" onClick={searchMarket}
                  disabled={loadingMarket}>
                  {loadingMarket ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Найти'}
                </button>
              </div>

              {/* Category filter */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                {CATEGORIES.map(cat => (
                  <button key={cat.id}
                    className={clsx(
                      'px-3 py-1 rounded-full text-xs whitespace-nowrap transition border',
                      marketCategory === cat.id
                        ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                        : 'bg-gray-800/50 border-gray-700/50 text-gray-500 hover:text-gray-300'
                    )}
                    onClick={() => setMarketCategory(cat.id)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Market results */}
              {loadingMarket ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
                </div>
              ) : marketItems.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
                  {marketItems.map((item, i) => (
                    <button key={i}
                      className={clsx(
                        'group relative bg-gray-800/50 rounded-lg border transition-all p-1.5 text-left',
                        wantedItems.find(w => w.name === item.name)
                          ? 'border-purple-500/50 bg-purple-500/5'
                          : 'border-gray-700/50 hover:border-purple-500/50'
                      )}
                      onClick={() => addWantedItem(item)}
                      disabled={!!wantedItems.find(w => w.name === item.name)}
                    >
                      <div className="absolute inset-0 bg-purple-500/5 rounded-lg opacity-0 group-hover:opacity-100 transition" />
                      {item.image ? (
                        <img src={item.image} alt={item.name}
                          className="w-full h-16 object-contain mb-1" />
                      ) : (
                        <div className="w-full h-16 flex items-center justify-center">
                          <Package className="w-5 h-5 text-gray-600" />
                        </div>
                      )}
                      <p className="text-[10px] text-gray-300 truncate leading-tight">{item.name}</p>
                      {item.exterior && (
                        <span className={clsx('text-[9px] font-medium', EXTERIOR_COLOR[item.exterior] || 'text-gray-500')}>
                          {EXTERIOR_SHORT[item.exterior] || item.exterior}
                        </span>
                      )}
                      {item.sell_price_text && (
                        <p className="text-[9px] text-green-400 mt-0.5">{item.sell_price_text}</p>
                      )}
                      <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                        <Plus className="w-3 h-3 text-white" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : marketSearched ? (
                <div className="text-center py-6 text-gray-500 text-sm">
                  Ничего не найдено
                </div>
              ) : (
                <div className="text-center py-6 text-gray-600 text-sm">
                  Введите название скина или выберите категорию
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Submit */}
      <button className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base"
        onClick={submit} disabled={submitting || !offeringItems.length}>
        {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
        {submitting ? 'Публикация...' : 'Опубликовать обмен'}
      </button>
    </div>
  );
}

/* ── Item card component ── */
function ItemCard({ item, onRemove, variant = 'green' }) {
  const borderColor = variant === 'purple' ? 'border-purple-500/30' : 'border-green-500/30';
  const bgColor = variant === 'purple' ? 'bg-purple-500/5' : 'bg-green-500/5';

  return (
    <div className={clsx('relative rounded-lg border p-1.5 group', borderColor, bgColor)}>
      <button
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition z-10 hover:bg-red-500"
        onClick={onRemove}
      >
        <X className="w-3 h-3 text-white" />
      </button>
      {item.image ? (
        <img src={item.image} alt={item.name} className="w-full h-16 object-contain" />
      ) : (
        <div className="w-full h-16 flex items-center justify-center">
          <Package className="w-5 h-5 text-gray-600" />
        </div>
      )}
      <p className="text-[10px] text-white truncate mt-1 leading-tight">{item.name}</p>
      {item.exterior && (
        <span className={clsx('text-[9px] font-medium', EXTERIOR_COLOR[item.exterior] || 'text-gray-500')}>
          {EXTERIOR_SHORT[item.exterior] || item.exterior}
        </span>
      )}
      {item.sell_price_text && (
        <p className="text-[9px] text-green-400">{item.sell_price_text}</p>
      )}
    </div>
  );
}

/* ── Inline Steam link via Trade URL ── */
function LinkSteamInline() {
  const { fetchMe } = useAuth();
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const link = async () => {
    if (!url.trim()) return toast.error('Вставьте Trade URL');
    setSaving(true);
    try {
      await api.put('/balance/trade-url', { trade_url: url });
      toast.success('Steam привязан! Инвентарь загружается...');
      await fetchMe();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setSaving(false); }
  };

  return (
    <div className="py-6 px-4 text-center space-y-3">
      <Package className="w-8 h-8 text-gray-600 mx-auto" />
      <p className="text-sm text-gray-400">Вставьте Steam Trade URL для привязки аккаунта</p>
      <input
        className="input text-sm"
        placeholder="https://steamcommunity.com/tradeoffer/new/?partner=...&token=..."
        value={url} onChange={e => setUrl(e.target.value)}
      />
      <p className="text-xs text-gray-600">
        <a href="https://steamcommunity.com/my/tradeoffers/privacy#trade_offer_access_url"
          target="_blank" rel="noopener" className="text-brand-400 hover:underline">
          Где найти Trade URL? →
        </a>
      </p>
      <button className="btn-primary text-sm w-full" onClick={link} disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '🎮 Привязать Steam'}
      </button>
    </div>
  );
}
