'use strict';

/**
 * server/routes/oauth.js
 *
 * Steam OpenID 2.0 + Google OAuth 2.0 авторизация.
 * После успешного входа — редирект на фронтенд с токенами.
 */

const express = require('express');
const crypto  = require('crypto');
const https   = require('https');
const http    = require('http');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const config  = require('../config');
const db      = require('../db');
const logger  = require('../logger');

const router = express.Router();

/* ── helpers ────────────────────────────────────────────────────────────── */

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    config.jwt.secret, { expiresIn: config.jwt.expiresIn },
  );
}

function signRefreshToken()  { return crypto.randomBytes(40).toString('hex'); }
function hashToken(t)        { return crypto.createHash('sha256').update(t).digest('hex'); }
function refreshExpiresAt()  { const d = parseInt(config.jwt.refreshExpiresIn) || 30; return new Date(Date.now() + d * 86400000).toISOString(); }
function randomPassword()    { return bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10); }

/** Issue tokens + redirect to frontend with tokens in hash */
async function issueAndRedirect(res, user, req) {
  const accessToken  = signAccessToken(user);
  const refreshToken = signRefreshToken();
  const ip = req.ip || req.connection?.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';

  await db.createRefreshToken(user.id, hashToken(refreshToken), refreshExpiresAt(), { ip, ua });
  await db.updateLastLogin(user.id);

  // Redirect to frontend — tokens passed via hash fragment (not in query to avoid server logs)
  const params = new URLSearchParams({
    access_token:  accessToken,
    refresh_token: refreshToken,
  });
  res.redirect(`${config.appUrl}/oauth-callback#${params.toString()}`);
}

/* ═══════════════════════════════════════════════════════════════════════
   STEAM OpenID 2.0
   ═══════════════════════════════════════════════════════════════════════ */

const STEAM_OPENID = 'https://steamcommunity.com/openid/login';

router.get('/steam', (req, res) => {
  // If link_token is provided, user wants to link Steam to existing account
  let returnTo = `${config.appUrl}/api/oauth/steam/callback`;
  if (req.query.link_token) {
    try {
      const payload = jwt.verify(req.query.link_token, config.jwt.secret);
      // Create a short-lived link token (5 min) with just user ID
      const linkToken = jwt.sign({ link_user_id: payload.sub }, config.jwt.secret, { expiresIn: '5m' });
      returnTo += `?link_token=${encodeURIComponent(linkToken)}`;
    } catch (e) {
      logger.warn('Invalid link_token for Steam link', { err: e.message });
    }
  }
  const params = new URLSearchParams({
    'openid.ns':         'http://specs.openid.net/auth/2.0',
    'openid.mode':       'checkid_setup',
    'openid.return_to':  returnTo,
    'openid.realm':      config.appUrl,
    'openid.identity':   'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  res.redirect(`${STEAM_OPENID}?${params.toString()}`);
});

router.get('/steam/callback', async (req, res) => {
  try {
    const query = req.query;
    if (query['openid.mode'] !== 'id_res') {
      return res.redirect(`${config.appUrl}/login?error=steam_cancelled`);
    }

    // Verify assertion with Steam
    const verifyParams = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      verifyParams.append(k, v);
    }
    verifyParams.set('openid.mode', 'check_authentication');

    const verified = await new Promise((resolve, reject) => {
      const postData = verifyParams.toString();
      const reqOpts = {
        hostname: 'steamcommunity.com',
        path: '/openid/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      };
      const hreq = https.request(reqOpts, (hres) => {
        let body = '';
        hres.on('data', c => body += c);
        hres.on('end', () => resolve(body.includes('is_valid:true')));
      });
      hreq.on('error', reject);
      hreq.write(postData);
      hreq.end();
    });

    if (!verified) {
      return res.redirect(`${config.appUrl}/login?error=steam_verify_failed`);
    }

    // Extract SteamID from claimed_id
    const claimedId = query['openid.claimed_id'] || '';
    const match = claimedId.match(/\/openid\/id\/(\d+)$/);
    if (!match) {
      return res.redirect(`${config.appUrl}/login?error=steam_no_id`);
    }
    const steamId = match[1];

    // Fetch Steam profile
    let steamUsername = `Steam_${steamId.slice(-6)}`;
    let steamAvatar   = '';
    if (config.steam.apiKey) {
      try {
        const profileData = await fetchJSON(
          `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${config.steam.apiKey}&steamids=${steamId}`
        );
        const player = profileData?.response?.players?.[0];
        if (player) {
          steamUsername = player.personaname || steamUsername;
          steamAvatar   = player.avatarfull || player.avatar || '';
        }
      } catch (e) {
        logger.warn('Steam profile fetch failed', { steamId, err: e.message });
      }
    }

    // Check if this is a "link to existing account" flow
    let linkUserId = null;
    const linkToken = req.query.link_token;
    if (linkToken) {
      try {
        const lp = jwt.verify(linkToken, config.jwt.secret);
        linkUserId = lp.link_user_id;
      } catch (e) {
        logger.warn('Invalid/expired link_token in Steam callback', { err: e.message });
      }
    }

    // Find or create user
    let user = await db.getUserBySteamId(steamId);
    if (!user && linkUserId) {
      // Link Steam to existing account
      user = await db.getUserById(linkUserId);
      if (user) {
        await db.updateUser(user.id, {
          steam_id: steamId,
          steam_username: steamUsername,
          steam_avatar: steamAvatar,
        });
        user = await db.getUserById(user.id);
        await db.auditLog(user.id, 'link_steam', 'user', user.id, { steamId }, req.ip);
        logger.info('Steam привязан к аккаунту', { userId: user.id, steamId, name: steamUsername });
      }
    } else if (!user) {
      // Create new account via Steam
      const userId = await db.createUser({
        email: `steam_${steamId}@steambot.local`,
        passwordHash: randomPassword(),
        name: steamUsername,
        steamId,
        steamUsername,
        steamAvatar,
      });
      await db.createSubscription({ userId, planId: 'free', status: 'trial', trialDays: config.trialDays });
      user = await db.getUserById(userId);
      await db.auditLog(userId, 'register_steam', 'user', userId, { steamId }, req.ip);
      logger.info('Новый пользователь (Steam)', { userId, steamId, name: steamUsername });
    } else {
      // Update Steam profile info
      await db.updateUser(user.id, { steam_username: steamUsername, steam_avatar: steamAvatar });
    }

    await issueAndRedirect(res, user, req);
  } catch (err) {
    logger.error('Steam OAuth error', { err: err.message });
    res.redirect(`${config.appUrl}/login?error=steam_error`);
  }
});

/* Google OAuth removed */

/* ═══════════════════════════════════════════════════════════════════════
   Link Steam to existing account (authenticated)
   ═══════════════════════════════════════════════════════════════════════ */

const { requireAuth } = require('../middleware/auth');

router.post('/link-steam', requireAuth, async (req, res) => {
  try {
    const { trade_url } = req.body;
    const updates = {};
    if (trade_url !== undefined) updates.trade_url = trade_url;
    if (Object.keys(updates).length) {
      await db.updateUser(req.userId, updates);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ── Utility: fetch JSON ───────────────────────────────────────────── */

function fetchJSON(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const mod = parsedUrl.protocol === 'https:' ? https : http;
    const reqOpts = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
    };
    const hreq = mod.request(reqOpts, (hres) => {
      let body = '';
      hres.on('data', c => body += c);
      hres.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(null); }
      });
    });
    hreq.on('error', reject);
    if (opts.body) hreq.write(opts.body);
    hreq.end();
  });
}

module.exports = router;
