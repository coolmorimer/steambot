import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Play, Pause, RefreshCw, ChevronDown, ChevronUp, Pencil, Clock, X, Sparkles, Loader2, CheckCircle2, Globe, Search, ExternalLink, Users, Lock } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { EmptyState } from './Accounts';
import PageGuide from '../components/PageGuide';
import toast from 'react-hot-toast';

// ─── Переменные шаблона ────────────────────────────────────────────────────────
const DATE_VARS = [
  { label: '{date}',    hint: 'дата' },
  { label: '{time}',    hint: 'время' },
  { label: '{day}',     hint: 'день недели' },
  { label: '{num}',     hint: 'порядковый номер' },
  { label: '{profile}', hint: 'имя аккаунта' },
];
const INV_VARS = [
  { label: '{items_count}',    hint: 'кол-во предметов' },
  { label: '{best_item}',      hint: 'лучший предмет' },
  { label: '{top_items}',      hint: 'топ-5 предметов' },
  { label: '{stattrak_count}', hint: 'кол-во StatTrak' },
  { label: '{knives_count}',   hint: 'кол-во ножей' },
  { label: '{trade_url}',      hint: 'ссылка для обмена' },
];
// Секционные переменные (для продвинутых шаблонов)
const SECTION_VARS = [
  { label: '{full_inventory_post}', hint: '⭐ ВЕСЬ пост целиком (авто-разметка)' },
  { label: '{knives_section}',      hint: 'секция ножей' },
  { label: '{gloves_section}',      hint: 'секция перчаток' },
  { label: '{awp_section}',         hint: 'секция AWP' },
  { label: '{ak47_section}',        hint: 'секция AK-47' },
  { label: '{m4_section}',          hint: 'секция M4' },
  { label: '{pistols_section}',     hint: 'секция пистолетов' },
  { label: '{agents_section}',      hint: 'секция агентов' },
  { label: '{other_section}',       hint: 'секция "Другое"' },
];

// ─── Steam-игры и их разделы форума ────────────────────────────────────────────
const STEAM_GAMES = [
  {
    appId: 730, name: 'Counter-Strike 2', short: 'CS2', emoji: '🎯',
    forums: [
      { name: 'Trading Forum',       url: 'https://steamcommunity.com/app/730/tradingforum/' },
      { name: 'General Discussions',  url: 'https://steamcommunity.com/app/730/discussions/0/' },
    ],
  },
  {
    appId: 570, name: 'Dota 2', short: 'Dota 2', emoji: '⚔️',
    forums: [
      { name: 'Trading Forum',       url: 'https://steamcommunity.com/app/570/tradingforum/' },
      { name: 'General Discussions',  url: 'https://steamcommunity.com/app/570/discussions/0/' },
    ],
  },
  {
    appId: 440, name: 'Team Fortress 2', short: 'TF2', emoji: '🎩',
    forums: [
      { name: 'Trading Forum',       url: 'https://steamcommunity.com/app/440/tradingforum/' },
      { name: 'General Discussions',  url: 'https://steamcommunity.com/app/440/discussions/0/' },
    ],
  },
  {
    appId: 252490, name: 'Rust', short: 'Rust', emoji: '🔧',
    forums: [
      { name: 'Trading Forum',       url: 'https://steamcommunity.com/app/252490/tradingforum/' },
      { name: 'General Discussions',  url: 'https://steamcommunity.com/app/252490/discussions/0/' },
    ],
  },
  {
    appId: 578080, name: 'PUBG: Battlegrounds', short: 'PUBG', emoji: '🪖',
    forums: [
      { name: 'Trading Forum',       url: 'https://steamcommunity.com/app/578080/tradingforum/' },
      { name: 'General Discussions',  url: 'https://steamcommunity.com/app/578080/discussions/0/' },
    ],
  },
  {
    appId: 753, name: 'Steam', short: 'Steam', emoji: '🎮',
    forums: [
      { name: 'Trading Forum',       url: 'https://steamcommunity.com/app/753/tradingforum/' },
      { name: 'General Discussions',  url: 'https://steamcommunity.com/discussions/forum/0/' },
    ],
  },
  {
    appId: 304930, name: 'Unturned', short: 'Unturned', emoji: '🧟',
    forums: [
      { name: 'Trading Forum',       url: 'https://steamcommunity.com/app/304930/tradingforum/' },
      { name: 'General Discussions',  url: 'https://steamcommunity.com/app/304930/discussions/0/' },
    ],
  },
  {
    appId: 322330, name: 'Don\'t Starve Together', short: 'DST', emoji: '🔥',
    forums: [
      { name: 'Trading Forum',       url: 'https://steamcommunity.com/app/322330/tradingforum/' },
      { name: 'General Discussions',  url: 'https://steamcommunity.com/app/322330/discussions/0/' },
    ],
  },
];

