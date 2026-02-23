'use strict';

/**
 * inventory.js — Получение инвентаря CS2 аккаунта через Steam API.
 *
 * Использует Playwright с куки профиля для загрузки инвентаря.
 * Парсит предметы и группирует по категориям.
 */

const { chromium } = require('playwright');
const logger       = require('./logger');

const REAL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/121.0.0.0 Safari/537.36';

// CS2 App Id
const CS2_APP_ID = '730';
const CS2_CTX    = '2';

/**
 * Получить инвентарь CS2 для профиля.
 * @param {object} profile — запись из таблицы profiles (с cookies)
 * @returns {Promise<{items: object[], tradeUrl: string|null, steamId: string|null}>}
 */
async function fetchInventory(profile) {
  const browser = await chromium.launch({ headless: true, slowMo: 50 });

  try {
    const context = await browser.newContext({ userAgent: REAL_UA });
    await context.addCookies(profile.cookies);
    const page = await context.newPage();

    // ── 1. Открыть профиль Steam чтобы узнать steamid ──────────────────
    logger.info(`[${profile.name}] Получаю steamid...`);
    await page.goto('https://steamcommunity.com/my/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    const profileUrl = page.url();
    if (profileUrl.includes('/login')) {
      throw new Error('SESSION_EXPIRED');
    }

    // Извлечь steamid из g_steamID или из URL
    let steamId = await page.evaluate(() => {
      // eslint-disable-next-line no-undef
      if (typeof g_steamID !== 'undefined') return g_steamID;
      // eslint-disable-next-line no-undef
      if (typeof g_rgProfileData !== 'undefined' && g_rgProfileData.steamid) return g_rgProfileData.steamid;
      return null;
    });

    if (!steamId) {
      // Попробуем достать из data-miniprofile или URL
      const match = profileUrl.match(/\/profiles\/(\d+)/);
      if (match) steamId = match[1];
    }

    if (!steamId) {
      throw new Error('Не удалось определить Steam ID');
    }
    logger.info(`[${profile.name}] SteamID: ${steamId}`);

    // ── 2. Получить trade URL ──────────────────────────────────────────
    let tradeUrl = null;
    try {
      await page.goto(`https://steamcommunity.com/profiles/${steamId}/tradeoffers/privacy`, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      tradeUrl = await page.evaluate(() => {
        const input = document.querySelector('#trade_offer_access_url');
        return input ? input.value : null;
      });
      logger.info(`[${profile.name}] Trade URL: ${tradeUrl || 'не найден'}`);
    } catch (e) {
      logger.warn(`[${profile.name}] Не удалось получить trade URL: ${e.message}`);
    }

    // ── 3. Загрузить инвентарь через JSON API ──────────────────────────
    logger.info(`[${profile.name}] Загружаю инвентарь CS2...`);
    const items = [];
    let startAssetId = null;
    let hasMore = true;

    while (hasMore) {
      let url = `https://steamcommunity.com/inventory/${steamId}/${CS2_APP_ID}/${CS2_CTX}?l=english&count=500`;
      if (startAssetId) url += `&start_assetid=${startAssetId}`;

      const response = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      const json = await response.json();

      if (!json.success) {
        if (json.Error) throw new Error(`Steam error: ${json.Error}`);
        throw new Error('Не удалось загрузить инвентарь');
      }

      const descriptions = {};
      for (const desc of (json.descriptions || [])) {
        descriptions[`${desc.classid}_${desc.instanceid}`] = desc;
      }

      for (const asset of (json.assets || [])) {
        const key = `${asset.classid}_${asset.instanceid}`;
        const desc = descriptions[key];
        if (!desc) continue;

        // Пропустить ящики, капсулы, и прочее (оставляем только "трейдабельные" предметы)
        if (!desc.tradable) continue;

        items.push({
          name:       desc.market_name || desc.name,
          type:       desc.type || '',
          rarity:     extractRarity(desc),
          category:   categorize(desc),
          exterior:   extractExterior(desc.market_name || desc.name),
          stattrak:   (desc.market_name || '').includes('StatTrak'),
          souvenir:   (desc.market_name || '').includes('Souvenir'),
        });
      }

      hasMore = !!json.more_items;
      startAssetId = json.last_assetid || null;

      // Минимальная пауза между запросами
      await new Promise(r => setTimeout(r, 500));
    }

    logger.info(`[${profile.name}] Получено предметов: ${items.length}`);

    return { items, tradeUrl, steamId };
  } finally {
    await browser.close();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Классификация предметов
// ═══════════════════════════════════════════════════════════════════════════

function categorize(desc) {
  const type = (desc.type || '').toLowerCase();
  const name = (desc.market_name || desc.name || '').toLowerCase();
  const tags  = desc.tags || [];

  // Проверяем теги Steam
  for (const tag of tags) {
    const cat = (tag.category || '').toLowerCase();
    const val = (tag.localized_tag_name || tag.name || '').toLowerCase();

    if (cat === 'weapon' || cat === 'type') {
      if (val.includes('knife') || val.includes('нож'))     return 'knife';
      if (val.includes('gloves') || val.includes('перч'))   return 'gloves';
      if (val.includes('agent') || val.includes('агент'))   return 'agent';
    }
  }

  // По имени и типу
  if (name.includes('knife') || name.includes('karambit') || name.includes('bayonet') ||
      name.includes('butterfly') || name.includes('navaja') || name.includes('talon') ||
      name.includes('skeleton') || name.includes('stiletto') || name.includes('nomad') ||
      name.includes('falchion') || name.includes('bowie') || name.includes('flip knife') ||
      name.includes('gut knife') || name.includes('huntsman') || name.includes('shadow daggers') ||
      name.includes('ursus') || name.includes('paracord') || name.includes('survival') ||
      name.includes('classic knife') || name.includes('kukri'))                    return 'knife';
  if (type.includes('gloves') || name.includes('gloves') || name.includes('wraps'))return 'gloves';
  if (type.includes('agent') || name.includes('agent') || type.includes('customplayer')) return 'agent';
  if (name.startsWith('awp'))                                                       return 'awp';
  if (name.startsWith('ak-47'))                                                     return 'ak47';
  if (name.startsWith('m4a1-s') || name.startsWith('m4a4'))                         return 'm4';
  if (name.startsWith('desert eagle') || name.startsWith('glock') ||
      name.startsWith('usp-s') || name.startsWith('p250') ||
      name.startsWith('five-seven') || name.startsWith('tec-9') ||
      name.startsWith('cz75') || name.startsWith('r8 revolver') ||
      name.startsWith('dual berettas'))                                            return 'pistol';
  if (name.startsWith('ssg 08') || name.startsWith('scar-20') ||
      name.startsWith('g3sg1'))                                                    return 'other';

  return 'other';
}

function extractExterior(name) {
  if (!name) return '';
  const m = name.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)/i);
  if (m) {
    const map = {
      'factory new': 'FN', 'minimal wear': 'MW', 'field-tested': 'FT',
      'well-worn': 'WW', 'battle-scarred': 'BS'
    };
    return map[m[1].toLowerCase()] || m[1];
  }
  // Короткие суффиксы
  const s = name.match(/\b(FN|MW|FT|WW|BS)\s*$/);
  return s ? s[1] : '';
}

function extractRarity(desc) {
  const tags = desc.tags || [];
  for (const tag of tags) {
    if ((tag.category || '').toLowerCase() === 'rarity') {
      return tag.localized_tag_name || tag.name || '';
    }
  }
  return '';
}

module.exports = { fetchInventory };
