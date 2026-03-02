'use strict';

const express = require('express');
const https   = require('https');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// In-memory cache for Steam Market search results (TTL = 10 min)
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    }).on('error', reject);
  });
}

/** Search CS2 items on Steam Community Market */
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

    // Steam Community Market search API
    const params = new URLSearchParams({
      appid: '730',
      norender: '1',
      count: String(Math.min(parseInt(count) || 30, 100)),
      start: String(parseInt(start) || 0),
      search_descriptions: '0',
      sort_column: 'popular',
      sort_dir: 'desc',
      l: 'russian',
      currency: '5',  // RUB
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
      return {
        name: r.hash_name || r.name || '',
        image: imgHash ? `https://community.cloudflare.steamstatic.com/economy/image/${imgHash}` : '',
        type: r.asset_description?.type || '',
        rarity: '',
        exterior: extractExterior(r.hash_name || ''),
        sell_price: r.sell_price || 0,
        sell_price_text: r.sell_price_text || '',
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

/** Get price for a specific item by market_hash_name */
router.get('/price', requireAuth, async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'Укажите name' });

    const cacheKey = `price:${name}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return res.json(cached.data);
    }

    const url = `https://steamcommunity.com/market/priceoverview/?appid=730&currency=5&market_hash_name=${encodeURIComponent(name)}`;
    const data = await fetchJSON(url);

    const result = {
      success: data?.success || false,
      lowest_price: data?.lowest_price || null,
      median_price: data?.median_price || null,
      volume: data?.volume || null,
    };
    cache.set(cacheKey, { ts: Date.now(), data: result });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения цены' });
  }
});

function extractExterior(name) {
  const match = name.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)/);
  return match ? match[1] : '';
}

module.exports = router;
