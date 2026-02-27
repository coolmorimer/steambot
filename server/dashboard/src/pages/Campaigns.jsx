import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Play, Pause, RefreshCw, ChevronDown, ChevronUp, Pencil, Clock, X, Sparkles, Loader2, CheckCircle2, Globe, Search, ExternalLink } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { EmptyState } from './Accounts';
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
  const [mode, setMode]         = useState(value ? 'selected' : 'pick');  // pick | custom | selected
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
              {game?.name || 'Кастомный URL'}
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

  // Кастомный URL
  if (mode === 'custom') {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            className="input flex-1 font-mono text-sm"
            placeholder="https://steamcommunity.com/app/730/tradingforum/"
            value={value}
            onChange={e => onChange(e.target.value)}
          />
          <button type="button" onClick={() => value && setMode('selected')}
            disabled={!value}
            className="btn-primary px-3 text-sm">
            OK
          </button>
        </div>
        <button type="button" onClick={() => setMode('pick')}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
          ← Выбрать из списка
        </button>
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

      {/* Кнопка кастомного URL */}
      <button type="button" onClick={() => setMode('custom')}
        className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors pt-1">
        <Globe className="w-3.5 h-3.5" />
        Указать URL вручную
      </button>
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
function validateTimes(times, minuteGap = 60) {
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
    if (!validateTimes(next)) return toast.error('Между публикациями должно быть минимум 60 минут');
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
          <p className="text-xs text-amber-500/80">Выберите аккаунт ниже</p>
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
    if (!confirm('Удалить кампанию?')) return;
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
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Кампании</h1>
          <p className="text-gray-500 text-sm">{campaigns.length} / {isUnlimited ? '∞' : limit}</p>
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
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-gray-800" />)}</div>
      ) : campaigns.length === 0 ? (
        <EmptyState title="Нет кампаний" desc="Создайте первую кампанию для автоматической публикации." />
      ) : (
        <div className="space-y-2">
          {campaigns.map(c => (
            <CampaignCard key={c.id} campaign={c}
              onDelete={handleDelete} onToggle={handleToggle} onEdit={openEdit} />
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
    <div className="card">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-white truncate">{c.name}</p>
            <span className={c.is_active ? 'badge-green' : 'badge-gray'}>
              {c.is_active ? 'Активна' : 'Пауза'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{c.title_template}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => onToggle(c)} className="btn-ghost px-2 py-1" title={c.is_active ? 'Пауза' : 'Запустить'}>
            {c.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button onClick={() => onEdit(c)} className="btn-ghost px-2 py-1" title="Редактировать">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={() => setOpen(o => !o)} className="btn-ghost px-2 py-1">
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button onClick={() => onDelete(c.id)} className="btn-ghost px-2 py-1 hover:text-red-400" title="Удалить">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 pt-3 border-t border-gray-800 grid grid-cols-2 gap-3 text-xs text-gray-400">
          <div>
            <p className="text-gray-600 mb-1">Заголовок</p>
            <p>{c.title_template}</p>
          </div>
          <div>
            <p className="text-gray-600 mb-1">Расписание</p>
            <p>{scheduleLabel()}</p>
          </div>
          {c.window_start && c.window_end && (
            <div>
              <p className="text-gray-600 mb-1">Окно публикации</p>
              <p>{c.window_start} – {c.window_end}</p>
            </div>
          )}
          {c.target_url && (
            <div className="col-span-2">
              <p className="text-gray-600 mb-1">Раздел форума</p>
              <a href={c.target_url} target="_blank" rel="noopener noreferrer"
                className="text-brand-400 hover:text-brand-300 flex items-center gap-1 truncate">
                <Globe className="w-3 h-3 shrink-0" />
                {c.target_url.replace('https://steamcommunity.com', '')}
              </a>
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

  const [form, setForm] = useState({
    name:            initial?.name            ?? '',
    title_template:  initial?.title_template  ?? '',
    body_template:   initial?.body_template   ?? '',
    schedule_times:  parseTimes(initial?.schedule_times),
    window_start:    initial?.window_start    ?? '',
    window_end:      initial?.window_end      ?? '',
    profile_ids:     initial?.profile_ids     ?? [],
    target_url:      initial?.target_url      ?? '',
  });
  const [saving, setSaving]   = useState(false);
  const titleRef              = useRef(null);
  const bodyRef               = useRef(null);

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const toggleProfile = id => {
    setForm(p => ({
      ...p,
      profile_ids: p.profile_ids.includes(id)
        ? p.profile_ids.filter(x => x !== id)
        : [...p.profile_ids, id],
    }));
  };

  const submit = async e => {
    e.preventDefault();
    if (!form.profile_ids.length)     return toast.error('Выберите хотя бы один аккаунт');
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
        profile_ids:    form.profile_ids,
        target_url:     form.target_url || null,
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
      toast.success(isEdit ? 'Кампания обновлена' : 'Кампания создана');
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
    <div className="card border-brand-700">
      <h2 className="font-semibold text-white mb-4">
        {isEdit ? `Редактировать: ${initial.name}` : 'Новая кампания'}
      </h2>
      <form onSubmit={submit} className="space-y-4">

        {/* ── Куда постить (раздел Steam-форума) ── */}
        <div>
          <label className="label flex items-center gap-2">
            <Globe className="w-4 h-4 text-brand-400" />
            Раздел форума Steam
          </label>
          <ForumPicker
            value={form.target_url}
            onChange={url => setForm(p => ({ ...p, target_url: url }))}
          />
          {!form.target_url && (
            <p className="text-xs text-gray-500 mt-1.5">
              Если не выбрано — будет использоваться раздел из настроек аккаунта (по умолчанию CS2 Trading)
            </p>
          )}
        </div>

        {/* ── Генерация из инвентаря ── */}
        <GeneratePanel
          profileIds={form.profile_ids}
          profiles={profiles}
          onApply={(title, body) => setForm(p => ({ ...p, title_template: title, body_template: body }))}
        />

        {/* ── Ручной выбор шаблона (коллапс) ── */}
        <PostPresets onApply={(title, body) =>
          setForm(p => ({ ...p, title_template: title, body_template: body }))
        } />

        {/* Название */}
        <div>
          <label className="label">Название кампании</label>
          <input className="input" required value={form.name} onChange={f('name')} placeholder="Моя кампания" />
        </div>

        {/* Шаблон заголовка */}
        <div>
          <label className="label">Шаблон заголовка</label>
          <input ref={titleRef} className="input font-mono" required
            value={form.title_template} onChange={f('title_template')}
            placeholder="Напр.: Инвентарь {date} — {items_count} предметов" />
          <VarButtons fieldRef={titleRef} onInsert={doInsert} />
        </div>

        {/* Шаблон тела */}
        <div>
          <label className="label">Тело публикации</label>
          <textarea ref={bodyRef} className="input resize-none font-mono" rows={5} required
            value={form.body_template} onChange={f('body_template')}
            placeholder="Привет! Мой инвентарь сегодня ({date}):\nЛучший предмет: {best_item}\nВсего предметов: {items_count}\nТрейд-ссылка: {trade_url}" />
          <VarButtons fieldRef={bodyRef} onInsert={doInsert} />
        </div>

        {/* Время публикаций */}
        <div>
          <label className="label">Время публикаций
            <span className="text-gray-500 font-normal ml-1">(минимум 60 мин. между публикациями)</span>
          </label>
          <TimePicker
            value={form.schedule_times}
            onChange={times => setForm(p => ({ ...p, schedule_times: times }))}
          />
        </div>

        {/* Окно публикации (опционально) */}
        <div>
          <label className="label">Окно активности
            <span className="text-gray-500 font-normal ml-1">(опционально)</span>
          </label>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <input type="time" className="input w-32" value={form.window_start} onChange={f('window_start')} />
            <span className="text-gray-500">–</span>
            <input type="time" className="input w-32" value={form.window_end} onChange={f('window_end')} />
            {(form.window_start || form.window_end) && (
              <button type="button" className="btn-ghost px-2 py-1 text-xs"
                onClick={() => setForm(p => ({ ...p, window_start: '', window_end: '' }))}>
                Сбросить
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">Публикации будут выполняться только в указанный промежуток.</p>
        </div>

        {/* Аккаунты */}
        <div>
          <label className="label">Аккаунты
            <span className="text-gray-500 font-normal ml-1">({form.profile_ids.length} выбрано)</span>
          </label>
          {profiles.length === 0 ? (
            <p className="text-sm text-gray-500">Сначала добавьте аккаунты</p>
          ) : (
            <div className="flex flex-wrap gap-2 mt-1">
              {profiles.map(p => (
                <button key={p.id} type="button" onClick={() => toggleProfile(p.id)}
                  className={`text-sm px-3 py-1 rounded-full border transition-colors ${
                    form.profile_ids.includes(p.id)
                      ? 'bg-brand-600 border-brand-500 text-white'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
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

