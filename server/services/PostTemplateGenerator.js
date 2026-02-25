'use strict';

/**
 * server/services/PostTemplateGenerator.js
 *
 * 6 различных форматов Steam-поста из CS2-инвентаря.
 * Каждый вариант имеет уникальную структуру, заголовки, разделители.
 */

// ─── Категории ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'knife',  label: 'KNIFE',   prefix: '🔪★ ' },
  { key: 'gloves', label: 'GLOVES',  prefix: '🧤★ ' },
  { key: 'awp',    label: 'AWP',     prefix: '💥'   },
  { key: 'ak47',   label: 'AK-47',   prefix: '😻'   },
  { key: 'm4',     label: 'M4',      prefix: '💞'   },
  { key: 'pistol', label: 'PISTOLS', prefix: '🔥'   },
  { key: 'agent',  label: 'AGENTS',  prefix: '🍀'   },
  { key: 'other',  label: 'OTHER',   prefix: '💵'   },
];

// ─── Форматирование одного предмета ───────────────────────────────────────────
function fmtItem(item, prefix) {
  const baseName = (item.name || '')
    .replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*/gi, ' ')
    .trim();
  const ext = item.exterior ? ` ${item.exterior}` : '';
  return `${prefix}${baseName}${ext}`;
}

// ─── Распределить предметы по категориям ─────────────────────────────────────
function groupItems(items) {
  const byKey = {};
  for (const cat of CATEGORIES) byKey[cat.key] = [];
  for (const item of items) {
    const key = item.category || 'other';
    (byKey[key] || byKey['other']).push(item);
  }
  return byKey;
}

// ─── VARIANT 0 — Классика (💔 разделитель, [h1], торговая ссылка 3x) ─────────
function buildVariant0(items, tradeUrl) {
  const D1 = `💔 ${tradeUrl} 💔`;
  const D3 = `${D1}\n${D1}\n${D1}`;
  const g  = groupItems(items);
  const parts = [];
  let idx = 0;
  for (const cat of CATEGORIES) {
    if (!g[cat.key].length) continue;
    parts.push(`💎${cat.label}:\n\n${g[cat.key].map(i => fmtItem(i, cat.prefix)).join('\n')}`);
    idx++;
    if (idx % 2 === 0) parts.push(D1);
  }
  return `[h1]\n${D3}\n\n${parts.join('\n\n')}\n\n${D3}\n[/h1]`;
}

// ─── VARIANT 1 — Витрина (заголовки ═══, без h1, эмодзи 💜) ──────────────────
function buildVariant1(items, tradeUrl) {
  const SEP  = '════════════════════════════════';
  const LINK = `💜 ${tradeUrl}`;
  const g    = groupItems(items);
  const parts = [`${LINK}\n${LINK}\n${LINK}\n${SEP}`];
  for (const cat of CATEGORIES) {
    if (!g[cat.key].length) continue;
    parts.push(`\n• ${cat.label} •\n${g[cat.key].map(i => fmtItem(i, cat.prefix)).join('\n')}`);
  }
  parts.push(`\n${SEP}\n${LINK}\n${LINK}\n${LINK}`);
  return parts.join('\n');
}

// ─── VARIANT 2 — Telegram-стиль (нумерованные секции, 🔥 ссылка) ─────────────
function buildVariant2(items, tradeUrl) {
  const LINK = `🔥 ${tradeUrl} 🔥`;
  const g    = groupItems(items);
  const parts = [`${LINK}\n${LINK}`];
  let n = 1;
  for (const cat of CATEGORIES) {
    if (!g[cat.key].length) continue;
    const lines = g[cat.key].map(i => fmtItem(i, cat.prefix)).join('\n');
    parts.push(`[${n++}] ── ${cat.label} ──\n${lines}`);
  }
  parts.push(`\n${LINK}\n${LINK}`);
  return `[h1]\n${parts.join('\n\n')}\n[/h1]`;
}

// ─── VARIANT 3 — Чистый список (минимализм, ссылка один раз снизу) ────────────
function buildVariant3(items, tradeUrl) {
  const g = groupItems(items);
  const parts = [];
  for (const cat of CATEGORIES) {
    if (!g[cat.key].length) continue;
    const lines = g[cat.key].map(i => `  ${fmtItem(i, cat.prefix)}`).join('\n');
    parts.push(`▸ ${cat.label}\n${lines}`);
  }
  return `${parts.join('\n\n')}\n\n🔗 Trade link:\n${tradeUrl}`;
}

