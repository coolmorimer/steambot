'use strict';

/**
 * openai.js — Генерация постов для Steam через OpenAI API.
 *
 * API-ключ берётся из config/config.json → поле "openaiKey".
 * Если ключа нет — генерация не работает.
 */

const https  = require('https');
const http   = require('http');
const path   = require('path');
const fs     = require('fs');
const logger = require('./logger');

const CONFIG_PATH = path.join(__dirname, 'config', 'config.json');

function getApiKey() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const cfg = JSON.parse(raw);
    return cfg.openaiKey || cfg.openai_key || cfg.OPENAI_API_KEY || null;
  } catch {
    return null;
  }
}

function getOpenAIConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const cfg = JSON.parse(raw);
    return {
      baseUrl: cfg.openaiBaseUrl || 'https://api.openai.com',
      model:   cfg.openaiModel  || 'gpt-4o-mini',
    };
  } catch {
    return { baseUrl: 'https://api.openai.com', model: 'gpt-4o-mini' };
  }
}

function getOllamaConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const cfg = JSON.parse(raw);
    return {
      url:   cfg.ollamaUrl   || 'http://localhost:11434',
      model: cfg.ollamaModel || 'llama3',
    };
  } catch {
    return { url: 'http://localhost:11434', model: 'llama3' };
  }
}

/**
 * Сгенерировать пост для Steam-форума на основе инвентаря.
 *
 * @param {object} params
 * @param {object[]} params.items       — массив предметов (name, category, exterior, stattrak, souvenir)
 * @param {string}   params.tradeUrl    — ссылка на трейд
 * @param {string}   [params.style]     — стиль поста ('emoji' | 'clean') — по умолчанию 'emoji'
 * @returns {Promise<{title: string, body: string}>}
 */
async function generatePost({ items, tradeUrl, style = 'emoji' }) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('OpenAI API ключ не найден. Добавьте "openaiKey" в config/config.json');
  }

  // Группировка предметов
  const grouped = groupItems(items);
  const inventoryText = formatInventoryForPrompt(grouped);

  const systemPrompt = `You are a CS2 Steam trading forum post formatter. 
You create eye-catching trading posts for Steam Community forums.
The post format uses Steam BBCode ([h1], [b], etc).
Always include the trade URL multiple times throughout the post.
Use emojis to make the post visually appealing.
Group items by category with headers.
Use category-specific emojis: 🔪 for knives, 🧤 for gloves, 💥 for AWP, 😻 for AK-47, 💞 for M4, 🔥 for pistols, 🍀 for agents, 💵 for other items.
Put 💔 around trade URLs.
Wrap the entire post body in [h1]...[/h1] tags.
Use 💎 before category headers.
IMPORTANT: If there are duplicate items, add X2, X3 etc after the item name.
Respond ONLY with JSON: {"title": "...", "body": "..."}`;

  const userPrompt = `Generate a Steam CS2 trading forum post.
Trade URL: ${tradeUrl || 'https://steamcommunity.com/tradeoffer/new/?partner=XXXXXXXXX&token=XXXXXXXX'}

Inventory:
${inventoryText}

Style: ${style === 'clean' ? 'Minimal, clean formatting with less emojis' : 'Rich emoji formatting, eye-catching'}

Return JSON with "title" and "body" fields. The title should be catchy with emojis. The body should list all items grouped by category with the trade URL inserted between sections.`;

  const response = await callOpenAI(apiKey, [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userPrompt },
  ]);

  // Парсим JSON из ответа
  let result;
  try {
    // Ответ может быть обёрнут в ```json ... ```
    let cleaned = response.trim();
    const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) cleaned = jsonMatch[1].trim();
    result = JSON.parse(cleaned);
  } catch {
    throw new Error('OpenAI вернул некорректный ответ. Попробуйте ещё раз.');
  }

  if (!result.title || !result.body) {
    throw new Error('OpenAI вернул неполный ответ (нет title или body).');
  }

  return { title: result.title, body: result.body };
}

/**
 * Сгенерировать пост без AI — форматирование по шаблону.
 * @param {string} [templateId='emoji'] — id шаблона
 */
function generatePostLocal({ items, tradeUrl, templateId = 'emoji' }) {
  const grouped = groupItems(items);
  const url = tradeUrl || 'https://steamcommunity.com/tradeoffer/new/?partner=XXXXXXXXX&token=XXXXXXXX';

  const templateFn = TEMPLATES[templateId] || TEMPLATES.emoji;
  return templateFn(grouped, url);
}

/**
 * Список доступных шаблонов (id → label).
 */
