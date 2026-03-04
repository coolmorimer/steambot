const db = require('/app/server/db');
(async () => {
  try {
    const r = await db.query(
      "SELECT j.id, j.status, j.scheduled_at, j.error, p.name as pname FROM jobs j LEFT JOIN profiles p ON j.profile_id = p.id WHERE j.status = 'failed' ORDER BY j.created_at DESC LIMIT 15"
    );
    r.rows.forEach(j => {
      console.log('ID:', j.id, '| AT:', j.scheduled_at, '| PROFILE:', j.pname, '| ERR:', (j.error || '').substring(0, 200));
    });
    console.log('--- TOTAL FAILED:', r.rows.length);

    const p = await db.query(
      "SELECT j.id, j.status, j.scheduled_at, p.name as pname FROM jobs j LEFT JOIN profiles p ON j.profile_id = p.id WHERE j.status = 'pending' ORDER BY j.scheduled_at ASC LIMIT 10"
    );
    console.log('--- PENDING:', p.rows.length);
    p.rows.forEach(j => {
      console.log('ID:', j.id, '| AT:', j.scheduled_at, '| PROFILE:', j.pname);
    });

    const d = await db.query(
      "SELECT j.id, j.status, j.scheduled_at, p.name as pname FROM jobs j LEFT JOIN profiles p ON j.profile_id = p.id WHERE j.status = 'done' ORDER BY j.created_at DESC LIMIT 5"
    );
    console.log('--- DONE:', d.rows.length);
    d.rows.forEach(j => {
      console.log('ID:', j.id, '| AT:', j.scheduled_at, '| PROFILE:', j.pname);
    });
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    process.exit(0);
  }
})();
