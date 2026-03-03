import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowLeftRight, ArrowRight, Loader2, Package, Plus, Search,
  RefreshCw, Check, X, MessageSquare, Clock, CheckCircle, XCircle,
  ExternalLink, Send, User, Inbox, ChevronDown, ChevronUp,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const EXTERIOR_SHORT = {
  'Factory New': 'FN', 'Minimal Wear': 'MW', 'Field-Tested': 'FT',
  'Well-Worn': 'WW', 'Battle-Scarred': 'BS',
};
const EXTERIOR_COLOR = {
  'Factory New': 'text-green-400', 'Minimal Wear': 'text-lime-400',
  'Field-Tested': 'text-yellow-400', 'Well-Worn': 'text-orange-400',
  'Battle-Scarred': 'text-red-400',
};
const WANTED_TAG_LABELS = {
  any_knife: '🔪 Любой нож', any_gloves: '🧤 Любые перчатки', any_offers: '💬 Любые предложения',
};
const STATUS_MAP = {
  pending:   { label: 'Ожидает',   color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', icon: Clock },
  accepted:  { label: 'Принято',   color: 'text-green-400 bg-green-500/10 border-green-500/20',   icon: CheckCircle },
  declined:  { label: 'Отклонено', color: 'text-red-400 bg-red-500/10 border-red-500/20',         icon: XCircle },
  cancelled: { label: 'Отменено',  color: 'text-gray-400 bg-gray-500/10 border-gray-500/20',      icon: X },
};

export default function TradeView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [trade, setTrade]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [proposals, setProposals] = useState([]);
  const [loadingProposals, setLoadingProposals] = useState(false);

  // Proposal form
  const [showForm, setShowForm]         = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [message, setMessage]           = useState('');
  const [submitting, setSubmitting]     = useState(false);

  // Inventory
  const [inventory, setInventory]   = useState([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [invSearch, setInvSearch]   = useState('');

  const isOwner = user?.id === trade?.creator_id;

  /* ── Load trade ── */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/trades/${id}`);
        setTrade(data);
      } catch {
        toast.error('Трейд не найден');
        navigate('/trades');
      } finally { setLoading(false); }
    })();
  }, [id]);

  /* ── Load proposals (owner only) ── */
  useEffect(() => {
    if (!trade || !isOwner) return;
    loadProposals();
  }, [trade, isOwner]);

  const loadProposals = async () => {
    setLoadingProposals(true);
    try {
      const { data } = await api.get(`/trades/${id}/proposals`);
      setProposals(data);
    } catch { /* ignore */ }
    finally { setLoadingProposals(false); }
  };

  /* ── Load inventory ── */
  const loadInventory = useCallback(async () => {
    if (!user?.steam_id) return;
    setLoadingInv(true);
    try {
      const { data } = await api.get(`/steam-inventory/${user.steam_id}`);
      setInventory(data.items || []);
    } catch { toast.error('Ошибка загрузки инвентаря'); }
    finally { setLoadingInv(false); }
  }, [user?.steam_id]);

  useEffect(() => {
    if (showForm && user?.steam_id && inventory.length === 0) loadInventory();
  }, [showForm, user?.steam_id]);

  /* ── Select item ── */
  const addItem = (item) => {
    if (selectedItems.find(i => i.asset_id === item.asset_id)) return;
    setSelectedItems(prev => [...prev, {
      name: item.name, image: item.image, exterior: item.exterior,
      type: item.type, rarity: item.rarity, asset_id: item.asset_id,
    }]);
  };
  const removeItem = (idx) => setSelectedItems(prev => prev.filter((_, i) => i !== idx));

  /* ── Submit proposal ── */
  const submitProposal = async () => {
    if (!selectedItems.length) return toast.error('Выберите предметы для обмена');
    setSubmitting(true);
    try {
      await api.post(`/trades/${id}/proposals`, { items: selectedItems, message });
      toast.success('Предложение отправлено! 🎉');
      setShowForm(false);
      setSelectedItems([]);
      setMessage('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setSubmitting(false); }
  };

  /* ── Accept / Decline ── */
  const acceptProposal = async (proposalId) => {
    try {
      const { data } = await api.patch(`/trades/proposals/${proposalId}/accept`);
      toast.success('Предложение принято! ✅');
      if (data.proposer_trade_url) {
        window.open(data.proposer_trade_url, '_blank');
      }
      loadProposals();
      // Refresh trade to see completed status
      const { data: t } = await api.get(`/trades/${id}`);
      setTrade(t);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const declineProposal = async (proposalId, reason = '') => {
    try {
      await api.patch(`/trades/proposals/${proposalId}/decline`, { reason });
      toast.success('Предложение отклонено');
      loadProposals();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const filteredInv = inventory.filter(i =>
    !selectedItems.find(s => s.asset_id === i.asset_id) &&
    i.name.toLowerCase().includes(invSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 animate-slide-up">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        <p className="text-sm text-gray-500">Загрузка трейда...</p>
      </div>
    );
  }

  if (!trade) return null;

  const offering = trade.offering_items || [];
  const wanted   = trade.wanted_items || [];
  const tags     = trade.wanted_tags || [];

  return (
    <div className="space-y-6 animate-slide-up max-w-4xl mx-auto">
      {/* Back */}
      <button onClick={() => navigate('/trades')}
        className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition">
        <ArrowLeft className="w-4 h-4" /> Назад к трейдам
      </button>

      {/* Trade info card */}
      <div className="card">
        {/* Creator header */}
        <div className="flex items-center gap-3 mb-5">
          {trade.steam_avatar ? (
            <img src={trade.steam_avatar} className="w-12 h-12 rounded-xl ring-2 ring-gray-700/50 shadow-md" alt="" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 flex items-center justify-center text-white font-bold ring-2 ring-gray-700/30">
              {(trade.steam_username || trade.creator_name || '?')[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-lg">{trade.steam_username || trade.creator_name}</p>
            {trade.title && <p className="text-sm text-gray-500">{trade.title}</p>}
          </div>
          {isOwner && <span className="badge-blue">Ваш обмен</span>}
          {trade.status !== 'active' && (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-700/50 text-gray-400 border border-gray-600/30">
              {trade.status === 'completed' ? '✅ Завершён' : '🚫 Отменён'}
            </span>
          )}
        </div>

        {/* Items two-panel */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-4 items-start">
          {/* Offering */}
          <div>
            <p className="text-xs font-bold mb-3 flex items-center gap-1.5 text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> Предлагает
            </p>
            <div className="flex flex-wrap gap-2">
              {offering.map((item, i) => <SkinCard key={i} item={item} />)}
            </div>
          </div>

          {/* Arrow */}
          <div className="hidden md:flex items-center justify-center py-8">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-500/10 to-purple-500/10 border border-brand-500/20 flex items-center justify-center">
              <ArrowRight className="w-5 h-5 text-brand-400" />
            </div>
          </div>
          <div className="md:hidden flex justify-center">
            <div className="w-8 h-8 rounded-full bg-gray-800/60 border border-gray-700/40 flex items-center justify-center rotate-90">
              <ArrowRight className="w-3 h-3 text-brand-400" />
            </div>
          </div>

          {/* Wanted */}
          <div>
            <p className="text-xs font-bold mb-3 flex items-center gap-1.5 text-purple-400">
              <span className="w-2 h-2 rounded-full bg-purple-400" /> Хочет получить
            </p>
            <div className="flex flex-wrap gap-2">
              {wanted.map((item, i) => <SkinCard key={`w-${i}`} item={item} variant="purple" />)}
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
          <div className="mt-5 pt-4 border-t border-gray-800/40">
            <p className="text-sm text-gray-400">💬 {trade.description}</p>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════
          NOT OWNER → SEND PROPOSAL
          ═══════════════════════════════════════════════ */}
      {!isOwner && trade.status === 'active' && (
        <div className="space-y-4">
          {!showForm ? (
            <button onClick={() => setShowForm(true)}
              className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2 group">
              <Send className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              Предложить обмен
            </button>
          ) : (
            <div className="card border-brand-500/20 space-y-5 animate-scale-in">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center">
                    <Send className="w-4 h-4 text-brand-400" />
                  </div>
                  Ваше предложение
                </h2>
                <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white transition">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Selected items */}
              {selectedItems.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-green-400 mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    Вы предлагаете ({selectedItems.length})
                  </p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {selectedItems.map((item, idx) => (
                      <div key={idx} className="relative group rounded-lg border border-green-500/30 bg-green-500/5 p-1.5">
                        <button onClick={() => removeItem(idx)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition z-10 hover:bg-red-500">
                          <X className="w-3 h-3 text-white" />
                        </button>
                        <img src={item.image} alt={item.name} className="w-full h-14 object-contain" />
                        <p className="text-[9px] text-gray-300 truncate mt-1">{item.name}</p>
                        {item.exterior && (
                          <span className={clsx('text-[8px] font-bold', EXTERIOR_COLOR[item.exterior])}>
                            {EXTERIOR_SHORT[item.exterior]}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Inventory picker */}
              {user?.steam_id ? (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input className="input pl-10 text-sm" placeholder="Поиск в инвентаре..."
                        value={invSearch} onChange={e => setInvSearch(e.target.value)} />
                    </div>
                    <button className="btn-secondary !p-2" onClick={loadInventory} title="Обновить">
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
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-64 overflow-y-auto pr-1">
                      {filteredInv.map((item, i) => (
                        <button key={i}
                          className="group relative bg-gray-800/50 rounded-lg border border-gray-700/50 hover:border-green-500/50 transition-all p-1.5 text-left"
                          onClick={() => addItem(item)}>
                          <div className="absolute inset-0 bg-green-500/5 rounded-lg opacity-0 group-hover:opacity-100 transition" />
                          <img src={item.image} alt={item.name} className="w-full h-14 object-contain mb-1" />
                          <p className="text-[9px] text-gray-300 truncate leading-tight">{item.name}</p>
                          {item.exterior && (
                            <span className={clsx('text-[8px] font-medium', EXTERIOR_COLOR[item.exterior])}>
                              {EXTERIOR_SHORT[item.exterior]}
                            </span>
                          )}
                          <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                            <Plus className="w-2.5 h-2.5 text-white" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-6 text-center text-gray-500 text-sm space-y-2">
                  <Package className="w-8 h-8 mx-auto text-gray-600" />
                  <p>Привяжите Steam аккаунт в <Link to="/settings" className="text-brand-400 hover:underline">настройках</Link></p>
                </div>
              )}

              {/* Message */}
              <div>
                <textarea className="input text-sm" rows={2}
                  placeholder="Сообщение (необязательно)..."
                  value={message} onChange={e => setMessage(e.target.value)} />
              </div>

              {/* Submit */}
              <button onClick={submitProposal}
                disabled={submitting || !selectedItems.length}
                className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base">
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                {submitting ? 'Отправка...' : `Отправить предложение (${selectedItems.length} предм.)`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* External trade URL for non-owners */}
      {!isOwner && trade.creator_trade_url && trade.status === 'active' && (
        <a href={trade.creator_trade_url} target="_blank" rel="noopener"
          className="btn-secondary w-full py-3 text-sm flex items-center justify-center gap-2">
          <ExternalLink className="w-4 h-4" /> Открыть обмен в Steam (напрямую)
        </a>
      )}

      {/* ═══════════════════════════════════════════════
          OWNER → INCOMING PROPOSALS
          ═══════════════════════════════════════════════ */}
      {isOwner && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Inbox className="w-5 h-5 text-brand-400" />
              Предложения
              {proposals.length > 0 && (
                <span className="text-sm font-normal text-gray-500">({proposals.length})</span>
              )}
            </h2>
            <button onClick={loadProposals} className="btn-secondary !p-2" title="Обновить">
              <RefreshCw className={clsx('w-4 h-4', loadingProposals && 'animate-spin')} />
            </button>
          </div>

          {loadingProposals ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
            </div>
          ) : proposals.length === 0 ? (
            <div className="card text-center py-10">
              <div className="text-4xl mb-3">📭</div>
              <p className="text-gray-500 text-sm">Предложений пока нет</p>
              <p className="text-gray-600 text-xs mt-1">Поднимите трейд, чтобы привлечь внимание</p>
            </div>
          ) : (
            <div className="space-y-3">
              {proposals.map((p, idx) => (
                <ProposalCard key={p.id} proposal={p} idx={idx}
                  onAccept={acceptProposal} onDecline={declineProposal} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════ Proposal Card (for owner) ═══════ */
function ProposalCard({ proposal: p, idx, onAccept, onDecline }) {
  const [expanded, setExpanded] = useState(idx === 0);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const st = STATUS_MAP[p.status] || STATUS_MAP.pending;
  const StatusIcon = st.icon;
  const items = p.items || [];

  const handleDecline = () => {
    if (!declining) { setDeclining(true); return; }
    onDecline(p.id, reason);
    setDeclining(false);
    setReason('');
  };

  return (
    <div className="card-hover animate-slide-up" style={{ animationDelay: `${idx * 40}ms` }}>
      {/* Header */}
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {p.proposer_avatar ? (
          <img src={p.proposer_avatar} className="w-10 h-10 rounded-xl ring-2 ring-gray-700/50" alt="" />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 flex items-center justify-center text-white text-sm font-bold ring-2 ring-gray-700/30">
            {(p.proposer_steam_username || p.proposer_name || '?')[0]}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-sm">{p.proposer_steam_username || p.proposer_name}</p>
          <p className="text-xs text-gray-500">{items.length} предмет(ов) • {formatTimeAgo(p.created_at)}</p>
        </div>
        <span className={clsx('px-2.5 py-1 rounded-full text-[11px] font-medium border flex items-center gap-1', st.color)}>
          <StatusIcon className="w-3 h-3" /> {st.label}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-800/40 space-y-4 animate-scale-in">
          {/* Items */}
          <div>
            <p className="text-xs font-bold text-green-400 mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400" /> Предлагает
            </p>
            <div className="flex flex-wrap gap-2">
              {items.map((item, i) => <SkinCard key={i} item={item} />)}
            </div>
          </div>

          {/* Message */}
          {p.message && (
            <div className="flex items-start gap-2 bg-gray-800/30 rounded-xl p-3 border border-gray-700/30">
              <MessageSquare className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-gray-400">{p.message}</p>
            </div>
          )}

          {/* Decline reason */}
          {p.decline_reason && (
            <div className="flex items-start gap-2 bg-red-500/5 rounded-xl p-3 border border-red-500/10">
              <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-400">Причина отклонения: {p.decline_reason}</p>
            </div>
          )}

          {/* Actions */}
          {p.status === 'pending' && (
            <div className="flex flex-col sm:flex-row gap-2">
              <button onClick={() => onAccept(p.id)}
                className="btn-success flex-1 flex items-center justify-center gap-2 py-2.5">
                <CheckCircle className="w-4 h-4" /> Принять
              </button>

              {!declining ? (
                <button onClick={handleDecline}
                  className="btn-secondary flex-1 flex items-center justify-center gap-2 py-2.5 hover:border-red-500/30 hover:text-red-400">
                  <XCircle className="w-4 h-4" /> Отклонить
                </button>
              ) : (
                <div className="flex-1 space-y-2 animate-scale-in">
                  <input className="input text-sm" placeholder="Причина отклонения (необязательно)"
                    value={reason} onChange={e => setReason(e.target.value)} />
                  <div className="flex gap-2">
                    <button onClick={handleDecline}
                      className="btn-secondary flex-1 text-sm text-red-400 border-red-500/30 hover:bg-red-500/10">
                      Подтвердить отклонение
                    </button>
                    <button onClick={() => { setDeclining(false); setReason(''); }}
                      className="btn-secondary text-sm !px-3">
                      Отмена
                    </button>
                  </div>
                </div>
              )}

              {p.proposer_trade_url && (
                <a href={p.proposer_trade_url} target="_blank" rel="noopener"
                  className="btn-secondary flex items-center justify-center gap-2 py-2.5 !px-4">
                  <ExternalLink className="w-4 h-4" /> Steam
                </a>
              )}
            </div>
          )}

          {/* After accept — show trade URL */}
          {p.status === 'accepted' && p.proposer_trade_url && (
            <a href={p.proposer_trade_url} target="_blank" rel="noopener"
              className="btn-success w-full flex items-center justify-center gap-2 py-2.5">
              <ExternalLink className="w-4 h-4" /> Открыть обмен в Steam
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════ Skin Card ═══════ */
function SkinCard({ item, variant = 'green' }) {
  const extShort = EXTERIOR_SHORT[item.exterior] || '';
  const borderColor = variant === 'purple'
    ? 'border-purple-500/15 hover:border-purple-500/30'
    : 'border-gray-700/40 hover:border-gray-600/60';

  return (
    <div className={clsx(
      'relative bg-gray-800/40 rounded-xl border transition-all duration-200 p-2 w-[80px] sm:w-[88px] group',
      borderColor
    )}>
      {item.image ? (
        <img src={item.image} alt={item.name}
          className="w-full h-14 object-contain group-hover:scale-105 transition-transform duration-200" />
      ) : (
        <div className="w-full h-14 flex items-center justify-center">
          <Package className="w-4 h-4 text-gray-600" />
        </div>
      )}
      <p className="text-[9px] sm:text-[10px] text-gray-300 truncate mt-1.5 leading-tight font-medium">{item.name}</p>
      {extShort && (
        <span className={clsx('text-[8px] sm:text-[9px] font-bold', EXTERIOR_COLOR[item.exterior])}>
          {extShort}
        </span>
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