function getTemplateList() {
  return Object.entries(TEMPLATE_META).map(([id, meta]) => ({ id, ...meta }));
}

const TEMPLATE_META = {
  emoji:    { name: '🎨 Emoji Classic',    desc: 'Яркий с эмодзи и [h1] тегами' },
  minimal:  { name: '📋 Minimal Clean',    desc: 'Чистый минималистичный стиль' },
  table:    { name: '📊 Table Style',      desc: 'Табличный формат с разделителями' },
  fire:     { name: '🔥 Fire & Hype',      desc: 'Агрессивный хайповый стиль' },
  premium:  { name: '💎 Premium Luxury',   desc: 'Премиальный элегантный дизайн' },
  compact:  { name: '📦 Compact List',     desc: 'Компактный список без лишнего' },
};

// ═══════════════════════════════════════════════════════════════════════════
//  Шаблоны
// ═══════════════════════════════════════════════════════════════════════════

const TEMPLATES = {};

// ── 1. Emoji Classic (оригинальный) ────────────────────────────────────
TEMPLATES.emoji = function (grouped, url) {
  const title = '💔🍒🍑OPEN INVENTORY🍑🍒💔 <=> 💔🍒🍑SEND TRADES🍑🍒💔';

  const categoryConfig = {
    knife:  { header: 'KNIFE',   emoji: '🔪★ ' },
    gloves: { header: 'GLOVES',  emoji: '🧤★ ' },
    awp:    { header: 'AWP',     emoji: '💥' },
    ak47:   { header: 'AK-47',   emoji: '😻' },
    m4:     { header: 'M4',      emoji: '💞' },
    pistol: { header: 'PISTOLS', emoji: '🔥' },
    agent:  { header: 'AGENTS',  emoji: '🍀' },
    other:  { header: 'OTHER',   emoji: '💵' },
  };

  const tradeLink = `💔 ${url} 💔`;
  const sections = [];
  sections.push(`${tradeLink}\n${tradeLink}\n${tradeLink}`);

  const order = ['knife', 'gloves', 'awp', 'ak47', 'm4', 'pistol', 'agent', 'other'];
  let sectionCount = 0;

  for (const cat of order) {
    const catItems = grouped[cat];
    if (!catItems || catItems.length === 0) continue;
    const cfg = categoryConfig[cat];
    const lines = [`\n💎${cfg.header}:\n`];
    const { seen, counts } = countDuplicates(catItems);
    for (const [key, count] of Object.entries(counts)) {
      lines.push(`${cfg.emoji}${key}${count > 1 ? ` X${count}` : ''}`);
    }
    sections.push(lines.join('\n'));
    sectionCount++;
    if (sectionCount % 2 === 0) sections.push(`\n${tradeLink}`);
  }

  sections.push(`\n${tradeLink}\n${tradeLink}\n${tradeLink}`);
  const body = `[h1]\n${sections.join('\n')}\n[/h1]`;
  return { title, body };
};

// ── 2. Minimal Clean ───────────────────────────────────────────────────
TEMPLATES.minimal = function (grouped, url) {
  const title = '[STORE] CS2 Skins — Send Trade Offer';

  const catNames = {
    knife: 'Knives', gloves: 'Gloves', awp: 'AWP', ak47: 'AK-47',
    m4: 'M4A4/M4A1-S', pistol: 'Pistols', agent: 'Agents', other: 'Other',
  };

  const order = ['knife', 'gloves', 'awp', 'ak47', 'm4', 'pistol', 'agent', 'other'];
  const sections = [`[b]Trade URL:[/b] ${url}\n`];

  for (const cat of order) {
    const catItems = grouped[cat];
    if (!catItems || catItems.length === 0) continue;
    const { counts } = countDuplicates(catItems);
    sections.push(`[b]${catNames[cat]}[/b]`);
    for (const [key, count] of Object.entries(counts)) {
      sections.push(`  • ${key}${count > 1 ? ` (x${count})` : ''}`);
    }
    sections.push('');
  }

  sections.push(`[b]Trade URL:[/b] ${url}`);
  const body = sections.join('\n');
  return { title, body };
};