// ─── VARIANT 4 — ВИП-стиль (звёзды, 💎 заголовки, ссылка каждые 3 секции) ────
function buildVariant4(items, tradeUrl) {
  const STAR = '★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★';
  const LINK = `⭐ ${tradeUrl} ⭐`;
  const g    = groupItems(items);
  const parts = [`${STAR}\n${LINK}\n${STAR}`];
  let idx = 0;
  for (const cat of CATEGORIES) {
    if (!g[cat.key].length) continue;
    const lines = g[cat.key].map(i => fmtItem(i, cat.prefix)).join('\n');
    parts.push(`◆ ${cat.label} ◆\n${lines}`);
    idx++;
    if (idx % 3 === 0) parts.push(LINK);
  }
  parts.push(`${STAR}\n${LINK}\n${STAR}`);
  return `[h1]\n${parts.join('\n\n')}\n[/h1]`;
}

// ─── VARIANT 5 — Карточки (рамки Unicode, статистика наверху) ────────────────
function buildVariant5(items, tradeUrl) {
  const knives   = items.filter(i => i.category === 'knife').length;
  const stattrak = items.filter(i => i.stattrak).length;
  const gloves   = items.filter(i => i.category === 'gloves').length;
  const LINK     = `🧡 ${tradeUrl} 🧡`;
  const STATS    = `┌─ INVENTORY STATS ─────────────────┐\n│  📦 Total: ${String(items.length).padEnd(4)} 🔪 Knives: ${String(knives).padEnd(4)} 🧤 Gloves: ${String(gloves).padEnd(3)}│\n│  📈 StatTrak: ${String(stattrak).padEnd(3)}                          │\n└────────────────────────────────────┘`;
  const g = groupItems(items);
  const parts = [`${LINK}\n${LINK}\n\n${STATS}`];
  for (const cat of CATEGORIES) {
    if (!g[cat.key].length) continue;
    const lines = g[cat.key].map(i => `│ ${fmtItem(i, cat.prefix)}`).join('\n');
    parts.push(`┌─ ${cat.label} ${'─'.repeat(Math.max(0, 30 - cat.label.length))}┐\n${lines}\n└${'─'.repeat(32)}┘`);
  }
  parts.push(`\n${LINK}\n${LINK}`);
  return `[h1]\n${parts.join('\n\n')}\n[/h1]`;
}

// ─── Публичный API ────────────────────────────────────────────────────────────
const BUILDERS = [
  buildVariant0, buildVariant1, buildVariant2,
  buildVariant3, buildVariant4, buildVariant5,
];

function buildFullPost(items = [], tradeUrl = '', variant = 0) {
  const build = BUILDERS[variant % BUILDERS.length];
  return build(items, tradeUrl);
}

function buildCategorySection(items = [], categoryKey) {
  const cat = CATEGORIES.find(c => c.key === categoryKey);
  if (!cat) return '';
  const catItems = items.filter(i => (i.category || 'other') === categoryKey);
  if (!catItems.length) return '';
  return `💎${cat.label}:\n\n${catItems.map(i => fmtItem(i, cat.prefix)).join('\n')}`;
}

const TITLE_VARIANTS = [
  '💔🍒🍑OPEN INVENTORY🍑🍒💔 <=> 💔🍒🍑SEND TRADES🍑🍒💔',
  '💜 SHOWCASE | {items_count} SKINS FOR TRADE | {knives_count} KNIVES 💜',
  '🔥 [{date}] CS2 ITEMS | {items_count} total | SEND OFFER → 🔥',
  '🎯 TRADING {items_count} CS2 SKINS — CHECK MY INV 🎯',
  '⭐ VIP INVENTORY | {knives_count} KNIVES + {stattrak_count} STATTRAK | {date} ⭐',
  '🧡 {items_count} CS2 ITEMS AVAILABLE | BEST: {best_item} 🧡',
];

module.exports = { buildFullPost, buildCategorySection, TITLE_VARIANTS, CATEGORIES, BUILDERS };
