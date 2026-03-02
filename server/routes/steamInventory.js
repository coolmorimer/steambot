'use strict';

const express = require('express');
const https   = require('https');
const config  = require('../config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/** Fetch Steam inventory for a given SteamID64 */
router.get('/:steamId', requireAuth, async (req, res) => {
  try {
    const { steamId } = req.params;
    if (!/^\d{17}$/.test(steamId)) return res.status(400).json({ error: 'Invalid Steam ID' });

    const appId  = 730; // CS2
    const contextId = 2;
    const url = `https://steamcommunity.com/inventory/${steamId}/${appId}/${contextId}?l=english&count=500`;

    const data = await new Promise((resolve, reject) => {
      https.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      }, (hres) => {
        let body = '';
        hres.on('data', c => body += c);
        hres.on('end', () => {
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        });
      }).on('error', reject);
    });

    if (!data || data.success === false) {
      return res.status(400).json({ error: 'Не удалось загрузить инвентарь. Убедитесь, что он публичный.' });
    }

    // Parse items
    const descriptions = data.descriptions || [];
    const assets = data.assets || [];

    const items = assets.map(asset => {
      const desc = descriptions.find(d =>
        d.classid === asset.classid && d.instanceid === asset.instanceid
      );
      if (!desc) return null;
      if (!desc.tradable) return null; // Only tradable items

      // Determine exterior from tags
      let exterior = '';
      let type = '';
      let rarity = '';
      for (const tag of (desc.tags || [])) {
        if (tag.category === 'Exterior') exterior = tag.localized_tag_name || tag.name || '';
        if (tag.category === 'Type') type = tag.localized_tag_name || tag.name || '';
        if (tag.category === 'Rarity') rarity = tag.localized_tag_name || tag.name || '';
      }

      return {
        asset_id: asset.assetid,
        name: desc.market_hash_name || desc.name || '',
        image: desc.icon_url ? `https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}` : '',
        exterior,
        type,
        rarity,
        tradable: !!desc.tradable,
        marketable: !!desc.marketable,
      };
    }).filter(Boolean);

    res.json({ items, total: items.length });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки инвентаря' });
  }
});

module.exports = router;