// ── 3. Table Style ─────────────────────────────────────────────────────
TEMPLATES.table = function (grouped, url) {
  const title = '══ CS2 TRADING STORE ══ Send Offer! ══';

  const catNames = {
    knife: '🔪 KNIVES', gloves: '🧤 GLOVES', awp: '🎯 AWP', ak47: '💀 AK-47',
    m4: '⚡ M4', pistol: '🔫 PISTOLS', agent: '🕵️ AGENTS', other: '📦 OTHER',
  };

  const order = ['knife', 'gloves', 'awp', 'ak47', 'm4', 'pistol', 'agent', 'other'];
  const sections = [];
  sections.push(`[h1]═══════════════════════════════════[/h1]`);
  sections.push(`[h1]    💰 CS2 TRADE STORE 💰    [/h1]`);
  sections.push(`[h1]═══════════════════════════════════[/h1]`);
  sections.push(`\n🔗 ${url}\n`);

  for (const cat of order) {
    const catItems = grouped[cat];
    if (!catItems || catItems.length === 0) continue;
    const { counts } = countDuplicates(catItems);
    sections.push(`╔══════════════════════════╗`);
    sections.push(`║  ${catNames[cat]}`);
    sections.push(`╚══════════════════════════╝`);
    for (const [key, count] of Object.entries(counts)) {
      sections.push(`  ├─ ${key}${count > 1 ? ` [x${count}]` : ''}`);
    }
    sections.push('');
  }

  sections.push(`\n🔗 ${url}`);
  sections.push(`🔗 ${url}`);
  const body = sections.join('\n');
  return { title, body };
};

// ── 4. Fire & Hype ─────────────────────────────────────────────────────
TEMPLATES.fire = function (grouped, url) {
  const title = '🔥🔥🔥 SELLING CS2 SKINS | BEST PRICES | SEND TRADE 🔥🔥🔥';

  const catEmojis = {
    knife: '⚔️', gloves: '🥊', awp: '🎯', ak47: '💣',
    m4: '⚡', pistol: '💥', agent: '🕶️', other: '🎁',
  };
  const catNames = {
    knife: 'KNIVES', gloves: 'GLOVES', awp: 'AWP SKINS', ak47: 'AK-47 SKINS',
    m4: 'M4 SKINS', pistol: 'PISTOL SKINS', agent: 'AGENTS', other: 'OTHER SKINS',
  };

  const order = ['knife', 'gloves', 'awp', 'ak47', 'm4', 'pistol', 'agent', 'other'];
  const sections = [];
  sections.push(`[h1]🔥🔥🔥 TRADE STORE 🔥🔥🔥[/h1]`);
  sections.push(`\n⬇️⬇️⬇️ SEND TRADE OFFER ⬇️⬇️⬇️`);
  sections.push(`👉 ${url} 👈\n`);

  for (const cat of order) {
    const catItems = grouped[cat];
    if (!catItems || catItems.length === 0) continue;
    const { counts } = countDuplicates(catItems);
    const e = catEmojis[cat];
    sections.push(`${e}${e}${e} ${catNames[cat]} ${e}${e}${e}`);
    for (const [key, count] of Object.entries(counts)) {
      sections.push(`  ▸ ${key}${count > 1 ? ` 【x${count}】` : ''}`);
    }
    sections.push('');
  }

  sections.push(`⬆️⬆️⬆️ SEND TRADE OFFER ⬆️⬆️⬆️`);
  sections.push(`👉 ${url} 👈`);
  sections.push(`👉 ${url} 👈`);
  const body = sections.join('\n');
  return { title, body };
};

// ── 5. Premium Luxury ──────────────────────────────────────────────────
TEMPLATES.premium = function (grouped, url) {
  const title = '✦ Premium CS2 Collection ✦ Skins For Trade ✦';

  const catNames = {
    knife: '𝐊𝐍𝐈𝐕𝐄𝐒', gloves: '𝐆𝐋𝐎𝐕𝐄𝐒', awp: '𝐀𝐖𝐏', ak47: '𝐀𝐊-𝟒𝟕',
    m4: '𝐌𝟒', pistol: '𝐏𝐈𝐒𝐓𝐎𝐋𝐒', agent: '𝐀𝐆𝐄𝐍𝐓𝐒', other: '𝐎𝐓𝐇𝐄𝐑',
  };
  const catIcons = {
    knife: '◆', gloves: '◆', awp: '◇', ak47: '◇',
    m4: '◇', pistol: '○', agent: '○', other: '○',
  };

  const order = ['knife', 'gloves', 'awp', 'ak47', 'm4', 'pistol', 'agent', 'other'];
  const sections = [];
  sections.push(`[h1]✦═══════════════════════════════✦[/h1]`);
  sections.push(`[h1]   ✦ PREMIUM CS2 COLLECTION ✦   [/h1]`);
  sections.push(`[h1]✦═══════════════════════════════✦[/h1]`);
  sections.push(`\n💎 Trade Offer: ${url}\n`);

  for (const cat of order) {
    const catItems = grouped[cat];
    if (!catItems || catItems.length === 0) continue;
    const { counts } = countDuplicates(catItems);
    const icon = catIcons[cat];
    sections.push(`━━━ ${icon} ${catNames[cat]} ${icon} ━━━`);
    for (const [key, count] of Object.entries(counts)) {
      sections.push(`    ✧ ${key}${count > 1 ? ` ×${count}` : ''}`);
    }
    sections.push('');
  }

  sections.push(`\n✦ Trade Offer: ${url}`);
  sections.push(`✦ Trade Offer: ${url}`);
  const body = sections.join('\n');
  return { title, body };
};

