'use strict';

const express = require('express');
const db      = require('../db');
const logger  = require('../logger');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/* ═══════ GET MY REFERRAL INFO ═══════ */

router.get('/my', requireAuth, async (req, res) => {
  try {
    let code = await db.getUserReferralCode(req.userId);
    if (!code) {
      code = await db.generateReferralCode(req.userId);
    }
    const stats = await db.getReferralStats(req.userId);
    const partner = await db.getPartnerReferralByUserId(req.userId);

    res.json({
      code,
      link: `${req.protocol}://${req.get('host')}/register?ref=${code}`,
      stats,
      partner: partner ? {
        id: partner.id,
        code: partner.code,
        label: partner.label,
        commissionPercent: parseFloat(partner.commission_percent),
        totalReferrals: partner.total_referrals,
        totalEarnings: partner.total_earnings,
        isActive: partner.is_active,
      } : null,
    });
  } catch (err) {
    logger.error('referrals/my error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ═══════ GENERATE CODE (if not exists) ═══════ */

router.post('/generate', requireAuth, async (req, res) => {
  try {
    let code = await db.getUserReferralCode(req.userId);
    if (!code) {
      code = await db.generateReferralCode(req.userId);
    }
    res.json({ code });
  } catch (err) {
    logger.error('referrals/generate error', { err: err.message });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ═══════ PARTNER EARNINGS ═══════ */

router.get('/earnings', requireAuth, async (req, res) => {
  try {
    const partner = await db.getPartnerReferralByUserId(req.userId);
    if (!partner) return res.json({ earnings: [], total: 0 });
    const earnings = await db.getPartnerEarnings(partner.id);
    res.json({ earnings, total: partner.total_earnings });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