// ─── ForumPicker — выбор раздела Steam-форума ──────────────────────────────────
function ForumPicker({ value, onChange }) {
  const [mode, setMode]         = useState(value ? 'selected' : 'pick');  // pick | selected
  const [search, setSearch]     = useState('');
  const [selectedGame, setGame] = useState(null);

  // Если пришёл value и мы ещё не выбрали — определяем игру
  useEffect(() => {
    if (value && mode === 'selected') {
      const g = STEAM_GAMES.find(g => g.forums.some(f => f.url === value));
      if (g) setGame(g);
    }
  }, []);

  const filtered = search
    ? STEAM_GAMES.filter(g =>
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        g.short.toLowerCase().includes(search.toLowerCase()))
    : STEAM_GAMES;

  const handleSelect = (url) => {
    onChange(url);
    setMode('selected');
  };

  const handleClear = () => {
    onChange('');
    setGame(null);
    setMode('pick');
  };

  // Выбранный вариант
  if (mode === 'selected' && value) {
    const game = STEAM_GAMES.find(g => g.forums.some(f => f.url === value));
    const forum = game?.forums.find(f => f.url === value);
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-brand-600/10 border border-brand-600/30">
          <div className="w-10 h-10 rounded-lg bg-brand-600/20 flex items-center justify-center text-lg shrink-0">
            {game?.emoji || '🌐'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">
              {game?.name || 'Форум'}
              {forum && <span className="text-brand-400 ml-1.5">→ {forum.name}</span>}
            </p>
            <p className="text-xs text-gray-400 truncate font-mono">{value}</p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <a href={value} target="_blank" rel="noopener noreferrer"
              className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors"
              title="Открыть форум">
              <ExternalLink className="w-4 h-4" />
            </a>
            <button type="button" onClick={handleClear}
              className="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-400 hover:text-red-400 transition-colors"
              title="Изменить">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Если выбрана игра — показать разделы
  if (selectedGame) {
    return (
      <div className="space-y-2">
        <button type="button" onClick={() => setGame(null)}
          className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors">
          ← Все игры
        </button>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{selectedGame.emoji}</span>
          <span className="text-sm font-semibold text-white">{selectedGame.name}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {selectedGame.forums.map(f => (
            <button key={f.url} type="button" onClick={() => handleSelect(f.url)}
              className="text-left p-3 rounded-lg bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 hover:border-brand-600/40 transition-all group">
              <p className="text-sm font-medium text-white group-hover:text-brand-400 transition-colors">
                {f.name}
              </p>
              <p className="text-xs text-gray-500 font-mono truncate mt-0.5">{f.url.replace('https://steamcommunity.com', '')}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Список игр
  return (
    <div className="space-y-2">
      {/* Поиск */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          className="input pl-9 text-sm"
          placeholder="Поиск игры..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Сетка игр */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {filtered.map(g => (
          <button key={g.appId} type="button" onClick={() => setGame(g)}
            className="text-left p-3 rounded-lg bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 hover:border-brand-600/40 transition-all group">
            <div className="text-xl mb-1">{g.emoji}</div>
            <p className="text-sm font-medium text-white group-hover:text-brand-400 transition-colors truncate">{g.short}</p>
            <p className="text-xs text-gray-500">{g.forums.length} разд.</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── GroupPicker — выбор Steam-групп для постинга ──────────────────────────────
function GroupPicker({ value, onChange, maxGroups }) {
  const [groups, setGroups]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [open, setOpen]       = useState(false);

  useEffect(() => {
    api.get('/steam-groups')
      .then(({ data }) => setGroups(data.groups || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selected = value || [];
  const filtered = search
    ? groups.filter(g =>
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        g.slug.toLowerCase().includes(search.toLowerCase()))
    : groups;

  const toggle = (id) => {
    if (selected.includes(id)) {
      onChange(selected.filter(x => x !== id));
    } else {
      if (maxGroups !== -1 && selected.length >= maxGroups) {
        return toast.error(`Максимум ${maxGroups} групп на вашем плане`);
      }
      onChange([...selected, id]);
    }
  };

  const selectAll = () => {
    const available = maxGroups === -1 ? groups : groups.slice(0, maxGroups);
    onChange(available.map(g => g.id));
  };

  const clearAll = () => onChange([]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-3">
        <Loader2 className="w-4 h-4 animate-spin" /> Загрузка групп...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Шапка */}
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-3 rounded-xl bg-gray-800/60 border border-gray-700/50 hover:border-brand-600/40 transition-all">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-600/30 flex items-center justify-center">
            <Users className="w-4.5 h-4.5 text-indigo-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">
              Steam-группы
              {selected.length > 0 && (
                <span className="text-indigo-400 ml-1.5">
                  {selected.length} / {maxGroups === -1 ? groups.length : maxGroups}
                </span>
              )}
            </p>
            <p className="text-xs text-gray-500">
              {selected.length === 0
                ? 'Выберите группы для публикации'
                : `Выбрано ${selected.length} групп`}
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>

      {open && (
        <div className="rounded-xl border border-gray-700/50 bg-gray-900/60 overflow-hidden">
          {/* Поиск + кнопки */}
          <div className="p-3 border-b border-gray-800 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                className="input pl-9 text-sm"
                placeholder="Поиск группы..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={selectAll}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                Выбрать все ({maxGroups === -1 ? groups.length : Math.min(maxGroups, groups.length)})
              </button>
              <span className="text-gray-700">|</span>
              <button type="button" onClick={clearAll}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                Сбросить
              </button>
            </div>
          </div>

          {/* Сетка групп */}
          <div className="p-3 max-h-64 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {filtered.map((g, idx) => {
                const isSelected = selected.includes(g.id);
                const isLocked = !isSelected && maxGroups !== -1 && selected.length >= maxGroups;
                return (
                  <button key={g.id} type="button" onClick={() => toggle(g.id)}
                    disabled={isLocked}
                    className={`text-left px-2.5 py-2 rounded-lg border text-xs transition-all ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-600/50 text-indigo-300'
                        : isLocked
                        ? 'bg-gray-800/30 border-gray-800 text-gray-600 cursor-not-allowed'
                        : 'bg-gray-800/40 border-gray-700/50 text-gray-400 hover:border-gray-600 hover:text-gray-200'
                    }`}>
                    <div className="flex items-center gap-1.5">
                      {isLocked && <Lock className="w-3 h-3 text-gray-600 shrink-0" />}
                      <span className="truncate font-medium">{g.name}</span>
                    </div>
                    <div className="text-[10px] text-gray-600 truncate mt-0.5">{g.slug}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Лимит */}
          {maxGroups !== -1 && (
            <div className="px-3 pb-2.5 pt-1 border-t border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {selected.length} / {maxGroups} групп
                </span>
                <div className="flex-1 mx-3 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${Math.min(100, (selected.length / maxGroups) * 100)}%` }}
                  />
                </div>
                {selected.length >= maxGroups && (
                  <span className="text-[10px] text-amber-500">Лимит</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Выбранные группы (превью) */}
      {!open && selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.slice(0, 8).map(id => {
            const g = groups.find(gr => gr.id === id);
            if (!g) return null;
            return (
              <span key={id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-900/30 border border-indigo-800/40 text-indigo-400 text-[11px]">
                {g.name}
                <button type="button" onClick={() => toggle(id)} className="hover:text-red-400 ml-0.5">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            );
          })}
          {selected.length > 8 && (
            <span className="text-[11px] text-gray-500 px-2 py-0.5">+{selected.length - 8} ещё</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Готовые шаблоны (title + body) ───────────────────────────────────────────
const POST_PRESETS = [
  {
    label: '💔 Классика',
    emoji: '💔',
    desc:  '[h1] + ссылка ×3 сверху/снизу, секции по категориям',
    title: '💔🍒🍑OPEN INVENTORY🍑🍒💔 <=> 💔🍒🍑SEND TRADES🍑🍒💔',
    body:  '{full_inventory_post}',
  },
  {
    label: '💜 Витрина',
    emoji: '💜',
    desc:  'Разделитель ════, без [h1], минималистичный стиль',
    title: '💜 SHOWCASE | {items_count} SKINS FOR TRADE | {knives_count} KNIVES 💜',
    body:  '{full_inventory_post}',
  },
  {
    label: '🔥 TG-стиль',
    emoji: '🔥',
    desc:  'Нумерованные секции [1] [2] [3]…, дата в заголовке',
    title: '🔥 [{date}] CS2 ITEMS | {items_count} total | SEND OFFER → 🔥',
    body:  '{full_inventory_post}',
  },
  {
    label: '🎯 Чистый список',
    emoji: '🎯',
    desc:  'Без [h1], без рамок, ссылка один раз внизу',
    title: '🎯 TRADING {items_count} CS2 SKINS — CHECK MY INV 🎯',
    body:  '{full_inventory_post}',
  },
  {
    label: '⭐ VIP-стиль',
    emoji: '⭐',
    desc:  'Звёзды ★★★, ссылка каждые 3 секции, [h1]',
    title: '⭐ VIP INVENTORY | {knives_count} KNIVES + {stattrak_count} STATTRAK | {date} ⭐',
    body:  '{full_inventory_post}',
  },
  {
    label: '🧡 Карточки',
    emoji: '🧡',
    desc:  'Unicode-рамки ┌─┐, статистика сверху, [h1]',
    title: '🧡 {items_count} CS2 ITEMS AVAILABLE | BEST: {best_item} 🧡',
    body:  '{full_inventory_post}',
  },
];

/** Вставить переменную в поле ввода в позицию курсора */
function insertVar(ref, varStr, onChange) {
  const el = ref.current;
  if (!el) return;
  const start = el.selectionStart;
  const end   = el.selectionEnd;
  const val   = el.value;
  const next  = val.slice(0, start) + varStr + val.slice(end);
  onChange(next);
  // восстановить позицию курсора после render
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + varStr.length, start + varStr.length);
  });
}

// ─── Пикер времени ─────────────────────────────────────────────────────────────
/** Проверить, что соседние времена стоят минимум на minuteGap минут друг от друга
 *  с учётом перехода через полночь */
function validateTimes(times, minuteGap = 65) {
  if (times.length < 2) return true;
  const mins = times.map(t => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }).sort((a, b) => a - b);
  for (let i = 1; i < mins.length; i++) {
    if (mins[i] - mins[i - 1] < minuteGap) return false;
  }
  // проверить «кольцо»: первый после последнего
  const wrap = 1440 - mins[mins.length - 1] + mins[0];
  if (wrap < minuteGap) return false;
  return true;
}

function TimePicker({ value, onChange }) {
  const [input, setInput] = useState('');

  const add = () => {
    if (!input) return;
    if (value.includes(input)) return toast.error('Это время уже добавлено');
    const next = [...value, input].sort();
    if (!validateTimes(next)) return toast.error('Между публикациями должно быть минимум 65 минут');
    onChange(next);
    setInput('');
  };

  const remove = t => onChange(value.filter(x => x !== t));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input type="time" className="input w-36" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} />
        <button type="button" onClick={add} className="btn-primary px-3">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map(t => (
            <span key={t} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-600/20 border border-brand-600/40 text-brand-400 text-sm">
              <Clock className="w-3 h-3" />
              {t}
              <button type="button" onClick={() => remove(t)} className="ml-1 hover:text-red-400">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {value.length === 0 && (
        <p className="text-xs text-gray-500">Добавьте хотя бы одно время публикации</p>
      )}
    </div>
  );
}

// ─── Кнопки вставки переменных ─────────────────────────────────────────────────
function VarButtons({ fieldRef, onInsert }) {
  const [showSections, setShowSections] = useState(false);
  return (
    <div className="space-y-1 mt-1">
      <p className="text-xs text-gray-500">Дата / время</p>
      <div className="flex flex-wrap gap-1">
        {DATE_VARS.map(v => (
          <button key={v.label} type="button" title={v.hint}
            onClick={() => onInsert(fieldRef, v.label)}
            className="text-xs px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors">
            {v.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-1">Инвентарь Steam</p>
      <div className="flex flex-wrap gap-1">
        {INV_VARS.map(v => (
          <button key={v.label} type="button" title={v.hint}
            onClick={() => onInsert(fieldRef, v.label)}
            className="text-xs px-2 py-0.5 rounded bg-indigo-900/40 hover:bg-indigo-900/70 text-indigo-300 border border-indigo-800/50 transition-colors">
            {v.label}
          </button>
        ))}
      </div>
      {/* Секционные переменные — раскрывающиеся */}
      <button type="button" onClick={() => setShowSections(s => !s)}
        className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 mt-1 transition-colors">
        {showSections ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Секции инвентаря по категориям
      </button>
      {showSections && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {SECTION_VARS.map(v => (
            <button key={v.label} type="button" title={v.hint}
              onClick={() => onInsert(fieldRef, v.label)}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                v.label === '{full_inventory_post}'
                  ? 'bg-emerald-900/50 hover:bg-emerald-900/80 text-emerald-300 border-emerald-700/50 font-semibold'
                  : 'bg-purple-900/30 hover:bg-purple-900/60 text-purple-300 border-purple-800/40'
              }`}>
              {v.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Панель «Сгенерировать из инвентаря» ──────────────────────────────────────
function GeneratePanel({ profileIds, profiles, onApply }) {
  const [loading,        setLoading]       = useState(false);
  const [done,           setDone]          = useState(false);
  const [selectedVariant, setVariant]      = useState(0);
  const [meta,           setMeta]          = useState(null);   // { items_count, knives_count, … }

  // Активный аккаунт для генерации (первый выбранный)
  const activeProfile = profiles.find(p => profileIds.includes(p.id));

  const generate = async () => {
    if (!activeProfile) return toast.error('Сначала выберите аккаунт');
    setLoading(true);
    setDone(false);
    try {
      const { data } = await api.get(
        `/profiles/${activeProfile.id}/inventory-post?variant=${selectedVariant}`
      );
      onApply(data.title, data.body);
      setMeta(data.meta);
      setDone(true);
      toast.success('Пост сгенерирован! Поля заполнены ✨');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка загрузки инвентаря');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-emerald-800/40 bg-gradient-to-br from-emerald-950/60 to-gray-900 overflow-hidden">
      {/* Шапка */}
      <div className="px-4 pt-4 pb-3 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-600/30 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Сгенерировать из инвентаря</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Бот зайдёт в Steam, прочитает инвентарь{activeProfile ? ` «${activeProfile.name}»` : ''} и составит готовый пост прямо здесь
          </p>
        </div>
      </div>

      {/* Варианты стиля */}
      <div className="px-4 pb-3">
        <p className="text-xs text-gray-500 mb-2">Стиль заголовка:</p>
        <div className="flex flex-wrap gap-1.5">
          {POST_PRESETS.map((p, i) => (
            <button key={i} type="button"
              onClick={() => { setVariant(i); setDone(false); }}
              className={`text-left text-xs px-3 py-2 rounded-lg border transition-all ${
                selectedVariant === i
                  ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/40'
                  : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
              }`}>
              <div className="font-semibold">{p.emoji} {p.label.replace(/^.+? /, '')}</div>
              <div className={`text-xs mt-0.5 ${selectedVariant === i ? 'text-emerald-200' : 'text-gray-500'}`}>{p.desc}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-600 font-mono mt-2 truncate opacity-70">
          {POST_PRESETS[selectedVariant]?.title}
        </p>
      </div>

      {/* Кнопка + статус */}
      <div className="px-4 pb-4 flex items-center gap-3">
        <button type="button" onClick={generate} disabled={loading || !activeProfile}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg ${
            loading
              ? 'bg-emerald-700/50 text-emerald-300 cursor-wait shadow-emerald-900/20'
              : done
              ? 'bg-emerald-600 text-white shadow-emerald-900/40'
              : !activeProfile
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed shadow-none'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40 hover:shadow-emerald-900/60 active:scale-95'
          }`}>
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Читаю инвентарь...</>
            : done
            ? <><CheckCircle2 className="w-4 h-4" /> Готово!</>
            : <><Sparkles className="w-4 h-4" /> Сгенерировать пост</>
          }
        </button>

        {!activeProfile && (
          <p className="text-xs text-amber-500/80">Выберите аккаунт выше</p>
        )}

        {meta && done && (
          <div className="flex flex-wrap gap-3 text-xs text-gray-400">
            <span>📦 {meta.items_count} скинов</span>
            {meta.knives_count > 0   && <span>🔪 {meta.knives_count} ножей</span>}
            {meta.stattrak_count > 0 && <span>📈 {meta.stattrak_count} StatTrak</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Панель готовых шаблонов (ручная вставка) ──────────────────────────────────
function PostPresets({ onApply }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-dashed border-gray-700 rounded-lg overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-400 hover:bg-gray-800/60 transition-colors">
        <span className="flex items-center gap-2">
          <span>📋</span>
          <span>Вставить шаблон вручную (без генерации)</span>
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
      </button>
      {open && (
        <div className="border-t border-gray-700 bg-gray-900/40 p-3">
          <p className="text-xs text-gray-500 mb-2">
            Поля заполнятся переменными. Бот подставит данные при публикации.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {POST_PRESETS.map(p => (
              <button key={p.label} type="button"
                onClick={() => { onApply(p.title, p.body); setOpen(false); }}
                className="text-left p-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 transition-all">
                <div className="text-xs font-medium text-white mb-0.5">{p.emoji} {p.label.replace(/^.+? /, '')}</div>
                <div className="text-xs text-gray-500 font-mono truncate">{p.title.slice(0, 40)}…</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Главная страница ─────────────────────────────────────────────────────────
export default function Campaigns() {
  const { sub } = useAuth();
  const [campaigns, setCampaigns]       = useState([]);
  const [profiles, setProfiles]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [editingCampaign, setEditing]   = useState(null); // null = создание

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/campaigns'), api.get('/profiles')])
      .then(([c, p]) => { setCampaigns(c.data); setProfiles(p.data); })
      .catch(() => toast.error('Ошибка загрузки'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async id => {
    if (!confirm('Удалить задачу?')) return;
    await api.delete(`/campaigns/${id}`);
    setCampaigns(c => c.filter(x => x.id !== id));
    toast.success('Удалено');
  };

  const handleToggle = async (c) => {
    const { data } = await api.patch(`/campaigns/${c.id}`, { is_active: !c.is_active });
    setCampaigns(list => list.map(x => x.id === c.id ? { ...x, is_active: data.is_active } : x));
  };

  const openEdit = campaign => {
    setEditing(campaign);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeForm = () => { setShowForm(false); setEditing(null); };

  const handleSaved = (saved, isEdit) => {
    if (isEdit) {
      setCampaigns(l => l.map(x => x.id === saved.id ? saved : x));
    } else {
      setCampaigns(l => [saved, ...l]);
    }
    closeForm();
  };

  const limit  = sub?.limits?.max_campaigns ?? 1;
  const isUnlimited = limit === -1;
  const canAdd = isUnlimited || campaigns.length < limit;

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-brand-500/20 border border-emerald-500/20 flex items-center justify-center">
            <span className="text-lg">📢</span>
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight">Автопостинг</h1>
            <p className="text-gray-500 text-sm">{campaigns.length} / {isUnlimited ? '∞' : limit} задач</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost"><RefreshCw className="w-4 h-4" /></button>
          {(canAdd || editingCampaign) && !showForm && (
            <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary">
              <Plus className="w-4 h-4" /> Создать
            </button>
          )}
        </div>
      </div>

      <PageGuide id="campaigns-guide" emoji="📢" title="📖 Инструкция: Автопостинг" sections={[
        {
          icon: '🎯', heading: 'Для чего эта страница',
          text: 'Здесь вы создаёте задачи для автоматической публикации объявлений на форумах и в группах Steam. Каждая задача — это расписание публикации одного объявления.',
        },
        {
          icon: '➕', heading: 'Как создать задачу',
          steps: [
            { title: 'Нажмите «Создать»', desc: 'откроется форма создания задачи' },
            { title: 'Выберите аккаунт', desc: 'из списка добавленных в «Мои аккаунты»' },
            { title: 'Создайте пост', desc: 'сгенерируйте из инвентаря (кнопка «Сгенерировать») или напишите свой' },
            { title: 'Укажите время', desc: 'добавьте время публикации (минимум 65 минут между постами)' },
          ],
        },
        {
          icon: '⚙️', heading: 'Настройки задачи',
          items: [
            { label: 'Название', desc: 'имя задачи для вас (например: «CS2 Trading»)' },
            { label: 'Заголовок поста', desc: 'то, что увидят в названии темы' },
            { label: 'Тело поста', desc: 'основной текст объявления' },
            { label: 'Время публикации', desc: 'в какие часы бот должен публиковать' },
          ],
        },
      ]} />

      {showForm && (
        <CampaignForm
          key={editingCampaign?.id ?? 'new'}
          initial={editingCampaign}
          profiles={profiles}
          onSaved={handleSaved}
          onClose={closeForm}
        />
      )}

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="card h-24 animate-pulse bg-gray-800/50 rounded-2xl" />)}</div>
      ) : campaigns.length === 0 ? (
        <EmptyState title="Нет задач" emoji="📢" desc="Создайте первую задачу для автопостинга на Steam." />
      ) : (
        <div className="space-y-3">
          {campaigns.map((c, i) => (
            <div key={c.id} className="animate-scale-in" style={{ animationDelay: `${i * 50}ms` }}>
              <CampaignCard campaign={c}
                onDelete={handleDelete} onToggle={handleToggle} onEdit={openEdit} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Карточка кампании ─────────────────────────────────────────────────────────
function CampaignCard({ campaign: c, onDelete, onToggle, onEdit }) {
  const [open, setOpen] = useState(false);

  const scheduleLabel = () => {
    const times = parseTimes(c.schedule_times);
    if (times.length > 0) return times.join(', ');
    if (c.schedule_minutes) return `Каждые ${c.schedule_minutes} мин.`;
    return 'Не задано';
  };

  return (
    <div className="card-hover">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            c.is_active
              ? 'bg-gradient-to-br from-green-600/20 to-emerald-700/20 border border-green-600/30'
              : 'bg-gray-800 border border-gray-700'
          }`}>
            {c.is_active ? <Play className="w-4 h-4 text-green-400" /> : <Pause className="w-4 h-4 text-gray-500" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-white truncate">{c.name}</p>
              <span className={c.is_active ? 'badge-green' : 'badge-gray'}>
                {c.is_active ? '🟢 Активна' : '⏸️ Пауза'}
              </span>
              {c.group_ids && c.group_ids.length > 0 && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-900/30 border border-indigo-800/30 text-indigo-400 text-[10px]">
                  <Users className="w-2.5 h-2.5" />
                  {c.group_ids.length}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{c.title_template}</p>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => onToggle(c)} className="btn-ghost px-2 py-1.5 rounded-lg" title={c.is_active ? 'Пауза' : 'Запустить'}>
            {c.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button onClick={() => onEdit(c)} className="btn-ghost px-2 py-1.5 rounded-lg" title="Редактировать">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={() => setOpen(o => !o)} className="btn-ghost px-2 py-1.5 rounded-lg">
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button onClick={() => onDelete(c.id)} className="btn-ghost px-2 py-1.5 rounded-lg hover:text-red-400 hover:bg-red-500/10" title="Удалить">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-4 pt-4 border-t border-gray-800/60 grid grid-cols-2 gap-4 text-xs text-gray-400">
          <div>
            <p className="text-gray-600 mb-1 font-medium">📝 Заголовок</p>
            <p className="text-gray-300">{c.title_template}</p>
          </div>
          <div>
            <p className="text-gray-600 mb-1 font-medium">⏰ Расписание</p>
            <p className="text-gray-300">{scheduleLabel()}</p>
          </div>
          {c.window_start && c.window_end && (
            <div>
              <p className="text-gray-600 mb-1 font-medium">🕐 Окно публикации</p>
              <p className="text-gray-300">{c.window_start} – {c.window_end}</p>
            </div>
          )}
          {c.target_url && (
            <div className="col-span-2">
              <p className="text-gray-600 mb-1 font-medium">🌐 Раздел форума</p>
              <a href={c.target_url} target="_blank" rel="noopener noreferrer"
                className="text-brand-400 hover:text-brand-300 flex items-center gap-1 truncate transition-colors">
                <Globe className="w-3 h-3 shrink-0" />
                {c.target_url.replace('https://steamcommunity.com', '')}
              </a>
            </div>
          )}
          {c.group_ids && c.group_ids.length > 0 && (
            <div className="col-span-2">
              <p className="text-gray-600 mb-1">Steam-группы ({c.group_ids.length})</p>
              <div className="flex flex-wrap gap-1">
                {c.group_ids.map(gid => (
                  <span key={gid} className="px-1.5 py-0.5 rounded bg-indigo-900/30 border border-indigo-800/40 text-indigo-400 text-[10px]">
                    #{gid}
                  </span>
                ))}
              </div>
            </div>
          )}
          {c.body_template && (
            <div className="col-span-2">
              <p className="text-gray-600 mb-1">Тело публикации</p>
              <p className="line-clamp-3 whitespace-pre-wrap">{c.body_template}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Парсим schedule_times из строки / массива */
function parseTimes(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; }
  catch { return []; }
}

// ─── Форма создания / редактирования ──────────────────────────────────────────
function CampaignForm({ initial, profiles, onSaved, onClose }) {
  const isEdit = !!initial?.id;
  const { sub } = useAuth();

  const [form, setForm] = useState({
    name:            initial?.name            ?? '',
    title_template:  initial?.title_template  ?? '',
    body_template:   initial?.body_template   ?? '',
    schedule_times:  parseTimes(initial?.schedule_times),
    window_start:    initial?.window_start    ?? '',
    window_end:      initial?.window_end      ?? '',
    profile_id:      initial?.profile_ids?.[0] ?? initial?.profile_id ?? '',
    target_url:      initial?.target_url      ?? '',
  });
  const [saving, setSaving]   = useState(false);
  const titleRef              = useRef(null);
  const bodyRef               = useRef(null);

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const selectProfile = id => {
    setForm(p => ({ ...p, profile_id: id }));
  };

  const submit = async e => {
    e.preventDefault();
    if (!form.profile_id)             return toast.error('Выберите аккаунт');
    if (!form.schedule_times.length)  return toast.error('Добавьте хотя бы одно время публикации');

    setSaving(true);
    try {
      const payload = {
        name:           form.name,
        title_template: form.title_template,
        body_template:  form.body_template,
        schedule_times: form.schedule_times,
        window_start:   form.window_start || null,
        window_end:     form.window_end   || null,
        profile_ids:    [form.profile_id],
        target_url:     form.target_url || null,
        group_ids:      [],
      };

      let saved;
      if (isEdit) {
        const { data } = await api.patch(`/campaigns/${initial.id}`, payload);
        saved = data; // сервер возвращает полный объект
      } else {
        const { data } = await api.post('/campaigns', payload);
        saved = data; // сервер возвращает полный объект
      }

      onSaved(saved, isEdit);
      toast.success(isEdit ? 'Задача обновлена' : 'Задача создана');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const doInsert = (ref, varStr) => insertVar(ref, varStr, val => {
    const key = ref === titleRef ? 'title_template' : 'body_template';
    setForm(p => ({ ...p, [key]: val }));
  });

  return (
    <div className="card border-brand-700/50">
      <h2 className="font-bold text-white text-lg mb-5 flex items-center gap-2">
        <span className="text-xl">{isEdit ? '✏️' : '✨'}</span>
        {isEdit ? `Редактировать: ${initial.name}` : 'Новая задача'}
      </h2>
      <form onSubmit={submit} className="space-y-4">

        {/* ── Аккаунт (один) ── */}
        <div>
          <label className="label flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-400" />
            Аккаунт
            {form.profile_id && <span className="text-gray-500 font-normal ml-1">(выбран)</span>}
          </label>
          {profiles.length === 0 ? (
            <p className="text-sm text-gray-500">Сначала добавьте аккаунты</p>
          ) : (
            <div className="flex flex-wrap gap-2 mt-1">
              {profiles.map(p => (
                <button key={p.id} type="button" onClick={() => selectProfile(p.id)}
                  className={`flex items-center gap-2 text-sm px-3 py-2 rounded-xl border transition-all ${
                    form.profile_id === p.id
                      ? 'bg-brand-600/20 border-brand-500/60 text-white ring-1 ring-brand-500/30'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:bg-gray-800/60'
                  }`}>
                  {p.avatar_url ? (
                    <img src={p.avatar_url} className="w-7 h-7 rounded-lg object-cover ring-1 ring-gray-700/50" alt="" />
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-400">
                      {(p.name || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="font-medium">{p.name}</span>
                  {form.profile_id === p.id && (
                    <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Генерация из инвентаря ── */}
        <GeneratePanel
          profileIds={form.profile_id ? [form.profile_id] : []}
          profiles={profiles}
          onApply={(title, body) => setForm(p => ({ ...p, title_template: title, body_template: body }))}
        />

        {/* ── Ручной выбор шаблона (коллапс) ── */}
        <PostPresets onApply={(title, body) =>
          setForm(p => ({ ...p, title_template: title, body_template: body }))
        } />

        {/* Название */}
        <div>
          <label className="label">Название задачи</label>
          <input className="input" required value={form.name} onChange={f('name')} placeholder="Моя задача" />
        </div>

        {/* Шаблон заголовка */}
        <div>
          <label className="label">Шаблон заголовка</label>
          <input ref={titleRef} className="input font-mono" required
            value={form.title_template} onChange={f('title_template')}
            placeholder="Напр.: Инвентарь {date} — {items_count} предметов" />
        </div>

        {/* Шаблон тела */}
        <div>
          <label className="label">Тело публикации</label>
          <textarea ref={bodyRef} className="input resize-none font-mono" rows={5} required
            value={form.body_template} onChange={f('body_template')}
            placeholder="Привет! Мой инвентарь сегодня ({date}):\nЛучший предмет: {best_item}\nВсего предметов: {items_count}\nТрейд-ссылка: {trade_url}" />
        </div>

        {/* ── Время публикации ── */}
        <div>
          <label className="label flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-400" />
            Время публикации
          </label>
          <TimePicker
            value={form.schedule_times}
            onChange={times => setForm(p => ({ ...p, schedule_times: times }))}
          />
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">Отмена</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Сохраняю...' : isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </form>
    </div>
  );
}