// ── 6. Compact List ────────────────────────────────────────────────────
TEMPLATES.compact = function (grouped, url) {
  const title = 'WTS CS2 Skins | Trade Link Inside';

  const catNames = {
    knife: 'Knife', gloves: 'Gloves', awp: 'AWP', ak47: 'AK-47',
    m4: 'M4', pistol: 'Pistols', agent: 'Agents', other: 'Other',
  };

  const order = ['knife', 'gloves', 'awp', 'ak47', 'm4', 'pistol', 'agent', 'other'];
  const allLines = [];
  allLines.push(`Trade: ${url}\n`);

  for (const cat of order) {
    const catItems = grouped[cat];
    if (!catItems || catItems.length === 0) continue;
    const { counts } = countDuplicates(catItems);
    const itemStrs = Object.entries(counts).map(([k, c]) => c > 1 ? `${k} x${c}` : k);
    allLines.push(`[${catNames[cat]}] ${itemStrs.join(' | ')}`);
  }

  allLines.push(`\nTrade: ${url}`);
  const body = allLines.join('\n');
  return { title, body };
};

// ═══════════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════════

const WEAR_RE = /\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*/gi;
// Categories that carry ★ in their market_name (knife/gloves) — prefix already has ★
const STAR_CATS = new Set(['knife', 'gloves']);

function groupItems(items) {
  const groups = {};
  for (const item of items) {
    const cat = item.category || 'other';
    if (!groups[cat]) groups[cat] = [];

    // Формируем отображаемое имя
    let displayName = item.name;

    // Убрать ведущую звёздочку у ножей/перчаток — она уже есть в emoji-префиксе категории
    if (STAR_CATS.has(cat)) {
      displayName = displayName.replace(/^★\s*/, '');
    }

    // Заменить полное название состояния на короткий код (FN/MW/FT/WW/BS)
    // чтобы не получалось «AK-47 | Redline (Field-Tested) FT»
    displayName = displayName.replace(WEAR_RE, '').trim();
    if (item.exterior) displayName += ` ${item.exterior}`;

    groups[cat].push({ ...item, displayName });
  }
  return groups;
}

/** Подсчёт дубликатов с сохранением порядка */
function countDuplicates(catItems) {
  const counts = {};
  for (const item of catItems) {
    const key = item.displayName;
    counts[key] = (counts[key] || 0) + 1;
  }
  return { counts };
}

