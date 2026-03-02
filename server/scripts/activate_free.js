const db = require('./db');
(async () => {
  await db.pool.query("UPDATE subscription_plans SET is_active = TRUE WHERE id = 'free'");
  const p = await db.getPlan('free');
  console.log('Free plan is_active:', p.is_active);
  process.exit(0);
})();
