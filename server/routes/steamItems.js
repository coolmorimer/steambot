'use strict';

const express = require('express');
const https   = require('https');
const zlib    = require('zlib');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── Buff163 prices via CSGOTrader public mirror ──
const BUFF_JSON_URL    = 'https://prices.csgotrader.app/latest/buff163.json';
const EXCHANGE_RATE_URL = 'https://open.er-api.com/v6/latest/USD';

let buffPrices   = null;   // { "item name": { starting_at: {price}, highest_order: {price} } }
let buffLoadedAt = 0;
const BUFF_TTL   = 30 * 60 * 1000; // reload every 30 min

let usdToRub     = 90;    // fallback rate
let rateLoadedAt = 0;
const RATE_TTL   = 60 * 60 * 1000; // reload every 1 hour

// In-memory cache for search / price results (TTL = 10 min)
const cache     = new Map();
const CACHE_TTL = 10 * 60 * 1000;

/* ── helpers ─────────────────────────────────────────────── */

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Encoding': 'gzip, deflate',
      }
    }, (res) => {
      // Handle gzip / deflate from CDNs (CloudFront etc.)
      let stream = res;
      const encoding = (res.headers['content-encoding'] || '').toLowerCase();
      if (encoding === 'gzip')    stream = res.pipe(zlib.createGunzip());
      else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());
      else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());

      let body = '';
      stream.on('data', c => body += c);
      stream.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
      stream.on('error', () => resolve(null));
    }).on('error', reject);
  });
}

/** Load buff163 prices from CSGOTrader mirror (≈40 k items) */
async function ensureBuffPrices() {
  if (buffPrices && Date.now() - buffLoadedAt < BUFF_TTL) return;
  try {
    console.log('[BUFF] Loading buff163 prices from CSGOTrader …');
    const data = await fetchJSON(BUFF_JSON_URL);
    if (data && typeof data === 'object') {
      buffPrices   = data;
      buffLoadedAt = Date.now();
      console.log(`[BUFF] Loaded ${Object.keys(data).length} items`);
    }
  } catch (err) {
    console.error('[BUFF] Failed to load buff163 prices:', err.message);
  }
}

/** Load USD → RUB exchange rate */
async function ensureExchangeRate() {
  if (Date.now() - rateLoadedAt < RATE_TTL) return;
  try {
    const data = await fetchJSON(EXCHANGE_RATE_URL);
    if (data?.rates?.RUB) {
      usdToRub     = data.rates.RUB;
      rateLoadedAt = Date.now();
      console.log(`[BUFF] USD→RUB rate: ${usdToRub}`);
    }
  } catch (err) {
    console.error('[BUFF] Failed to load exchange rate:', err.message);
  }
}

/** Convert USD price → formatted RUB string "1 234,56 pуб." (parseRubPrice-compatible) */
function usdToRubStr(usdPrice) {
  if (!usdPrice || usdPrice <= 0) return null;
  const rub = usdPrice * usdToRub;
  const parts = rub.toFixed(2).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${intPart},${parts[1]} pуб.`;
}

/** Lookup buff163 price object for a market_hash_name */
function getBuffPrice(name) {
  if (!buffPrices) return null;
  const item = buffPrices[name];
  if (!item) return null;
  const sa = item.starting_at?.price  ?? null;
  const ho = item.highest_order?.price ?? null;
  // Use starting_at, fall back to highest_order
  const bestPrice = sa ?? ho;
  return { starting_at: bestPrice, highest_order: ho ?? sa };
}

/** Fetch single price from Steam Community Market (fallback) */
function fetchSteamPrice(name) {
  const url = `https://steamcommunity.com/market/priceoverview/?appid=730&currency=5&market_hash_name=${encodeURIComponent(name)}`;
  return fetchJSON(url);
}

/* ── routes ──────────────────────────────────────────────── */