function formatInventoryForPrompt(grouped) {
  const lines = [];
  for (const [cat, items] of Object.entries(grouped)) {
    lines.push(`[${cat.toUpperCase()}]`);
    const counts = {};
    for (const item of items) {
      counts[item.displayName] = (counts[item.displayName] || 0) + 1;
    }
    for (const [name, count] of Object.entries(counts)) {
      lines.push(`  ${name}${count > 1 ? ` x${count}` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Вызов OpenAI-совместимого Chat Completions API.
 * Поддерживает: OpenAI, OpenRouter, Groq, Together и др.
 */
function callOpenAI(apiKey, messages) {
  const cfg = getOpenAIConfig();
  const parsed = new URL(cfg.baseUrl);

  return new Promise((resolve, reject) => {
    const payload = {
      model: cfg.model,
      messages,
      temperature: 0.7,
      max_tokens: 4000,
    };

    // Для бесплатных моделей OpenRouter — разрешаем сбор данных
    if (parsed.hostname === 'openrouter.ai') {
      payload.provider = { data_collection: 'allow' };
    }

    const body = JSON.stringify(payload);

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(body),
    };

    // OpenRouter требует дополнительные заголовки
    if (parsed.hostname === 'openrouter.ai') {
      headers['HTTP-Referer'] = 'https://steambot.local';
      headers['X-Title'] = 'Steam Poster Bot';
    }

    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     (parsed.pathname === '/' ? '' : parsed.pathname) + '/v1/chat/completions',
      method:   'POST',
      headers,
    };

    logger.info(`[AI] Запрос → ${parsed.hostname} модель=${cfg.model}`);

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            const msg = json.error.message || json.error.code || JSON.stringify(json.error);
            reject(new Error(`AI API: ${msg}`));
            return;
          }
          const content = json.choices?.[0]?.message?.content;
          if (!content) {
            reject(new Error('AI API вернул пустой ответ'));
            return;
          }
          resolve(content);
        } catch (e) {
          reject(new Error(`Ошибка парсинга ответа AI: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Сетевая ошибка AI: ${e.message}`)));
    req.setTimeout(90000, () => {
      req.destroy();
      reject(new Error('Таймаут запроса к AI (90 сек)'));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Вызов Ollama Chat API (локальный).
 */
function callOllama(messages) {
  const cfg = getOllamaConfig();
  const parsed = new URL(cfg.url);

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: cfg.model,
      messages,
      stream: false,
      options: { temperature: 0.7 },
    });

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || 11434,
      path:     '/api/chat',
      method:   'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(`Ollama: ${json.error}`));
            return;
          }
          const content = json.message?.content;
          if (!content) {
            reject(new Error('Ollama вернул пустой ответ'));
            return;
          }
          resolve(content);
        } catch (e) {
          reject(new Error(`Ошибка парсинга ответа Ollama: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Сетевая ошибка Ollama: ${e.message}. Убедитесь, что Ollama запущена.`)));
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('Таймаут запроса к Ollama (120 сек). Локальная модель может работать медленно.'));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Проверка доступности Ollama.
 */
function isOllamaAvailable() {
  const cfg = getOllamaConfig();
  const parsed = new URL(cfg.url);

  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: parsed.hostname,
        port:     parsed.port || 11434,
        path:     '/api/tags',
        method:   'GET',
        timeout:  3000,
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const models = (json.models || []).map(m => m.name);
            resolve({ available: true, models, currentModel: cfg.model });
          } catch {
            resolve({ available: false, models: [], currentModel: cfg.model });
          }
        });
      },
    );
    req.on('error', () => resolve({ available: false, models: [], currentModel: cfg.model }));
    req.on('timeout', () => { req.destroy(); resolve({ available: false, models: [], currentModel: cfg.model }); });
    req.end();
  });
}

/**
 * Сгенерировать пост через Ollama (локальная модель).
 */
async function generatePostOllama({ items, tradeUrl, style = 'emoji' }) {
  // Группировка предметов
  const grouped = groupItems(items);
  const inventoryText = formatInventoryForPrompt(grouped);

  const systemPrompt = `You are a CS2 Steam trading forum post formatter.
You create eye-catching trading posts for Steam Community forums.
The post format uses Steam BBCode ([h1], [b], etc).
Always include the trade URL multiple times throughout the post.
Use emojis to make the post visually appealing.
Group items by category with headers.
Use category-specific emojis: 🔪 for knives, 🧤 for gloves, 💥 for AWP, 😻 for AK-47, 💞 for M4, 🔥 for pistols, 🍀 for agents, 💵 for other items.
Put 💔 around trade URLs.
Wrap the entire post body in [h1]...[/h1] tags.
Use 💎 before category headers.
IMPORTANT: If there are duplicate items, add X2, X3 etc after the item name.
Respond ONLY with JSON: {"title": "...", "body": "..."}
Do NOT add any text before or after the JSON.`;

  const userPrompt = `Generate a Steam CS2 trading forum post.
Trade URL: ${tradeUrl || 'https://steamcommunity.com/tradeoffer/new/?partner=XXXXXXXXX&token=XXXXXXXX'}

Inventory:
${inventoryText}

Style: ${style === 'clean' ? 'Minimal, clean formatting with less emojis' : 'Rich emoji formatting, eye-catching'}

Return ONLY valid JSON with "title" and "body" fields. No extra text.`;

  const response = await callOllama([
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userPrompt },
  ]);

  // Парсим JSON из ответа
  let result;
  try {
    let cleaned = response.trim();
    const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) cleaned = jsonMatch[1].trim();
    // Попробуем найти JSON объект если модель добавила лишний текст
    const braceMatch = cleaned.match(/\{[\s\S]*\}/);
    if (braceMatch) cleaned = braceMatch[0];
    result = JSON.parse(cleaned);
  } catch {
    throw new Error('Ollama вернул некорректный ответ. Попробуйте ещё раз или смените модель.');
  }

  if (!result.title || !result.body) {
    throw new Error('Ollama вернул неполный ответ (нет title или body).');
  }

  return { title: result.title, body: result.body };
}

module.exports = {
  generatePost,
  generatePostLocal,
  generatePostOllama,
  getApiKey,
  getOpenAIConfig,
  getOllamaConfig,
  isOllamaAvailable,
  getTemplateList,
};