/** Search CS2 items on Steam Community Market (prices replaced with buff163) */
router.get('/search', requireAuth, async (req, res) => {
  try {
    const { q = '', start = 0, count = 30, category } = req.query;
    const query = q.trim();
    if (!query && !category) {
      return res.json({ items: [], total: 0 });
    }

    const cacheKey = `search:${query}:${start}:${count}:${category || ''}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return res.json(cached.data);
    }

    // Ensure buff163 prices & exchange rate are loaded
    await Promise.all([ensureBuffPrices(), ensureExchangeRate()]);

    // Steam Community Market search API (for images, names, categories)
    const params = new URLSearchParams({
      appid: '730',
      norender: '1',
      count: String(Math.min(parseInt(count) || 30, 100)),
      start: String(parseInt(start) || 0),
      search_descriptions: '0',
      sort_column: 'popular',
      sort_dir: 'desc',
      l: 'russian',
      currency: '5',
    });
    if (query) params.set('query', query);

    // Category filters (weapon type) — CS2 uses CSGO_ prefix in tags
    if (category) {
      const categoryMap = {
        knife:      'tag_CSGO_Type_Knife',
        gloves:     'tag_Type_Hands',
        rifle:      'tag_CSGO_Type_Rifle',
        pistol:     'tag_CSGO_Type_Pistol',
        smg:        'tag_CSGO_Type_SMG',
        shotgun:    'tag_CSGO_Type_Shotgun',
        machinegun: 'tag_CSGO_Type_Machinegun',
        sniper:     'tag_CSGO_Type_SniperRifle',
      };
      if (categoryMap[category]) {
        params.set('category_730_Type[]', categoryMap[category]);
      }
    }

    const url = `https://steamcommunity.com/market/search/render/?${params}`;
    const data = await fetchJSON(url);

    if (!data || !data.success) {
      return res.json({ items: [], total: 0 });
    }

    const items = (data.results || []).map(r => {
      const imgHash = r.asset_description?.icon_url || '';
      const name      = r.hash_name || r.name || '';
      const buff      = getBuffPrice(name);
      const buffPrice = buff?.starting_at ?? null;
      const buffRub   = buffPrice ? usdToRubStr(buffPrice) : null;
      return {
        name,
        image: imgHash ? `https://community.cloudflare.steamstatic.com/economy/image/${imgHash}` : '',
        type: r.asset_description?.type || '',
        rarity: '',
        exterior: extractExterior(name),
        sell_price: buffPrice
          ? Math.round(buffPrice * usdToRub * 100)
          : (r.sell_price || 0),
        sell_price_text: buffRub || r.sell_price_text || '',
        sell_listings: r.sell_listings || 0,
      };
    });

    const result = { items, total: data.total_count || items.length };
    cache.set(cacheKey, { ts: Date.now(), data: result });

    res.json(result);
  } catch (err) {
    console.error('Steam items search error:', err.message);
    res.status(500).json({ error: 'Ошибка поиска предметов' });
  }
});

/** Get buff163 price for a specific item by market_hash_name */
router.get('/price', requireAuth, async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'Укажите name' });

    const cacheKey = `price:${name}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return res.json(cached.data);
    }

    await Promise.all([ensureBuffPrices(), ensureExchangeRate()]);

    const buff = getBuffPrice(name);
    let result;
    if (buff?.starting_at) {
      result = {
        success: true,
        lowest_price:  usdToRubStr(buff.starting_at),
        median_price:  buff.highest_order ? usdToRubStr(buff.highest_order) : null,
        volume: null,
      };
    } else {
      // Fallback: Steam Community Market
      const data = await fetchSteamPrice(name);
      result = {
        success: data?.success || false,
        lowest_price: data?.lowest_price || null,
        median_price: data?.median_price || null,
        volume: data?.volume || null,
      };
    }
    cache.set(cacheKey, { ts: Date.now(), data: result });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения цены' });
  }
});

/** Batch buff163 price lookup — up to 50 items at once (instant, no rate-limit delays) */
router.post('/prices', requireAuth, async (req, res) => {
  try {
    const { names } = req.body;
    if (!Array.isArray(names) || !names.length) return res.json({});
    const uniqueNames = [...new Set(names)].slice(0, 50);

    await Promise.all([ensureBuffPrices(), ensureExchangeRate()]);

    const results  = {};
    const toSteam  = [];  // items not found in BUFF — fallback

    for (const name of uniqueNames) {
      const cacheKey = `price:${name}`;
      const cached   = cache.get(cacheKey);
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        results[name] = cached.data;
        continue;
      }

      const buff = getBuffPrice(name);
      if (buff?.starting_at) {
        const result = {
          success: true,
          lowest_price:  usdToRubStr(buff.starting_at),
          median_price:  buff.highest_order ? usdToRubStr(buff.highest_order) : null,
          volume: null,
        };
        cache.set(cacheKey, { ts: Date.now(), data: result });
        results[name] = result;
      } else {
        toSteam.push(name);
      }
    }

    // Fallback: fetch missing prices from Steam Market (sequentially, rate-limited)
    for (const name of toSteam) {
      try {
        const data = await fetchSteamPrice(name);
        const result = {
          success: data?.success || false,
          lowest_price: data?.lowest_price || null,
          median_price: data?.median_price || null,
          volume: data?.volume || null,
        };
        cache.set(`price:${name}`, { ts: Date.now(), data: result });
        results[name] = result;
        if (toSteam.indexOf(name) < toSteam.length - 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      } catch {
        results[name] = { success: false, lowest_price: null, median_price: null, volume: null };
      }
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения цен' });
  }
});

function extractExterior(name) {
  const match = name.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)/);
  return match ? match[1] : '';
}

module.exports = router;
